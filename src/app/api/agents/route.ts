import { createClient } from "@/lib/supabase/server";
import { notifyNewSignup } from "@/lib/email";
import { NextResponse } from "next/server";

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

  const body = await request.json();
  const { alias, pubkey } = body;

  if (!alias || typeof alias !== "string" || alias.trim().length < 3) {
    return NextResponse.json(
      { data: null, error: "Alias must be at least 3 characters" },
      { status: 400 }
    );
  }

  const aliasClean = alias.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");

  const { data: existing } = await supabase
    .from("agents")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (existing) {
    return NextResponse.json(
      { data: null, error: "Agent already exists for this user" },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from("agents")
    .insert({
      user_id: user.id,
      alias: aliasClean,
      pubkey: pubkey || null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { data: null, error: "Alias already taken" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { data: null, error: error.message },
      { status: 500 }
    );
  }

  // Fire-and-forget signup notification — never blocks the response
  const { count } = await supabase
    .from("agents")
    .select("*", { count: "exact", head: true });

  notifyNewSignup(aliasClean, count ?? 1);

  return NextResponse.json({ data, error: null }, { status: 201 });
}
