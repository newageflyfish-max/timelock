import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * DELETE /api/keys/[id] — Revoke an API key (soft delete via revoked_at).
 * Only the key's owner can revoke it.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { data: null, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { data: agent } = await supabase
    .from("agents")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!agent) {
    return NextResponse.json(
      { data: null, error: "Agent not found" },
      { status: 403 }
    );
  }

  // Verify the key belongs to this agent
  const { data: keyRecord } = await supabase
    .from("api_keys")
    .select("id, agent_id, revoked_at")
    .eq("id", params.id)
    .single();

  if (!keyRecord) {
    return NextResponse.json(
      { data: null, error: "API key not found" },
      { status: 404 }
    );
  }

  if (keyRecord.agent_id !== agent.id) {
    return NextResponse.json(
      { data: null, error: "Not authorized to revoke this key" },
      { status: 403 }
    );
  }

  if (keyRecord.revoked_at) {
    return NextResponse.json(
      { data: null, error: "Key already revoked" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", params.id);

  if (error) {
    console.log("[API KEY] Revoke error:", error.message);
    return NextResponse.json(
      { data: null, error: "Failed to revoke key" },
      { status: 500 }
    );
  }

  console.log(`[API KEY] Revoked key ${params.id} for agent ${agent.id}`);

  return NextResponse.json({ data: { revoked: true }, error: null });
}
