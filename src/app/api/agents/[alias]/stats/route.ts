import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getScoreBand } from "@/lib/reputation";

export async function GET(
  _request: Request,
  { params }: { params: { alias: string } }
) {
  const supabase = createClient();

  // Get agent
  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("*")
    .eq("alias", params.alias)
    .single();

  if (agentError || !agent) {
    return NextResponse.json(
      { data: null, error: "Agent not found" },
      { status: 404 }
    );
  }

  // Get last 20 reputation events with task titles
  const { data: repEvents } = await supabase
    .from("reputation_events")
    .select("*, tasks!inner(title)")
    .eq("agent_id", agent.id)
    .order("created_at", { ascending: false })
    .limit(20);

  // Flatten task title into events
  const eventsWithTitles = (repEvents ?? []).map((event) => ({
    id: event.id,
    agent_id: event.agent_id,
    task_id: event.task_id,
    event_type: event.event_type,
    score_delta: event.score_delta,
    created_at: event.created_at,
    task_title: (event as Record<string, unknown>).tasks
      ? ((event as Record<string, unknown>).tasks as { title: string }).title
      : null,
  }));

  // Calculate score history (last 10 events with before/after scores)
  const last10 = eventsWithTitles.slice(0, 10).reverse();
  let runningScore = agent.reputation_score;
  // Walk backward to find starting score
  for (const event of eventsWithTitles.slice(0, 10)) {
    runningScore -= event.score_delta;
  }
  runningScore = Math.max(0, Math.min(1000, runningScore));

  const scoreHistory = last10.map((event) => {
    const before = runningScore;
    runningScore = Math.max(0, Math.min(1000, runningScore + event.score_delta));
    return {
      event_type: event.event_type,
      score_delta: event.score_delta,
      score_before: before,
      score_after: runningScore,
      created_at: event.created_at,
    };
  });

  // Calculate derived stats
  const totalTasks = agent.total_tasks_completed + agent.total_tasks_disputed;
  const completionRate =
    totalTasks > 0
      ? Math.round((agent.total_tasks_completed / totalTasks) * 100)
      : 0;
  const disputeRate =
    totalTasks > 0
      ? Math.round((agent.total_tasks_disputed / totalTasks) * 100)
      : 0;

  // Average score received from verification events
  const completionEvents = (repEvents ?? []).filter(
    (e) => e.event_type === "COMPLETED" || e.event_type === "PERFECT"
  );
  const averageScoreReceived =
    completionEvents.length > 0
      ? Math.round(
          completionEvents.reduce((sum, e) => sum + e.score_delta, 0) /
            completionEvents.length
        )
      : 0;

  const totalVolumeSats = agent.total_sats_earned + agent.total_sats_paid;

  const scoreBand = getScoreBand(agent.reputation_score);

  return NextResponse.json({
    data: {
      agent: {
        alias: agent.alias,
        reputation_score: agent.reputation_score,
        score_band: scoreBand,
        total_tasks_completed: agent.total_tasks_completed,
        total_tasks_disputed: agent.total_tasks_disputed,
        total_sats_earned: agent.total_sats_earned,
        total_sats_paid: agent.total_sats_paid,
        last_active: agent.last_active,
        created_at: agent.created_at,
        pubkey: agent.pubkey,
      },
      stats: {
        completion_rate: completionRate,
        dispute_rate: disputeRate,
        average_score_received: averageScoreReceived,
        total_volume_sats: totalVolumeSats,
      },
      reputation_events: eventsWithTitles,
      score_history: scoreHistory,
    },
    error: null,
  });
}
