import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { validateTransition } from "@/lib/types";
import type { TaskState } from "@/lib/types";
import {
  createHoldInvoice,
  VoltageError,
  isLightningEnabled,
} from "@/lib/lightning";
import { authenticateRequest } from "@/lib/api-key-auth";
import { atomicStateTransition } from "@/lib/task-transition";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleAgentDelivery } from "@/lib/agent";

export const maxDuration = 60; // Vercel Pro — agent needs time for Claude API call

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
      { data: null, error: "Only the buyer can fund a task" },
      { status: 403 }
    );
  }

  // CRITICAL-4: Use centralized validator
  const currentState = task.state as TaskState;
  try {
    validateTransition(currentState, "FUNDED");
  } catch {
    return NextResponse.json(
      {
        data: null,
        error: `Cannot fund task in state ${currentState}. Task must be in CREATED state.`,
      },
      { status: 400 }
    );
  }

  // Check for existing escrow
  const { data: existingEscrow } = await supabase
    .from("escrow_holds")
    .select("id")
    .eq("task_id", params.id)
    .single();

  if (existingEscrow) {
    return NextResponse.json(
      { data: null, error: "Escrow already created for this task" },
      { status: 400 }
    );
  }

  // ---------------------------------------------------------------
  // MOCK MODE: When Lightning is disabled, skip invoice entirely
  // and immediately transition to FUNDED.
  // ---------------------------------------------------------------
  if (!isLightningEnabled()) {
    console.log(`[FUND MOCK] Lightning disabled — instant fund for task ${params.id}`);

    const now = new Date().toISOString();
    const mockHash = params.id.replace(/-/g, "").slice(0, 32).padEnd(32, "0");

    // Create escrow hold as HELD (skipping PENDING entirely)
    const { error: escrowError } = await supabase
      .from("escrow_holds")
      .insert({
        task_id: params.id,
        amount_sats: task.amount_sats,
        hold_invoice: `lnbc${task.amount_sats}mock${mockHash.slice(0, 16)}`,
        state: "HELD",
        held_at: now,
        created_at: now,
      });

    if (escrowError) {
      console.log("[FUND MOCK] Escrow creation error:", escrowError.message);
      return NextResponse.json(
        { data: null, error: "Failed to create escrow hold" },
        { status: 500 }
      );
    }

    // Atomic CAS transition CREATED → FUNDED
    const transition = await atomicStateTransition(
      params.id,
      "CREATED",
      "FUNDED",
      { payment_hash: mockHash }
    );

    if (!transition.success) {
      console.log("[FUND MOCK] CAS transition failed:", transition.error);
      return NextResponse.json(
        { data: null, error: transition.error },
        { status: 409 }
      );
    }

    console.log(`[FUND MOCK] ✅ ${params.id} → CREATED → FUNDED (instant mock)`);

    // Log FUNDED reputation event
    await supabase.from("reputation_events").insert({
      agent_id: agent.id,
      task_id: params.id,
      event_type: "FUNDED",
      score_delta: 0,
    });

    // Belt-and-suspenders: force FUNDED state via admin client (bypasses RLS)
    // The CAS transition above uses the cookie-based client which may have
    // RLS or replication issues. This ensures the agent will see FUNDED.
    const supabaseAdmin = createAdminClient();
    const { error: forceErr } = await supabaseAdmin
      .from("tasks")
      .update({ state: "FUNDED", payment_hash: mockHash })
      .eq("id", params.id);

    console.log(`[FUND MOCK] Admin force-write FUNDED: ${forceErr ? "FAILED " + forceErr.message : "OK"}`);

    // Call agent directly (no HTTP round-trip)
    console.log(`[FUND MOCK] Calling handleAgentDelivery inline for task ${params.id}`);
    try {
      const agentResult = await handleAgentDelivery(params.id);
      console.log(`[FUND MOCK] Agent result:`, agentResult);
    } catch (err) {
      console.error("[FUND MOCK] Agent error (non-fatal):", (err as Error).message);
    }

    return NextResponse.json({
      data: {
        task: transition.task,
        mock: true,
        funded: true,
      },
      error: null,
    });
  }

  // ---------------------------------------------------------------
  // LIVE MODE: Generate a real Lightning invoice and wait for payment
  // ---------------------------------------------------------------
  let invoiceData: Awaited<ReturnType<typeof createHoldInvoice>>;
  try {
    invoiceData = await createHoldInvoice(task.amount_sats, params.id);
  } catch (err) {
    if (err instanceof VoltageError) {
      return NextResponse.json(
        { data: null, error: "Lightning service unavailable" },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { data: null, error: "Failed to generate invoice" },
      { status: 500 }
    );
  }

  // Create escrow hold with real invoice data
  const { error: escrowError } = await supabase.from("escrow_holds").insert({
    task_id: params.id,
    amount_sats: task.amount_sats,
    hold_invoice: invoiceData.invoice,
    state: "PENDING",
    created_at: new Date().toISOString(),
  });

  if (escrowError) {
    console.log("[FUND] Escrow creation error:", escrowError.message);
    return NextResponse.json(
      { data: null, error: "Failed to create escrow hold" },
      { status: 500 }
    );
  }

  // CRITICAL-1: CAS — ensure task is still in CREATED state before writing payment_hash
  const { data: updated, error: updateError } = await supabase
    .from("tasks")
    .update({
      payment_hash: invoiceData.paymentHash,
      metadata: {
        ...(task.metadata as Record<string, unknown>),
        invoice_expiry: invoiceData.expiryAt.toISOString(),
      },
    })
    .eq("id", params.id)
    .eq("state", "CREATED")
    .select()
    .single();

  if (updateError || !updated) {
    console.log("[FUND] Task update error (state conflict):", updateError?.message);
    return NextResponse.json(
      { data: null, error: "State conflict: task state changed during funding" },
      { status: 409 }
    );
  }

  // Log FUNDED reputation event
  await supabase.from("reputation_events").insert({
    agent_id: agent.id,
    task_id: params.id,
    event_type: "FUNDED",
    score_delta: 0,
  });

  console.log(
    `[TASK FUND] ${params.id} → invoice generated (hash: ${invoiceData.paymentHash.slice(0, 16)}, amount: ${task.amount_sats} sats)`
  );

  return NextResponse.json({
    data: {
      task: updated,
      invoice: invoiceData.invoice,
      paymentHash: invoiceData.paymentHash,
      expiryAt: invoiceData.expiryAt.toISOString(),
    },
    error: null,
  });
}
