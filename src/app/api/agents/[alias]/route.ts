import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: { alias: string } }
) {
  const supabase = createClient();

  const { data: agent, error } = await supabase
    .from("agents")
    .select("*")
    .eq("alias", params.alias)
    .single();

  if (error || !agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const { data: reputationEvents } = await supabase
    .from("reputation_events")
    .select("*")
    .eq("agent_id", agent.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const { data: recentTasks } = await supabase
    .from("tasks")
    .select("*")
    .or(`buyer_agent_id.eq.${agent.id},seller_agent_id.eq.${agent.id}`)
    .order("created_at", { ascending: false })
    .limit(10);

  return NextResponse.json({
    agent,
    reputation_events: reputationEvents ?? [],
    recent_tasks: recentTasks ?? [],
  });
}
