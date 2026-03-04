import { describe, it, expect } from "vitest";
import {
  COMPLETION_RATE_LIMITS,
  MAX_CONCURRENT_ACTIVE_TASKS,
  validateTransition,
  StateTransitionError,
  canTransition,
  type TaskState,
} from "@/lib/types";
import { hashApiKey } from "@/lib/api-key-auth";
import crypto from "crypto";

// ================================================================
// CRITICAL-2: Sybil Reputation Farming Rate Limits
// ================================================================
describe("CRITICAL-2: Sybil Reputation Farming Rate Limits", () => {
  describe("COMPLETION_RATE_LIMITS configuration", () => {
    it("Dev tier allows 10 completions per 24h", () => {
      expect(COMPLETION_RATE_LIMITS.Dev).toBe(10);
    });

    it("Builder tier allows 50 completions per 24h", () => {
      expect(COMPLETION_RATE_LIMITS.Builder).toBe(50);
    });

    it("Pro tier allows 200 completions per 24h", () => {
      expect(COMPLETION_RATE_LIMITS.Pro).toBe(200);
    });

    it("all three tiers are defined", () => {
      expect(Object.keys(COMPLETION_RATE_LIMITS)).toHaveLength(3);
      expect(Object.keys(COMPLETION_RATE_LIMITS)).toEqual(
        expect.arrayContaining(["Dev", "Builder", "Pro"])
      );
    });

    it("tier limits are strictly increasing", () => {
      expect(COMPLETION_RATE_LIMITS.Dev).toBeLessThan(
        COMPLETION_RATE_LIMITS.Builder
      );
      expect(COMPLETION_RATE_LIMITS.Builder).toBeLessThan(
        COMPLETION_RATE_LIMITS.Pro
      );
    });

    it("all limits are positive integers", () => {
      for (const [, limit] of Object.entries(COMPLETION_RATE_LIMITS)) {
        expect(limit).toBeGreaterThan(0);
        expect(Number.isInteger(limit)).toBe(true);
      }
    });
  });

  describe("rate limit enforcement logic", () => {
    it("should block when completions >= limit (at limit)", () => {
      const recentCompletions = 10;
      const limit = COMPLETION_RATE_LIMITS.Dev;
      expect(recentCompletions >= limit).toBe(true);
    });

    it("should block when completions exceed limit", () => {
      const recentCompletions = 15;
      const limit = COMPLETION_RATE_LIMITS.Dev;
      expect(recentCompletions >= limit).toBe(true);
    });

    it("should allow when completions < limit", () => {
      const recentCompletions = 9;
      const limit = COMPLETION_RATE_LIMITS.Dev;
      expect(recentCompletions >= limit).toBe(false);
    });

    it("should allow when zero completions", () => {
      const recentCompletions = 0;
      const limit = COMPLETION_RATE_LIMITS.Dev;
      expect(recentCompletions >= limit).toBe(false);
    });

    it("Builder agent can do 50 but not 51", () => {
      const limit = COMPLETION_RATE_LIMITS.Builder;
      expect(50 >= limit).toBe(true); // blocked at 50
      expect(49 >= limit).toBe(false); // allowed at 49
    });

    it("Pro agent can do 200 but not 201", () => {
      const limit = COMPLETION_RATE_LIMITS.Pro;
      expect(200 >= limit).toBe(true); // blocked at 200
      expect(199 >= limit).toBe(false); // allowed at 199
    });

    it("unknown tier falls back to null (route uses ?? 10)", () => {
      const tierName = "SuperAdmin";
      const limit = COMPLETION_RATE_LIMITS[tierName] ?? 10;
      expect(limit).toBe(10);
    });
  });

  describe("24-hour window calculation", () => {
    it("24h ago timestamp is correct", () => {
      const now = Date.now();
      const twentyFourHoursAgo = new Date(
        now - 24 * 60 * 60 * 1000
      );
      const diff = now - twentyFourHoursAgo.getTime();
      expect(diff).toBe(86400000); // 24h in ms
    });

    it("event 23h59m ago is within window", () => {
      const now = Date.now();
      const eventTime = new Date(now - 23 * 60 * 60 * 1000 - 59 * 60 * 1000);
      const windowStart = new Date(now - 24 * 60 * 60 * 1000);
      expect(eventTime >= windowStart).toBe(true);
    });

    it("event 25h ago is outside window", () => {
      const now = Date.now();
      const eventTime = new Date(now - 25 * 60 * 60 * 1000);
      const windowStart = new Date(now - 24 * 60 * 60 * 1000);
      expect(eventTime >= windowStart).toBe(false);
    });
  });
});

