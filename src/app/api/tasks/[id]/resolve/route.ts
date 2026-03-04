import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { canTransition, clampReputation } from "@/lib/types";
import type { TaskState, DisputeResolution } from "@/lib/types";
import { payInvoice, VoltageError } from "@/lib/lightning";
import { authenticateRequest } from "@/lib/api-key-auth";

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

  // Must be the arbiter
  if (task.arbiter_agent_id !== agent.id) {
    return NextResponse.json(
      {
        data: null,
        error:
          "Only the designated arbiter can resolve a dispute. This task's arbiter_agent_id does not match your agent.",
      },
      { status: 403 }
    );
  }

  // DISPUTED → RESOLVED only
  const currentState = task.state as TaskState;
  if (!canTransition(currentState, "RESOLVED")) {
    return NextResponse.json(
      {
        data: null,
        error: `Cannot resolve task in state ${currentState}. Task must be in DISPUTED state.`,
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

  const { resolution, buyer_invoice, seller_invoice } = body as {
    resolution?: string;
    buyer_invoice?: string;
    seller_invoice?: string;
  };

  const validResolutions: DisputeResolution[] = [
    "BUYER_WINS",
    "SELLER_WINS",
    "SPLIT",
  ];

  if (
    !resolution ||
    !validResolutions.includes(resolution as DisputeResolution)
  ) {
    return NextResponse.json(
      {
        data: null,
        error:
          "resolution is required and must be one of: BUYER_WINS, SELLER_WINS, SPLIT",
      },
      { status: 400 }
    );
  }

  const typedResolution = resolution as DisputeResolution;

  // Validate required invoices based on resolution
  if (typedResolution === "BUYER_WINS") {
    if (
      !buyer_invoice ||
      typeof buyer_invoice !== "string" ||
      !buyer_invoice.startsWith("lnbc")
    ) {
      return NextResponse.json(
        {
          data: null,
          error:
            "buyer_invoice is required for BUYER_WINS resolution and must start with 'lnbc'",
        },
        { status: 400 }
      );
    }
  } else if (typedResolution === "SELLER_WINS") {
    if (
      !seller_invoice ||
      typeof seller_invoice !== "string" ||
      !seller_invoice.startsWith("lnbc")
    ) {
      return NextResponse.json(
        {
          data: null,
          error:
            "seller_invoice is required for SELLER_WINS resolution and must start with 'lnbc'",
        },
        { status: 400 }
      );
    }
  } else {
    // SPLIT — both invoices required
    if (
      !buyer_invoice ||
      typeof buyer_invoice !== "string" ||
      !buyer_invoice.startsWith("lnbc")
    ) {
      return NextResponse.json(
        {
          data: null,
          error:
            "buyer_invoice is required for SPLIT resolution and must start with 'lnbc'",
        },
        { status: 400 }
      );
    }
    if (
      !seller_invoice ||
      typeof seller_invoice !== "string" ||
      !seller_invoice.startsWith("lnbc")
    ) {
      return NextResponse.json(
        {
          data: null,
          error:
            "seller_invoice is required for SPLIT resolution and must start with 'lnbc'",
        },
        { status: 400 }
      );
    }
  }

  const now = new Date().toISOString();

  // Update the dispute record
  const { data: dispute, error: disputeError } = await supabase
    .from("disputes")
    .update({
      state: "RESOLVED",
      resolution,
      resolved_by: agent.id,
      resolved_at: now,
    })
    .eq("task_id", params.id)
    .eq("state", "OPEN")
    .select()
    .single();

  if (disputeError) {
    console.log("[RESOLVE] Dispute update error:", disputeError.message);
    return NextResponse.json(
      { data: null, error: "Failed to update dispute" },
      { status: 500 }
    );
  }

  // Execute Lightning payment based on resolution
  try {
    if (typedResolution === "BUYER_WINS") {
      // Refund buyer
      const result = await payInvoice(buyer_invoice!, task.amount_sats);
      if (!result.success) {
        console.log(`[RESOLVE] Buyer refund failed: ${result.error}`);
        return NextResponse.json(
          {
            data: null,
            error: `Lightning refund to buyer failed: ${result.error}`,
          },
          { status: 500 }
        );
      }
      console.log(
        `[RESOLVE] Buyer refund sent: ${task.amount_sats} sats (hash: ${result.paymentHash?.slice(0, 16)})`
      );
    } else if (typedResolution === "SELLER_WINS") {
      // Pay seller
      const result = await payInvoice(seller_invoice!, task.amount_sats);
      if (!result.success) {
        console.log(`[RESOLVE] Seller payment failed: ${result.error}`);
        return NextResponse.json(
          {
            data: null,
            error: `Lightning payment to seller failed: ${result.error}`,
          },
          { status: 500 }
        );
      }
      console.log(
        `[RESOLVE] Seller payment sent: ${task.amount_sats} sats (hash: ${result.paymentHash?.slice(0, 16)})`
      );
    } else {
      // SPLIT — pay both proportionally (50/50)
      const halfAmount = Math.floor(task.amount_sats / 2);
      const remainderAmount = task.amount_sats - halfAmount;

      const buyerResult = await payInvoice(buyer_invoice!, halfAmount);
      if (!buyerResult.success) {
        console.log(`[RESOLVE] Buyer split payment failed: ${buyerResult.error}`);
        return NextResponse.json(
          {
            data: null,
            error: `Lightning split payment to buyer failed: ${buyerResult.error}`,
          },
          { status: 500 }
        );
      }

      const sellerResult = await payInvoice(seller_invoice!, remainderAmount);
      if (!sellerResult.success) {
        console.log(
          `[RESOLVE] Seller split payment failed: ${sellerResult.error}`
        );
        return NextResponse.json(
          {
            data: null,
            error: `Lightning split payment to seller failed: ${sellerResult.error}. Buyer already received ${halfAmount} sats.`,
          },
          { status: 500 }
        );
      }

      console.log(
        `[RESOLVE] Split payment: buyer ${halfAmount} sats, seller ${remainderAmount} sats`
      );
    }
  } catch (err) {
    if (err instanceof VoltageError) {
      return NextResponse.json(
        { data: null, error: "Lightning service unavailable" },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { data: null, error: "Lightning payment failed" },
      { status: 500 }
    );
  }

  // Move task: DISPUTED → RESOLVED → SETTLED
  const { data: updated, error: updateError } = await supabase
    .from("tasks")
    .update({ state: "SETTLED" })
    .eq("id", params.id)
    .select()
    .single();

  if (updateError) {
    console.log("[RESOLVE] Task update error:", updateError.message);
    return NextResponse.json(
      { data: null, error: updateError.message },
      { status: 500 }
    );
  }

  // Apply reputation deltas based on resolution
  if (typedResolution === "BUYER_WINS") {
    // Seller loses additional -150
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
              seller.reputation_score - 150
            ),
            last_active: now,
          })
          .eq("id", task.seller_agent_id);
      }

      await supabase.from("reputation_events").insert({
        agent_id: task.seller_agent_id,
        task_id: params.id,
        event_type: "DISPUTED",
        score_delta: -150,
      });
    }

    // Buyer reputation restored (+75)
    const { data: buyerData } = await supabase
      .from("agents")
      .select("reputation_score")
      .eq("id", task.buyer_agent_id)
      .single();

    if (buyerData) {
      await supabase
        .from("agents")
        .update({
          reputation_score: clampReputation(
            buyerData.reputation_score + 75
          ),
          last_active: now,
        })
        .eq("id", task.buyer_agent_id);
    }

    await supabase.from("reputation_events").insert({
      agent_id: task.buyer_agent_id,
      task_id: params.id,
      event_type: "COMPLETED",
      score_delta: 75,
    });

    // Update escrow — refunded to buyer
    await supabase
      .from("escrow_holds")
      .update({
        state: "REFUNDED",
        refund_invoice: buyer_invoice,
        released_at: now,
      })
      .eq("task_id", params.id)
      .eq("state", "HELD");
  } else if (typedResolution === "SELLER_WINS") {
    // Buyer loses additional -50
    const { data: buyerData } = await supabase
      .from("agents")
      .select("reputation_score")
      .eq("id", task.buyer_agent_id)
      .single();

    if (buyerData) {
      await supabase
        .from("agents")
        .update({
          reputation_score: clampReputation(
            buyerData.reputation_score - 50
          ),
          last_active: now,
        })
        .eq("id", task.buyer_agent_id);
    }

    await supabase.from("reputation_events").insert({
      agent_id: task.buyer_agent_id,
      task_id: params.id,
      event_type: "DISPUTED",
      score_delta: -50,
    });

    // Seller reputation restored (+75)
    if (task.seller_agent_id) {
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
              seller.reputation_score + 75
            ),
            total_tasks_completed: seller.total_tasks_completed + 1,
            total_sats_earned: seller.total_sats_earned + task.amount_sats,
            last_active: now,
          })
          .eq("id", task.seller_agent_id);
      }

      await supabase.from("reputation_events").insert({
        agent_id: task.seller_agent_id,
        task_id: params.id,
        event_type: "COMPLETED",
        score_delta: 75,
      });
    }

    // Update escrow — released to seller
    await supabase
      .from("escrow_holds")
      .update({
        state: "RELEASED",
        release_invoice: seller_invoice,
        released_at: now,
      })
      .eq("task_id", params.id)
      .eq("state", "HELD");
  } else {
    // SPLIT — both get additional -25
    const { data: buyerData } = await supabase
      .from("agents")
      .select("reputation_score")
      .eq("id", task.buyer_agent_id)
      .single();

    if (buyerData) {
      await supabase
        .from("agents")
        .update({
          reputation_score: clampReputation(
            buyerData.reputation_score - 25
          ),
          last_active: now,
        })
        .eq("id", task.buyer_agent_id);
    }

    await supabase.from("reputation_events").insert({
      agent_id: task.buyer_agent_id,
      task_id: params.id,
      event_type: "DISPUTED",
      score_delta: -25,
    });

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
              seller.reputation_score - 25
            ),
            last_active: now,
          })
          .eq("id", task.seller_agent_id);
      }

      await supabase.from("reputation_events").insert({
        agent_id: task.seller_agent_id,
        task_id: params.id,
        event_type: "DISPUTED",
        score_delta: -25,
      });
    }

    // Update escrow — released (split is conceptual)
    await supabase
      .from("escrow_holds")
      .update({
        state: "RELEASED",
        release_invoice: seller_invoice,
        refund_invoice: buyer_invoice,
        released_at: now,
      })
      .eq("task_id", params.id)
      .eq("state", "HELD");
  }

  console.log(
    `[TASK RESOLVE] ${params.id} → DISPUTED → RESOLVED → SETTLED (${resolution})`
  );

  return NextResponse.json({
    data: { task: updated, dispute },
    error: null,
  });
}
