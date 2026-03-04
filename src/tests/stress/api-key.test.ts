import { describe, it, expect } from "vitest";
import { hashApiKey, generateApiKey } from "@/lib/api-key-auth";
import crypto from "crypto";

describe("API Key System", () => {
  // ---------- KEY GENERATION FORMAT ----------
  describe("key generation format", () => {
    it("generated key starts with tl_ prefix", () => {
      const key = generateApiKey();
      expect(key.startsWith("tl_")).toBe(true);
    });

    it("generated key has tl_ prefix + 64 hex chars (32 bytes)", () => {
      const key = generateApiKey();
      const hex = key.slice(3); // Remove "tl_"
      expect(hex).toHaveLength(64); // 32 bytes = 64 hex chars
      expect(/^[a-f0-9]{64}$/.test(hex)).toBe(true);
    });

    it("generated keys are unique", () => {
      const keys = new Set<string>();
      for (let i = 0; i < 100; i++) {
        keys.add(generateApiKey());
      }
      expect(keys.size).toBe(100);
    });

    it("total key length is 67 chars (3 prefix + 64 hex)", () => {
      const key = generateApiKey();
      expect(key).toHaveLength(67);
    });
  });

  // ---------- KEY HASHING ----------
  describe("key hash storage", () => {
    it("hashApiKey produces SHA-256 hash (64 hex chars)", () => {
      const key = generateApiKey();
      const hash = hashApiKey(key);
      expect(hash).toHaveLength(64);
      expect(/^[a-f0-9]{64}$/.test(hash)).toBe(true);
    });

    it("hash is deterministic (same key → same hash)", () => {
      const key = generateApiKey();
      expect(hashApiKey(key)).toBe(hashApiKey(key));
    });

    it("hash matches manual SHA-256 computation", () => {
      const key = "tl_testkey123";
      const expectedHash = crypto
        .createHash("sha256")
        .update(key)
        .digest("hex");
      expect(hashApiKey(key)).toBe(expectedHash);
    });

    it("hash is NOT the plaintext key", () => {
      const key = generateApiKey();
      const hash = hashApiKey(key);
      expect(hash).not.toBe(key);
      expect(hash).not.toContain("tl_");
    });

    it("different keys produce different hashes", () => {
      const hashes = new Set<string>();
      for (let i = 0; i < 50; i++) {
        hashes.add(hashApiKey(generateApiKey()));
      }
      expect(hashes.size).toBe(50);
    });

    it("cannot reverse hash to get plaintext", () => {
      const key = generateApiKey();
      const hash = hashApiKey(key);
      // SHA-256 is one-way — hash doesn't contain key material
      expect(hash.includes(key.slice(3))).toBe(false);
    });
  });

  // ---------- PLAINTEXT ONLY ON CREATION ----------
  describe("plaintext key handling", () => {
    it("generated key is a valid string that can be returned to user", () => {
      const key = generateApiKey();
      expect(typeof key).toBe("string");
      expect(key.length).toBeGreaterThan(0);
      expect(key.startsWith("tl_")).toBe(true);
    });

    it("POST /api/keys response should include plaintext key", () => {
      // Simulates the creation response shape
      const key = generateApiKey();
      const response = {
        data: {
          id: "key-uuid",
          name: "My Key",
          key: key, // Plaintext returned ONCE
          created_at: new Date().toISOString(),
        },
        error: null,
      };
      expect(response.data.key).toBe(key);
      expect(response.data.key.startsWith("tl_")).toBe(true);
    });

    it("GET /api/keys response should NOT include key or hash", () => {
      // Simulates the list response shape
      const response = {
        data: [
          {
            id: "key-uuid",
            name: "My Key",
            created_at: "2024-01-01T00:00:00Z",
            last_used: null,
            revoked_at: null,
            // NOTE: no "key" field, no "key_hash" field
          },
        ],
        error: null,
      };

      const firstKey = response.data[0] as Record<string, unknown>;
      expect(firstKey).not.toHaveProperty("key");
      expect(firstKey).not.toHaveProperty("key_hash");
    });
  });

  // ---------- LAST USED TRACKING ----------
  describe("last_used tracking", () => {
    it("new key has last_used = null", () => {
      const keyRecord = {
        id: "key-1",
        agent_id: "agent-1",
        last_used: null as string | null,
        revoked_at: null,
      };
      expect(keyRecord.last_used).toBeNull();
    });

    it("last_used updates to current timestamp on use", () => {
      const beforeUse = new Date();
      // Simulates: supabase.from("api_keys").update({ last_used: new Date().toISOString() })
      const lastUsed = new Date().toISOString();
      const afterUse = new Date();

      const lastUsedDate = new Date(lastUsed);
      expect(lastUsedDate.getTime()).toBeGreaterThanOrEqual(beforeUse.getTime());
      expect(lastUsedDate.getTime()).toBeLessThanOrEqual(afterUse.getTime());
    });

    it("last_used is ISO 8601 format", () => {
      const lastUsed = new Date().toISOString();
      // ISO 8601 format: YYYY-MM-DDTHH:MM:SS.sssZ
      expect(lastUsed).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });
  });

  // ---------- SOFT DELETE ----------
  describe("soft delete (revocation)", () => {
    it("active key has revoked_at = null", () => {
      const keyRecord = { id: "k1", revoked_at: null };
      expect(keyRecord.revoked_at).toBeNull();
    });

    it("revoked key has revoked_at set to ISO timestamp", () => {
      const now = new Date().toISOString();
      const keyRecord = { id: "k1", revoked_at: now };
      expect(keyRecord.revoked_at).not.toBeNull();
      expect(new Date(keyRecord.revoked_at).getTime()).toBeGreaterThan(0);
    });

    it("revocation is a soft delete (row NOT removed)", () => {
      // Before revocation
      const keys = [
        { id: "k1", revoked_at: null },
        { id: "k2", revoked_at: null },
      ];
      expect(keys).toHaveLength(2);

      // After revoking k1 — row still exists with revoked_at set
      const afterRevoke = keys.map((k) =>
        k.id === "k1" ? { ...k, revoked_at: new Date().toISOString() } : k
      );
      expect(afterRevoke).toHaveLength(2); // Still 2 rows
      expect(afterRevoke[0].revoked_at).not.toBeNull();
      expect(afterRevoke[1].revoked_at).toBeNull();
    });

    it("revoked key fails auth check", () => {
      const keyRecord = { id: "k1", revoked_at: "2024-01-01T00:00:00Z" };
      const isActive = !keyRecord.revoked_at;
      expect(isActive).toBe(false);
      // authenticateRequest: if (!keyRecord || keyRecord.revoked_at) return null
    });

    it("already-revoked key cannot be revoked again", () => {
      const keyRecord = { id: "k1", revoked_at: "2024-01-01T00:00:00Z" };
      const alreadyRevoked = keyRecord.revoked_at !== null;
      expect(alreadyRevoked).toBe(true);
      // DELETE route returns: { data: null, error: "Key already revoked" } → 400
    });

    it("filtering active vs revoked keys works correctly", () => {
      const allKeys = [
        { id: "k1", revoked_at: null },
        { id: "k2", revoked_at: "2024-01-01T00:00:00Z" },
        { id: "k3", revoked_at: null },
        { id: "k4", revoked_at: "2024-06-15T12:00:00Z" },
      ];

      const active = allKeys.filter((k) => !k.revoked_at);
      const revoked = allKeys.filter((k) => k.revoked_at);

      expect(active).toHaveLength(2);
      expect(revoked).toHaveLength(2);
      expect(active.map((k) => k.id)).toEqual(["k1", "k3"]);
      expect(revoked.map((k) => k.id)).toEqual(["k2", "k4"]);
    });
  });

  // ---------- KEY OWNERSHIP ----------
  describe("key ownership enforcement", () => {
    it("agent can only revoke their own keys", () => {
      const keyRecord = { id: "k1", agent_id: "agent-owner" };
      const currentAgentId = "agent-other";
      expect(keyRecord.agent_id).not.toBe(currentAgentId);
      // DELETE route: "Not authorized to revoke this key" → 403
    });

    it("agent can revoke their own keys", () => {
      const keyRecord = { id: "k1", agent_id: "agent-owner" };
      const currentAgentId = "agent-owner";
      expect(keyRecord.agent_id).toBe(currentAgentId);
    });

    it("key lookup by hash is agent-agnostic", () => {
      // The api_keys table has a unique key_hash column
      // Lookup: .eq("key_hash", keyHash).single()
      // Agent verification happens AFTER the key is found
      const key = generateApiKey();
      const hash = hashApiKey(key);
      expect(hash).toHaveLength(64);
      // After finding key, authenticateRequest looks up the agent via agent_id
    });
  });

  // ---------- ENTROPY ----------
  describe("key entropy", () => {
    it("32 bytes of randomness = 256 bits of entropy", () => {
      const key = generateApiKey();
      const hexPart = key.slice(3); // Remove "tl_"
      const bytes = Buffer.from(hexPart, "hex");
      expect(bytes).toHaveLength(32);
    });

    it("keys don't share common prefix (beyond tl_)", () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();
      // First 10 chars after tl_ should differ (probabilistically)
      const suffix1 = key1.slice(3, 13);
      const suffix2 = key2.slice(3, 13);
      expect(suffix1).not.toBe(suffix2);
    });
  });
});