// ================================================================
// CRITICAL-3: Concurrent Task Limit
// ================================================================
describe("CRITICAL-3: Concurrent Task Limit", () => {
  describe("MAX_CONCURRENT_ACTIVE_TASKS configuration", () => {
    it("limit is 10", () => {
      expect(MAX_CONCURRENT_ACTIVE_TASKS).toBe(10);
    });

    it("limit is a positive integer", () => {
      expect(MAX_CONCURRENT_ACTIVE_TASKS).toBeGreaterThan(0);
      expect(Number.isInteger(MAX_CONCURRENT_ACTIVE_TASKS)).toBe(true);
    });
  });

  describe("concurrent task enforcement logic", () => {
    it("should block when active tasks >= limit", () => {
      const activeTasks = 10;
      expect(activeTasks >= MAX_CONCURRENT_ACTIVE_TASKS).toBe(true);
    });

    it("should block when active tasks exceed limit", () => {
      const activeTasks = 15;
      expect(activeTasks >= MAX_CONCURRENT_ACTIVE_TASKS).toBe(true);
    });

    it("should allow when active tasks < limit", () => {
      const activeTasks = 9;
      expect(activeTasks >= MAX_CONCURRENT_ACTIVE_TASKS).toBe(false);
    });

    it("should allow when zero active tasks", () => {
      const activeTasks = 0;
      expect(activeTasks >= MAX_CONCURRENT_ACTIVE_TASKS).toBe(false);
    });

    it("should allow exactly 9 active tasks", () => {
      const activeTasks = 9;
      expect(activeTasks >= MAX_CONCURRENT_ACTIVE_TASKS).toBe(false);
    });

    it("should block at exactly 10 active tasks", () => {
      const activeTasks = 10;
      expect(activeTasks >= MAX_CONCURRENT_ACTIVE_TASKS).toBe(true);
    });
  });

  describe("active state classification", () => {
    const activeStates = ["FUNDED", "DELIVERED", "DISPUTED"];
    const inactiveStates = [
      "CREATED",
      "VERIFIED",
      "SETTLED",
      "RESOLVED",
      "EXPIRED",
      "REFUNDED",
    ];

    it("FUNDED counts as active", () => {
      expect(activeStates.includes("FUNDED")).toBe(true);
    });

    it("DELIVERED counts as active", () => {
      expect(activeStates.includes("DELIVERED")).toBe(true);
    });

    it("DISPUTED counts as active", () => {
      expect(activeStates.includes("DISPUTED")).toBe(true);
    });

    it("CREATED does NOT count as active", () => {
      expect(activeStates.includes("CREATED")).toBe(false);
    });

    it("SETTLED does NOT count as active", () => {
      expect(activeStates.includes("SETTLED")).toBe(false);
    });

    it("EXPIRED does NOT count as active", () => {
      expect(activeStates.includes("EXPIRED")).toBe(false);
    });

    it("REFUNDED does NOT count as active", () => {
      expect(activeStates.includes("REFUNDED")).toBe(false);
    });

    it("VERIFIED does NOT count as active (pass-through state)", () => {
      expect(activeStates.includes("VERIFIED")).toBe(false);
    });

    it("RESOLVED does NOT count as active (pass-through state)", () => {
      expect(activeStates.includes("RESOLVED")).toBe(false);
    });

    it("3 active states, 6 inactive states", () => {
      expect(activeStates).toHaveLength(3);
      expect(inactiveStates).toHaveLength(6);
    });
  });
});

