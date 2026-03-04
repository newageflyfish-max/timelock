import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { clampReputation, COMPLETION_RATE_LIMITS } from "@/lib/types";
import type { TaskState, ReputationEventType } from "@/lib/types";
import { payInvoice, VoltageError, getNodeBalance } from "@/lib/lightning";
import { authenticateRequest } from "@/lib/api-key-auth";
import { atomicStateTransition } from "@/lib/task-transition";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json(
      { data: null, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { agent } = auth;
  const supabase = createClient();

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", params.id)
    .single();

  if (taskError || !task) {
    return NextResponse.json(
      { data: null, error: "Task not found" },
      { status: 404 }
    );
  }

  if (task.buyer_agent_id !== agent.id) {
    return NextResponse.json(
      { data: null, error: "Only the buyer can verify a task" },
      { status: 403 }
    );
  }

  // Accept DELIVERED (first verification) or VERIFIED (payment retry after failure)
  const currentState = task.state as TaskState;
  if (currentState !== "DELIVERED" && currentState !== "VERIFIED") {
    return NextResponse.json(
      {
        data: null,
        error: `Cannot verify task in state ${currentState}. Task must be in DELIVERED or VERIFIED state.`,
      },
      { status: 400 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { data: null, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { score, evidence_url, notes, seller_lightning_invoice } = body as {
    score?: number;
    evidence_url?: string;
    notes?: string;
    seller_lightning_invoice?: string;
  };

  if (score === undefined || typeof score !== "number") {
    return NextResponse.json(
      { data: null, error: "score is required and must be a number 0-100" },
      { status: 400 }
    );
  }

  if (!Number.isInteger(score) || score < 0 || score > 100) {
    return NextResponse.json(
      { data: null, error: "score must be an integer between 0 and 100" },
      { status: 400 }
    );
  }

  // Validate seller Lightning invoice
  if (
    !seller_lightning_invoice ||
    typeof seller_lightning_invoice !== "string" ||
    !seller_lightning_invoice.startsWith("lnbc")
  ) {
    return NextResponse.json(
      {
        data: null,
        error:
          "seller_lightning_invoice is required and must be a valid BOLT11 invoice starting with 'lnbc'",
      },
      { status: 400 }
    );
  }

  // CRITICAL-2: Sybil farming rate limit — check completions in last 24h
  const twentyFourHoursAgo = new Date(
    Date.now() - 24 * 60 * 60 * 1000
  ).toISOString();
  const { count: recentCompletions } = await supabase
    .from("reputation_events")
    .select("*", { count: "exact", head: true })
    .eq("agent_id", agent.id)
    .in("event_type", ["COMPLETED", "PERFECT"])
    .gte("created_at", twentyFourHoursAgo);

  // Determine agent's tier (default to Dev)
  const tierName = "Dev"; // All agents default to Dev; tier comes from Stripe subscription
  const completionLimit = COMPLETION_RATE_LIMITS[tierName] ?? 10;

  if ((recentCompletions ?? 0) >= completionLimit) {
    return NextResponse.json(
      {
        data: null,
        error: `Rate limit exceeded: max ${completionLimit} verifications per 24h for ${tierName} tier`,
      },
      { status: 429 }
    );
  }

  // CRITICAL-6: Pre-payment liquidity check
  try {
    const balance = await getNodeBalance();
    if (balance.confirmedBalance < task.amount_sats) {
      console.log(
        `[VERIFY] Insufficient liquidity: need ${task.amount_sats} sats, have ${balance.confirmedBalance}`
      );
      return NextResponse.json(
        {
          data: null,
          error:
            "Insufficient node liquidity for payment. Please try again later.",
        },
        { status: 503 }
      );
    }
  } catch (err) {
    if (err instanceof VoltageError) {
      return NextResponse.json(
        {
          data: null,
          error: "Lightning service unavailable for liquidity check",
        },
        { status: 503 }
      );
    }
    // Non-fatal: proceed with payment attempt if balance check fails
    console.log(
      "[VERIFY] Liquidity check failed, proceeding:",
      (err as Error).message
    );
  }

  // CRITICAL-1: Atomically claim DELIVERED → VERIFIED to block concurrent /dispute
  if (currentState === "DELIVERED") {
    const claimResult = await atomicStateTransition(
      params.id,
      "DELIVERED",
      "VERIFIED"
    );
    if (!claimResult.success) {
      return NextResponse.json(
        { data: null, error: claimResult.error },
        { status: 409 }
      );
    }
  }

  // Task is now in VERIFIED state — safe from /dispute race condition

  // Determine result from score
  let result: "PASS" | "FAIL" | "PARTIAL";
  if (score >= 70) result = "PASS";
  else if (score >= 50) result = "PARTIAL";
  else result = "FAIL";

  // Create verification result
  const { data: verification, error: verifyError } = await supabase
    .from("verification_results")
    .insert({
      task_id: params.id,
      verifier_agent_id: agent.id,
      result,
      score,
      evidence_url: evidence_url || null,
      notes: notes || null,
    })
    .select()
    .single();

  if (verifyError) {
    console.log("[VERIFY] Verification insert error:", verifyError.message);
    return NextResponse.json(
      { data: null, error: "Failed to create verification result" },
      { status: 500 }
    );
  }

  // Pay seller via Lightning
  let paymentResult: Awaited<ReturnType<typeof payInvoice>>;
  try {
    paymentResult = await payInvoice(
      seller_lightning_invoice,
      task.amount_sats
    );
  } catch (err) {
    if (err instanceof VoltageError) {
      return NextResponse.json(
        {
          data: null,
          error:
            "Lightning service unavailable. Task remains in VERIFIED state for retry.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        data: null,
        error:
          "Lightning payment failed. Task remains in VERIFIED state for retry.",
      },
      { status: 500 }
    );
  }

  if (!paymentResult.success) {
    console.log(
      `[VERIFY] Lightning payment failed: ${paymentResult.error}`
    );
    return NextResponse.json(
      {
        data: null,
        error: `Lightning payment failed: ${paymentResult.error}. Task remains in VERIFIED state for retry.`,
      },
      { status: 500 }
    );
  }

  // CRITICAL-1: Atomic VERIFIED → SETTLED
  const settleResult = await atomicStateTransition(
    params.id,
    "VERIFIED",
    "SETTLED"
  );

  if (!settleResult.success) {
    console.log("[VERIFY] Settle conflict:", settleResult.error);
    return NextResponse.json(
      { data: null, error: settleResult.error },
      { status: 409 }
    );
  }

  // Release escrow — store seller's release invoice
  const now = new Date().toISOString();
  await supabase
    .from("escrow_holds")
    .update({
      state: "RELEASED",
      release_invoice: seller_lightning_invoice,
      released_at: now,
    })
    .eq("task_id", params.id)
    .eq("state", "HELD");

  // Calculate reputation delta
  const isLate = !!(task.metadata as Record<string, unknown>)?.late;
  let repDelta: number;
  let eventType: ReputationEventType;

  if (score >= 90) {
    repDelta = 100;
    eventType = "PERFECT";
  } else if (score >= 70) {
    repDelta = 50;
    eventType = "COMPLETED";
  } else if (score >= 50) {
    repDelta = 25;
    eventType = "COMPLETED";
  } else {
    repDelta = 10;
    eventType = "COMPLETED";
  }

  const latePenalty = isLate ? -25 : 0;
  const totalSellerDelta = repDelta + latePenalty;

  if (task.seller_agent_id) {
    // Completion reputation event
    await supabase.from("reputation_events").insert({
      agent_id: task.seller_agent_id,
      task_id: params.id,
      event_type: eventType,
      score_delta: repDelta,
    });

    // Late penalty event
    if (isLate) {
      await supabase.from("reputation_events").insert({
        agent_id: task.seller_agent_id,
        task_id: params.id,
        event_type: "LATE",
        score_delta: latePenalty,
      });
    }

    // Update seller agent stats
    const { data: seller } = await supabase
      .from("agents")
      .select("reputation_score, total_tasks_completed, total_sats_earned")
      .eq("id", task.seller_agent_id)
      .single();

    if (seller) {
      await supabase
        .from("agents")
        .update({
          reputation_score: clampReputation(
            seller.reputation_score + totalSellerDelta
          ),
          total_tasks_completed: seller.total_tasks_completed + 1,
          total_sats_earned: seller.total_sats_earned + task.amount_sats,
          last_active: now,
        })
        .eq("id", task.seller_agent_id);
    }
  }

  // Update buyer stats
  const { data: buyer } = await supabase
    .from("agents")
    .select("total_sats_paid")
    .eq("id", agent.id)
    .single();

  if (buyer) {
    await supabase
      .from("agents")
      .update({
        total_sats_paid: buyer.total_sats_paid + task.amount_sats,
        last_active: now,
      })
      .eq("id", agent.id);
  }

  console.log(
    `[TASK VERIFY] ${params.id} → DELIVERED → VERIFIED → SETTLED (score: ${score}, seller delta: ${totalSellerDelta}, payment: ${paymentResult.paymentHash?.slice(0, 16)})`
  );

  return NextResponse.json({
    data: {
      task: settleResult.task,
      verification,
      paymentHash: paymentResult.paymentHash,
    },
    error: null,
  });
}
