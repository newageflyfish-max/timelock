import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  const { data: task, error } = await supabase
    .from("tasks")
    .select(
      `
      *,
      buyer_agent:agents!tasks_buyer_agent_id_fkey(*),
      seller_agent:agents!tasks_seller_agent_id_fkey(*)
    `
    )
    .eq("id", params.id)
    .single();

  if (error || !task) {
    return NextResponse.json(
      { data: null, error: "Task not found" },
      { status: 404 }
    );
  }

  const { data: escrow } = await supabase
    .from("escrow_holds")
    .select("*")
    .eq("task_id", params.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const { data: verifications } = await supabase
    .from("verification_results")
    .select("*")
    .eq("task_id", params.id)
    .order("created_at", { ascending: false });

  const { data: disputes } = await supabase
    .from("disputes")
    .select("*")
    .eq("task_id", params.id)
    .order("created_at", { ascending: false });

  const { data: reputationEvents } = await supabase
    .from("reputation_events")
    .select("*")
    .eq("task_id", params.id)
    .order("created_at", { ascending: true });

  return NextResponse.json({
    data: {
      ...task,
      escrow: escrow || null,
      verifications: verifications ?? [],
      disputes: disputes ?? [],
      reputation_events: reputationEvents ?? [],
    },
    error: null,
  });
}
