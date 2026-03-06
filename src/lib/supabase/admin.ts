import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — bypasses Row Level Security.
 * Use only for internal service routes (agent, cron) where there is
 * no authenticated user session.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      `[ADMIN CLIENT] Missing env vars: URL=${url ? "set" : "MISSING"}, SERVICE_ROLE_KEY=${serviceRoleKey ? "set" : "MISSING"}`
    );
  }

  const keyPrefix = serviceRoleKey.slice(0, 20);
  console.log(`[ADMIN CLIENT] Creating client — URL: ${url}, key prefix: ${keyPrefix}...`);

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
