import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

interface ApiKeyAgent {
  id: string;
  alias: string;
}

/**
 * Hash an API key for storage/lookup.
 * Uses SHA-256 — fast enough for key lookups, secure for storage.
 */
export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

/**
 * Generate a new API key with "tl_" prefix.
 * Returns the plaintext key (show to user once, never again).
 */
export function generateApiKey(): string {
  const bytes = crypto.randomBytes(32);
  return `tl_${bytes.toString("hex")}`;
}

/**
 * Authenticate a request using either:
 * 1. Supabase session cookie (existing auth)
 * 2. Bearer token API key (MCP/programmatic access)
 *
 * Returns the agent associated with the auth method, or null.
 */
export async function authenticateRequest(
  request: Request
): Promise<{ agent: ApiKeyAgent; method: "session" | "api_key" } | null> {
  const supabase = createClient();

  // Try API key auth first (Bearer token)
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer tl_")) {
    const apiKey = authHeader.slice(7); // Remove "Bearer "
    const keyHash = hashApiKey(apiKey);

    const { data: keyRecord } = await supabase
      .from("api_keys")
      .select("id, agent_id, revoked_at")
      .eq("key_hash", keyHash)
      .single();

    if (!keyRecord || keyRecord.revoked_at) {
      return null;
    }

    // Get agent
    const { data: agent } = await supabase
      .from("agents")
      .select("id, alias")
      .eq("id", keyRecord.agent_id)
      .single();

    if (!agent) return null;

    // Update last_used (fire and forget)
    supabase
      .from("api_keys")
      .update({ last_used: new Date().toISOString() })
      .eq("id", keyRecord.id)
      .then(() => {});

    return { agent: agent as ApiKeyAgent, method: "api_key" };
  }

  // Fall back to Supabase session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: agent } = await supabase
    .from("agents")
    .select("id, alias")
    .eq("user_id", user.id)
    .single();

  if (!agent) return null;

  return { agent: agent as ApiKeyAgent, method: "session" };
}
