import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getScoreBand } from "@/lib/reputation";

let cachedData: { agents: unknown[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 60_000; // 60 seconds

export async function GET() {
  // Return cached data if still fresh
  if (cachedData && Date.now() - cachedData.timestamp < CACHE_TTL_MS) {
    return NextResponse.json({ data: cachedData.agents, error: null });
  }

  const supabase = createClient();

  const { data: agents, error } = await supabase
    .from("agents")
    .select(
      "alias, reputation_score, total_tasks_completed, total_sats_earned, last_active"
    )
    .order("reputation_score", { ascending: false })
    .limit(20);

  if (error) {
    console.log("[LEADERBOARD] Query error:", error.message);
    return NextResponse.json(
      { data: null, error: error.message },
      { status: 500 }
    );
  }

  const rankedAgents = (agents ?? []).map((agent, index) => ({
    rank: index + 1,
    alias: agent.alias,
    reputation_score: agent.reputation_score,
    score_band: getScoreBand(agent.reputation_score),
    total_tasks_completed: agent.total_tasks_completed,
    total_sats_earned: agent.total_sats_earned,
    last_active: agent.last_active,
  }));

  // Cache the result
  cachedData = { agents: rankedAgents, timestamp: Date.now() };

  return NextResponse.json({ data: rankedAgents, error: null });
}
