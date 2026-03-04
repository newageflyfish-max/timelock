import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { clampReputation } from "@/lib/types";
import { payInvoice } from "@/lib/lightning";
import { atomicStateTransition } from "@/lib/task-transition";

const ABANDON_PENALTY = -200;

export async function POST(request: Request) {
  // Validate CRON_SECRET
  const cronSecret = request.headers.get("x-cron-secret");
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json(
      { data: null, error: "Unauthorized: invalid CRON_SECRET" },
      { status: 401 }
    );
  }

  const supabase = createClient();
  const now = new Date().toISOString();

  // Find all FUNDED tasks where delivery_deadline has passed
  const { data: expiredTasks, error: queryError } = await supabase
    .from("tasks")
    .select("*")
    .eq("state", "FUNDED")
    .lt("delivery_deadline", now)
    .not("delivery_deadline", "is", null);

  if (queryError) {
    console.log("[CRON] Query error:", queryError.message);
    return NextResponse.json(
      { data: null, error: queryError.message },
      { status: 500 }
    );
  }

  if (!expiredTasks || expiredTasks.length === 0) {
    console.log("[CRON] No tasks to expire");
    return NextResponse.json({
      data: { expired_count: 0, refund_results: [] },
      error: null,
    });
  }

  let expiredCount = 0;
  const refundResults: Array<{
    taskId: string;
    refunded: boolean;
    error?: string;
  }> = [];

  for (const task of expiredTasks) {
    // CRITICAL-1: Atomic CAS transition FUNDED → EXPIRED
    const transition = await atomicStateTransition(
      task.id,
      "FUNDED",
      "EXPIRED"
    );

    if (!transition.success) {
      console.log(
        `[CRON] Failed to expire task ${task.id}: ${transition.error}`
      );
      refundResults.push({
        taskId: task.id,
        refunded: false,
        error: transition.error,
      });
      continue;
    }

    // Check if buyer has a refund invoice stored in escrow or metadata
    const { data: escrow } = await supabase
      .from("escrow_holds")
      .select("*")
      .eq("task_id", task.id)
      .eq("state", "HELD")
      .single();

    const buyerRefundInvoice =
      escrow?.refund_invoice ||
      ((task.metadata as Record<string, unknown>)?.buyer_refund_invoice as
        | string
        | undefined);

    // Attempt Lightning refund if invoice available
    if (buyerRefundInvoice) {
      try {
        const refundResult = await payInvoice(
          buyerRefundInvoice,
          task.amount_sats
        );
        if (refundResult.success) {
          console.log(
            `[CRON] Refund sent for task ${task.id}: ${task.amount_sats} sats (hash: ${refundResult.paymentHash?.slice(0, 16)})`
          );
          refundResults.push({ taskId: task.id, refunded: true });
        } else {
          console.log(
            `[CRON] Refund failed for task ${task.id}: ${refundResult.error}`
          );
          refundResults.push({
            taskId: task.id,
            refunded: false,
            error: refundResult.error,
          });
        }
      } catch (err) {
        console.log(
          `[CRON] Refund error for task ${task.id}: ${(err as Error).message}`
        );
        refundResults.push({
          taskId: task.id,
          refunded: false,
          error: (err as Error).message,
        });
      }
    } else {
      console.log(
        `[CRON] No refund invoice for task ${task.id} — escrow marked as refunded (manual refund required)`
      );
      refundResults.push({
        taskId: task.id,
        refunded: false,
        error: "No refund invoice available",
      });
    }

    // Update escrow state
    await supabase
      .from("escrow_holds")
      .update({ state: "REFUNDED", released_at: now })
      .eq("task_id", task.id)
      .eq("state", "HELD");

    // Apply ABANDONED reputation penalty to seller (-200)
    if (task.seller_agent_id) {
      const { data: seller } = await supabase
        .from("agents")
        .select("reputation_score")
        .eq("id", task.seller_agent_id)
        .single();

      if (seller) {
        await supabase
          .from("agents")
          .update({
            reputation_score: clampReputation(
              seller.reputation_score + ABANDON_PENALTY
            ),
            last_active: now,
          })
          .eq("id", task.seller_agent_id);
      }

      await supabase.from("reputation_events").insert({
        agent_id: task.seller_agent_id,
        task_id: task.id,
        event_type: "ABANDONED",
        score_delta: ABANDON_PENALTY,
      });
    }

    console.log(
      `[CRON EXPIRE] ${task.id} → FUNDED → EXPIRED (seller: ${task.seller_agent_id || "none"})`
    );
    expiredCount++;
  }

  console.log(`[CRON] Expired ${expiredCount} tasks`);

  return NextResponse.json({
    data: { expired_count: expiredCount, refund_results: refundResults },
    error: null,
  });
}
