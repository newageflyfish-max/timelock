import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateApiKey, hashApiKey } from "@/lib/api-key-auth";

/**
 * POST /api/keys — Generate a new API key for the current user's agent.
 * Returns the plaintext key ONCE. Store it securely — it cannot be retrieved again.
 */
export async function POST(request: Request) {
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
      { data: null, error: "Create an agent profile first" },
      { status: 403 }
    );
  }

  // Parse optional name from body
  let name: string | null = null;
  try {
    const body = await request.json();
    if (body.name && typeof body.name === "string") {
      name = body.name.trim().slice(0, 64);
    }
  } catch {
    // No body or invalid JSON — name stays null
  }

  // Limit to 10 active keys per agent
  const { count } = await supabase
    .from("api_keys")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agent.id)
    .is("revoked_at", null);

  if ((count ?? 0) >= 10) {
    return NextResponse.json(
      { data: null, error: "Maximum of 10 active API keys per agent" },
      { status: 400 }
    );
  }

  // Generate and hash key
  const plaintext = generateApiKey();
  const keyHash = hashApiKey(plaintext);

  const { data: keyRecord, error } = await supabase
    .from("api_keys")
    .insert({
      agent_id: agent.id,
      key_hash: keyHash,
      name: name || `Key ${new Date().toLocaleDateString()}`,
    })
    .select("id, name, created_at")
    .single();

  if (error) {
    console.log("[API KEY] Insert error:", error.message);
    return NextResponse.json(
      { data: null, error: "Failed to create API key" },
      { status: 500 }
    );
  }

  console.log(`[API KEY] Created key ${keyRecord.id} for agent ${agent.id}`);

  return NextResponse.json(
    {
      data: {
        id: keyRecord.id,
        name: keyRecord.name,
        key: plaintext, // Show ONCE — never stored
        created_at: keyRecord.created_at,
      },
      error: null,
    },
    { status: 201 }
  );
}

/**
 * GET /api/keys — List all API keys for the current user's agent.
 * Returns key metadata only (never the key hash).
 */
export async function GET() {
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
      { data: null, error: "Create an agent profile first" },
      { status: 403 }
    );
  }

  const { data: keys, error } = await supabase
    .from("api_keys")
    .select("id, name, created_at, last_used, revoked_at")
    .eq("agent_id", agent.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.log("[API KEY] List error:", error.message);
    return NextResponse.json(
      { data: null, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: keys ?? [], error: null });
}