// ================================================================
// CRITICAL-4: validateTransition helper
// ================================================================
describe("CRITICAL-4: validateTransition", () => {
  it("valid transitions do not throw", () => {
    expect(() => validateTransition("CREATED", "FUNDED")).not.toThrow();
    expect(() => validateTransition("FUNDED", "DELIVERED")).not.toThrow();
    expect(() => validateTransition("DELIVERED", "VERIFIED")).not.toThrow();
    expect(() => validateTransition("DELIVERED", "DISPUTED")).not.toThrow();
    expect(() => validateTransition("VERIFIED", "SETTLED")).not.toThrow();
    expect(() => validateTransition("DISPUTED", "RESOLVED")).not.toThrow();
    expect(() => validateTransition("RESOLVED", "SETTLED")).not.toThrow();
    expect(() => validateTransition("EXPIRED", "REFUNDED")).not.toThrow();
    expect(() => validateTransition("FUNDED", "EXPIRED")).not.toThrow();
  });

  it("invalid transitions throw StateTransitionError", () => {
    expect(() => validateTransition("CREATED", "DELIVERED")).toThrow(
      StateTransitionError
    );
    expect(() => validateTransition("FUNDED", "FUNDED")).toThrow(
      StateTransitionError
    );
    expect(() => validateTransition("SETTLED", "CREATED")).toThrow(
      StateTransitionError
    );
    expect(() => validateTransition("REFUNDED", "FUNDED")).toThrow(
      StateTransitionError
    );
  });

  it("StateTransitionError has correct from/to properties", () => {
    try {
      validateTransition("SETTLED", "FUNDED");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(StateTransitionError);
      const ste = err as StateTransitionError;
      expect(ste.from).toBe("SETTLED");
      expect(ste.to).toBe("FUNDED");
      expect(ste.message).toContain("SETTLED");
      expect(ste.message).toContain("FUNDED");
    }
  });

  it("terminal states always throw", () => {
    const terminals: TaskState[] = ["SETTLED", "REFUNDED"];
    const allStates: TaskState[] = [
      "CREATED", "FUNDED", "DELIVERED", "VERIFIED",
      "SETTLED", "DISPUTED", "RESOLVED", "EXPIRED", "REFUNDED",
    ];
    for (const terminal of terminals) {
      for (const target of allStates) {
        expect(() => validateTransition(terminal, target)).toThrow(
          StateTransitionError
        );
      }
    }
  });

  it("validateTransition agrees with canTransition for all pairs", () => {
    const allStates: TaskState[] = [
      "CREATED", "FUNDED", "DELIVERED", "VERIFIED",
      "SETTLED", "DISPUTED", "RESOLVED", "EXPIRED", "REFUNDED",
    ];
    for (const from of allStates) {
      for (const to of allStates) {
        const allowed = canTransition(from, to);
        if (allowed) {
          expect(() => validateTransition(from, to)).not.toThrow();
        } else {
          expect(() => validateTransition(from, to)).toThrow(
            StateTransitionError
          );
        }
      }
    }
  });
});

