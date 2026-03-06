import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { canTransition } from "@/lib/types";
import type { TaskState } from "@/lib/types";
import { checkInvoicePaid, VoltageError } from "@/lib/lightning";
import { authenticateRequest } from "@/lib/api-key-auth";
import { atomicStateTransition } from "@/lib/task-transition";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  console.log(`[PAYMENT-STATUS] Called for task ${params.id}`);

  const auth = await authenticateRequest(request);
  if (!auth) {
    console.log("[PAYMENT-STATUS] Auth failed — returning 401");
    return NextResponse.json(
      { data: null, error: "Unauthorized" },
      { status: 401 }
    );
  }

  console.log(`[PAYMENT-STATUS] Authenticated as agent ${auth.agent.id} (${auth.method})`);

  const { agent } = auth;
  const supabase = createClient();

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", params.id)
    .single();

  if (taskError || !task) {
    console.log("[PAYMENT-STATUS] Task not found:", taskError?.message);
    return NextResponse.json(
      { data: null, error: "Task not found" },
      { status: 404 }
    );
  }

  console.log(`[PAYMENT-STATUS] Task state: ${task.state}, payment_hash: ${task.payment_hash ? "yes" : "no"}`);

  // Restrict to task participants only
  if (
    agent.id !== task.buyer_agent_id && agent.id !== task.seller_agent_id
  ) {
    return NextResponse.json(
      { data: null, error: "Only task participants can check payment status" },
      { status: 403 }
    );
  }

  if (!task.payment_hash) {
    return NextResponse.json(
      { data: null, error: "No invoice generated for this task" },
      { status: 400 }
    );
  }

  // Check if invoice expired
  const invoiceExpiry = (task.metadata as Record<string, unknown>)
    ?.invoice_expiry as string | undefined;
  if (invoiceExpiry && new Date(invoiceExpiry) < new Date()) {
    console.log("[PAYMENT-STATUS] Invoice expired");
    return NextResponse.json(
      {
        data: { paid: false, expired: true },
        error: "Invoice expired, please generate new one",
      },
      { status: 400 }
    );
  }

  // Check payment status with Voltage (or mock)
  let paymentStatus: Awaited<ReturnType<typeof checkInvoicePaid>>;
  try {
    paymentStatus = await checkInvoicePaid(task.payment_hash);
    console.log(`[PAYMENT-STATUS] checkInvoicePaid result: paid=${paymentStatus.paid}`);
  } catch (err) {
    if (err instanceof VoltageError) {
      console.log("[PAYMENT-STATUS] VoltageError:", err.message);
      return NextResponse.json(
        { data: null, error: "Lightning service unavailable" },
        { status: 503 }
      );
    }
    console.log("[PAYMENT-STATUS] Unknown error:", (err as Error).message);
    return NextResponse.json(
      { data: null, error: "Failed to check payment status" },
      { status: 500 }
    );
  }

  // If paid and task still in CREATED → move to FUNDED
  if (paymentStatus.paid) {
    const currentState = task.state as TaskState;
    console.log(`[PAYMENT-STATUS] Payment confirmed. Current state: ${currentState}`);

    if (canTransition(currentState, "FUNDED")) {
      const now = new Date().toISOString();

      // Update escrow to HELD
      const { error: escrowErr } = await supabase
        .from("escrow_holds")
        .update({ state: "HELD", held_at: now })
        .eq("task_id", params.id)
        .eq("state", "PENDING");

      console.log(`[PAYMENT-STATUS] Escrow update: ${escrowErr ? "FAILED " + escrowErr.message : "OK"}`);

      // CRITICAL-1: Atomic CAS transition CREATED → FUNDED
      const transition = await atomicStateTransition(
        params.id,
        "CREATED",
        "FUNDED"
      );

      if (!transition.success) {
        console.log(
          "[PAYMENT-STATUS] CAS transition failed:",
          transition.error
        );
        return NextResponse.json(
          { data: null, error: transition.error },
          { status: 409 }
        );
      }

      console.log(
        `[PAYMENT-STATUS] ✅ ${params.id} → CREATED → FUNDED (payment confirmed)`
      );

      // Trigger timelock-agent for demo auto-delivery
      if (process.env.AGENT_SECRET) {
        console.log(
          `[AGENT TRIGGER] Firing agent for task ${params.id} after FUNDED transition`
        );
        const appUrl =
          process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        fetch(`${appUrl}/api/agent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-agent-secret": process.env.AGENT_SECRET,
          },
          body: JSON.stringify({ task_id: params.id }),
        }).catch((err) => {
          console.error(
            "[AGENT TRIGGER] Failed to trigger agent:",
            err.message
          );
        });
      }

      return NextResponse.json({
        data: {
          paid: true,
          funded: true,
          task: transition.task,
          settledAt: paymentStatus.settledAt?.toISOString(),
        },
        error: null,
      });
    }

    // Already funded or in later state
    console.log(`[PAYMENT-STATUS] Already past CREATED — returning paid with current state ${currentState}`);
    return NextResponse.json({
      data: { paid: true, funded: true, task, settledAt: paymentStatus.settledAt?.toISOString() },
      error: null,
    });
  }

  console.log("[PAYMENT-STATUS] Not paid yet");
  return NextResponse.json({
    data: { paid: false },
    error: null,
  });
}
