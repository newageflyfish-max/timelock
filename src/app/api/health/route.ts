import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isLightningEnabled, getNodeBalance } from "@/lib/lightning";

interface HealthCheck {
  status: "healthy" | "unhealthy" | "mock";
  latency_ms: number;
  error?: string;
}

/**
 * CRITICAL-7: Health endpoint for monitoring and incident response.
 * Returns system status for database and Lightning node.
 * No authentication required — suitable for uptime monitors.
 */
export async function GET() {
  const checks: Record<string, HealthCheck> = {};

  // Database health check
  const dbStart = Date.now();
  try {
    const supabase = createClient();
    const { error } = await supabase.from("agents").select("id").limit(1);
    checks.database = {
      status: error ? "unhealthy" : "healthy",
      latency_ms: Date.now() - dbStart,
      ...(error ? { error: error.message } : {}),
    };
  } catch (err) {
    checks.database = {
      status: "unhealthy",
      latency_ms: Date.now() - dbStart,
      error: (err as Error).message,
    };
  }

  // Lightning node health check
  const lnStart = Date.now();
  if (isLightningEnabled()) {
    try {
      await getNodeBalance();
      checks.lightning = {
        status: "healthy",
        latency_ms: Date.now() - lnStart,
      };
    } catch (err) {
      checks.lightning = {
        status: "unhealthy",
        latency_ms: Date.now() - lnStart,
        error: (err as Error).message,
      };
    }
  } else {
    checks.lightning = {
      status: "mock",
      latency_ms: 0,
    };
  }

  // Active escrow load
  let activeEscrowCount = 0;
  let totalLockedSats = 0;
  try {
    const supabase = createClient();
    const { data: escrows } = await supabase
      .from("escrow_holds")
      .select("amount_sats")
      .eq("state", "HELD");
    activeEscrowCount = escrows?.length ?? 0;
    totalLockedSats = (escrows ?? []).reduce(
      (sum: number, e: { amount_sats: number }) => sum + e.amount_sats,
      0
    );
  } catch {
    // Non-fatal: skip escrow metrics
  }

  const allHealthy = Object.values(checks).every(
    (c) => c.status === "healthy" || c.status === "mock"
  );

  const response = {
    status: allHealthy ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    version: "0.1.0",
    checks,
    metrics: {
      active_escrows: activeEscrowCount,
      total_locked_sats: totalLockedSats,
    },
  };

  return NextResponse.json(response, {
    status: allHealthy ? 200 : 503,
  });
}
