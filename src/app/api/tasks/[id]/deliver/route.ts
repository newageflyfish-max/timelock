import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { validateTransition } from "@/lib/types";
import type { TaskState } from "@/lib/types";
import { authenticateRequest } from "@/lib/api-key-auth";
import { atomicStateTransition } from "@/lib/task-transition";

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

  // CRITICAL-4: Use centralized validator
  const currentState = task.state as TaskState;
  try {
    validateTransition(currentState, "DELIVERED");
  } catch {
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

  // CRITICAL-1: Atomic CAS transition FUNDED → DELIVERED
  const transition = await atomicStateTransition(
    params.id,
    "FUNDED",
    "DELIVERED",
    {
      deliverable_url: deliverable_url.trim(),
      metadata,
    }
  );

  if (!transition.success) {
    console.log("[DELIVER] State conflict:", transition.error);
    return NextResponse.json(
      { data: null, error: transition.error },
      { status: 409 }
    );
  }

  console.log(
    `[TASK DELIVER] ${params.id} → FUNDED → DELIVERED${isLate ? " (LATE)" : ""}`
  );

  return NextResponse.json({ data: transition.task, error: null });
}
