import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { canTransition, clampReputation } from "@/lib/types";
import type { TaskState } from "@/lib/types";
import { authenticateRequest } from "@/lib/api-key-auth";

const DISPUTE_PENALTY = -75;

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

  const isBuyer = task.buyer_agent_id === agent.id;
  const isSeller = task.seller_agent_id === agent.id;

  if (!isBuyer && !isSeller) {
    return NextResponse.json(
      { data: null, error: "Only task participants can open disputes" },
      { status: 403 }
    );
  }

  // DELIVERED → DISPUTED only
  const currentState = task.state as TaskState;
  if (!canTransition(currentState, "DISPUTED")) {
    return NextResponse.json(
      {
        data: null,
        error: `Cannot dispute task in state ${currentState}. Task must be in DELIVERED state.`,
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

  const { reason, evidence } = body as {
    reason?: string;
    evidence?: string;
  };

  if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
    return NextResponse.json(
      {
        data: null,
        error: "reason is required and must be a non-empty string",
      },
      { status: 400 }
    );
  }

  // Create dispute
  const { data: dispute, error: disputeError } = await supabase
    .from("disputes")
    .insert({
      task_id: params.id,
      opened_by: agent.id,
      reason: reason.trim(),
      evidence: evidence || null,
      state: "OPEN",
    })
    .select()
    .single();

  if (disputeError) {
    console.log("[DISPUTE] Insert error:", disputeError.message);
    return NextResponse.json(
      { data: null, error: "Failed to create dispute" },
      { status: 500 }
    );
  }

  // Move task to DISPUTED
  const { data: updated, error: updateError } = await supabase
    .from("tasks")
    .update({ state: "DISPUTED" })
    .eq("id", params.id)
    .select()
    .single();

  if (updateError) {
    console.log("[DISPUTE] Task update error:", updateError.message);
    return NextResponse.json(
      { data: null, error: updateError.message },
      { status: 500 }
    );
  }

  // Apply -75 reputation to BOTH parties
  const { data: buyerAgent } = await supabase
    .from("agents")
    .select("reputation_score, total_tasks_disputed")
    .eq("id", task.buyer_agent_id)
    .single();

  if (buyerAgent) {
    await supabase
      .from("agents")
      .update({
        reputation_score: clampReputation(
          buyerAgent.reputation_score + DISPUTE_PENALTY
        ),
        total_tasks_disputed: buyerAgent.total_tasks_disputed + 1,
        last_active: new Date().toISOString(),
      })
      .eq("id", task.buyer_agent_id);

    await supabase.from("reputation_events").insert({
      agent_id: task.buyer_agent_id,
      task_id: params.id,
      event_type: "DISPUTED",
      score_delta: DISPUTE_PENALTY,
    });
  }

  if (task.seller_agent_id) {
    const { data: sellerAgent } = await supabase
      .from("agents")
      .select("reputation_score, total_tasks_disputed")
      .eq("id", task.seller_agent_id)
      .single();

    if (sellerAgent) {
      await supabase
        .from("agents")
        .update({
          reputation_score: clampReputation(
            sellerAgent.reputation_score + DISPUTE_PENALTY
          ),
          total_tasks_disputed: sellerAgent.total_tasks_disputed + 1,
          last_active: new Date().toISOString(),
        })
        .eq("id", task.seller_agent_id);

      await supabase.from("reputation_events").insert({
        agent_id: task.seller_agent_id,
        task_id: params.id,
        event_type: "DISPUTED",
        score_delta: DISPUTE_PENALTY,
      });
    }
  }

  console.log(
    `[TASK DISPUTE] ${params.id} → DELIVERED → DISPUTED (by ${isBuyer ? "buyer" : "seller"})`
  );

  return NextResponse.json({
    data: { task: updated, dispute },
    error: null,
  });
}
