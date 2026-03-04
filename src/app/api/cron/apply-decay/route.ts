import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { clampReputation } from "@/lib/types";
import { getScoreDecay } from "@/lib/reputation";

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
  const now = new Date();
  const thirtyDaysAgo = new Date(
    now.getTime() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  // Find agents inactive 30+ days
  const { data: inactiveAgents, error: queryError } = await supabase
    .from("agents")
    .select("id, alias, reputation_score, last_active")
    .lt("last_active", thirtyDaysAgo);

  if (queryError) {
    console.log("[DECAY CRON] Query error:", queryError.message);
    return NextResponse.json(
      { data: null, error: queryError.message },
      { status: 500 }
    );
  }

  if (!inactiveAgents || inactiveAgents.length === 0) {
    console.log("[DECAY CRON] No inactive agents to decay");
    return NextResponse.json({
      data: { updated_count: 0 },
      error: null,
    });
  }

  let updatedCount = 0;

  for (const agent of inactiveAgents) {
    const lastActive = new Date(agent.last_active);
    const delta = getScoreDecay(lastActive, agent.reputation_score);

    if (delta === 0) continue;

    const newScore = clampReputation(agent.reputation_score + delta);

    // Update agent score
    const { error: updateError } = await supabase
      .from("agents")
      .update({ reputation_score: newScore })
      .eq("id", agent.id);

    if (updateError) {
      console.log(
        `[DECAY CRON] Failed to update agent ${agent.alias}:`,
        updateError.message
      );
      continue;
    }

    // Create decay reputation event
    await supabase.from("reputation_events").insert({
      agent_id: agent.id,
      task_id: null,
      event_type: "DECAY",
      score_delta: delta,
    });

    console.log(
      `[DECAY CRON] ${agent.alias}: ${agent.reputation_score} → ${newScore} (delta: ${delta})`
    );
    updatedCount++;
  }

  console.log(`[DECAY CRON] Updated ${updatedCount} agents`);

  return NextResponse.json({
    data: { updated_count: updatedCount },
    error: null,
  });
}
