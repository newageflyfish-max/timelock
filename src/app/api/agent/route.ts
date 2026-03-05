import { NextResponse } from "next/server";
import { handleAgentDelivery } from "@/lib/agent";

// Vercel Pro: allow 60s execution for 30s delay + AI generation
export const maxDuration = 60;

export async function POST(request: Request) {
  // Auth via x-agent-secret (same pattern as cron routes use x-cron-secret)
  const agentSecret = request.headers.get("x-agent-secret");
  if (!agentSecret || agentSecret !== process.env.AGENT_SECRET) {
    return NextResponse.json(
      { data: null, error: "Unauthorized: invalid AGENT_SECRET" },
      { status: 401 }
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

  const { task_id } = body as { task_id?: string };
  if (!task_id || typeof task_id !== "string") {
    return NextResponse.json(
      { data: null, error: "task_id is required" },
      { status: 400 }
    );
  }

  const result = await handleAgentDelivery(task_id);

  if (!result.success) {
    console.log(`[AGENT] Failed for task ${task_id}: ${result.error}`);
    return NextResponse.json(
      { data: null, error: result.error },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: { delivered: true }, error: null });
}
