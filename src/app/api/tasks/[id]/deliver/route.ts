import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { canTransition } from "@/lib/types";
import type { TaskState } from "@/lib/types";
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

  if (task.seller_agent_id !== agent.id) {
    return NextResponse.json(
      { data: null, error: "Only the seller can mark a task as delivered" },
      { status: 403 }
    );
  }

  // FUNDED → DELIVERED only
  const currentState = task.state as TaskState;
  if (!canTransition(currentState, "DELIVERED")) {
    return NextResponse.json(
      {
        data: null,
        error: `Cannot deliver task in state ${currentState}. Task must be in FUNDED state.`,
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

  const { deliverable_url } = body as { deliverable_url?: string };

  if (
    !deliverable_url ||
    typeof deliverable_url !== "string" ||
    deliverable_url.trim().length === 0
  ) {
    return NextResponse.json(
      {
        data: null,
        error: "deliverable_url is required and must be a non-empty string",
      },
      { status: 400 }
    );
  }

  // Check if delivery is late
  const isLate =
    task.delivery_deadline && new Date() > new Date(task.delivery_deadline);

  const metadata = {
    ...(task.metadata as Record<string, unknown>),
    ...(isLate
      ? { late: true, delivered_at: new Date().toISOString() }
      : { delivered_at: new Date().toISOString() }),
  };

  const { data: updated, error: updateError } = await supabase
    .from("tasks")
    .update({
      state: "DELIVERED",
      deliverable_url: deliverable_url.trim(),
      metadata,
    })
    .eq("id", params.id)
    .select()
    .single();

  if (updateError) {
    console.log("[DELIVER] Task update error:", updateError.message);
    return NextResponse.json(
      { data: null, error: updateError.message },
      { status: 500 }
    );
  }

  console.log(
    `[TASK DELIVER] ${params.id} → FUNDED → DELIVERED${isLate ? " (LATE)" : ""}`
  );

  return NextResponse.json({ data: updated, error: null });
}