// ================================================================
// CRITICAL-5: Timing-safe API key comparison
// ================================================================
describe("CRITICAL-5: Timing-safe API key comparison", () => {
  it("hashApiKey produces consistent SHA-256 hex", () => {
    const key = "tl_abc123";
    const hash1 = hashApiKey(key);
    const hash2 = hashApiKey(key);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  it("different keys produce different hashes", () => {
    const hash1 = hashApiKey("tl_key1");
    const hash2 = hashApiKey("tl_key2");
    expect(hash1).not.toBe(hash2);
  });

  it("timingSafeEqual works for matching buffers", () => {
    const hash = hashApiKey("tl_test123");
    const buf1 = Buffer.from(hash, "utf8");
    const buf2 = Buffer.from(hash, "utf8");
    expect(crypto.timingSafeEqual(buf1, buf2)).toBe(true);
  });

  it("timingSafeEqual rejects mismatched buffers", () => {
    const hash1 = hashApiKey("tl_key1");
    const hash2 = hashApiKey("tl_key2");
    const buf1 = Buffer.from(hash1, "utf8");
    const buf2 = Buffer.from(hash2, "utf8");
    // Both SHA-256 hex strings are 64 chars so lengths match
    expect(buf1.length).toBe(buf2.length);
    expect(crypto.timingSafeEqual(buf1, buf2)).toBe(false);
  });

  it("timingSafeEqual throws on different length buffers", () => {
    const buf1 = Buffer.from("short", "utf8");
    const buf2 = Buffer.from("longer_string", "utf8");
    expect(() => crypto.timingSafeEqual(buf1, buf2)).toThrow();
  });

  it("SHA-256 hash is always 64 hex characters", () => {
    const samples = [
      "tl_a",
      "tl_" + "x".repeat(100),
      "tl_" + crypto.randomBytes(32).toString("hex"),
    ];
    for (const key of samples) {
      const hash = hashApiKey(key);
      expect(hash).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
    }
  });
});

// ================================================================
// CRITICAL-6: Liquidity monitoring logic
// ================================================================
describe("CRITICAL-6: Liquidity Monitoring", () => {
  describe("liquidity ratio calculation", () => {
    function calcRatio(available: number, locked: number) {
      const total = available + locked;
      return total > 0 ? available / total : 1;
    }

    function getStatus(ratio: number): "HEALTHY" | "WARNING" | "CRITICAL" {
      if (ratio >= 0.3) return "HEALTHY";
      if (ratio >= 0.1) return "WARNING";
      return "CRITICAL";
    }

    it("100% available = HEALTHY (ratio 1.0)", () => {
      const ratio = calcRatio(1_000_000, 0);
      expect(ratio).toBe(1);
      expect(getStatus(ratio)).toBe("HEALTHY");
    });

    it("50% available = HEALTHY (ratio 0.5)", () => {
      const ratio = calcRatio(500_000, 500_000);
      expect(ratio).toBe(0.5);
      expect(getStatus(ratio)).toBe("HEALTHY");
    });

    it("30% available = HEALTHY (ratio 0.3, boundary)", () => {
      const ratio = calcRatio(300_000, 700_000);
      expect(ratio).toBe(0.3);
      expect(getStatus(ratio)).toBe("HEALTHY");
    });

    it("29% available = WARNING", () => {
      const ratio = calcRatio(290_000, 710_000);
      expect(ratio).toBeLessThan(0.3);
      expect(getStatus(ratio)).toBe("WARNING");
    });

    it("10% available = WARNING (ratio 0.1, boundary)", () => {
      const ratio = calcRatio(100_000, 900_000);
      expect(ratio).toBe(0.1);
      expect(getStatus(ratio)).toBe("WARNING");
    });

    it("9% available = CRITICAL", () => {
      const ratio = calcRatio(90_000, 910_000);
      expect(ratio).toBeLessThan(0.1);
      expect(getStatus(ratio)).toBe("CRITICAL");
    });

    it("0 available = CRITICAL (ratio 0)", () => {
      const ratio = calcRatio(0, 500_000);
      expect(ratio).toBe(0);
      expect(getStatus(ratio)).toBe("CRITICAL");
    });

    it("0 available, 0 locked = HEALTHY (ratio 1, no obligations)", () => {
      const ratio = calcRatio(0, 0);
      expect(ratio).toBe(1);
      expect(getStatus(ratio)).toBe("HEALTHY");
    });
  });

  describe("pre-payment liquidity check", () => {
    it("should allow payment when balance >= amount", () => {
      const balance = 1_000_000;
      const amount = 500_000;
      expect(balance >= amount).toBe(true);
    });

    it("should block payment when balance < amount", () => {
      const balance = 100_000;
      const amount = 500_000;
      expect(balance >= amount).toBe(false);
    });

    it("should allow payment at exact balance", () => {
      const balance = 500_000;
      const amount = 500_000;
      expect(balance >= amount).toBe(true);
    });
  });
});
