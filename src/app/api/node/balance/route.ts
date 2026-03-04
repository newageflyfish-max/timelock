import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getNodeBalance, VoltageError } from "@/lib/lightning";
import { authenticateRequest } from "@/lib/api-key-auth";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json(
      { data: null, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const balance = await getNodeBalance();

    // CRITICAL-6: Calculate locked sats from active escrows
    const supabase = createClient();
    const { data: activeEscrows } = await supabase
      .from("escrow_holds")
      .select("amount_sats")
      .eq("state", "HELD");

    const totalLockedSats = (activeEscrows ?? []).reduce(
      (sum: number, e: { amount_sats: number }) => sum + e.amount_sats,
      0
    );

    const available = balance.confirmedBalance;
    const total = available + totalLockedSats;
    const liquidityRatio = total > 0 ? available / total : 1;

    let status: "HEALTHY" | "WARNING" | "CRITICAL";
    if (liquidityRatio >= 0.3) {
      status = "HEALTHY";
    } else if (liquidityRatio >= 0.1) {
      status = "WARNING";
    } else {
      status = "CRITICAL";
    }

    return NextResponse.json({
      data: {
        ...balance,
        totalLockedSats,
        liquidityRatio: Math.round(liquidityRatio * 1000) / 1000,
        status,
      },
      error: null,
    });
  } catch (err) {
    if (err instanceof VoltageError) {
      return NextResponse.json(
        { data: null, error: "Lightning service unavailable" },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { data: null, error: "Failed to get node balance" },
      { status: 500 }
    );
  }
}
