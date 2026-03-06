import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseTaskType, SYSTEM_PROMPTS, AGENT_ALIAS } from "./prompts";

// ---------------------------------------------------------------------------
// Timelock demo agent — auto-delivers tasks using Claude
// ---------------------------------------------------------------------------

const AGENT_DELAY_MS = 3_000; // 3 seconds — keep within Vercel timeout

interface AgentResult {
  success: boolean;
  error?: string;
}

/**
 * Main handler: auto-deliver a funded task using Claude AI.
 *
 * 1. Validate task is FUNDED
 * 2. Wait 3 seconds (short delay to avoid Vercel timeout)
 * 3. Generate AI response via Anthropic Claude
 * 4. Atomic CAS transition FUNDED → DELIVERED
 *
 * No agent row is created — the bot identity is stored in task metadata
 * as agent_alias: "timelock-agent" to avoid RLS issues.
 */
export async function handleAgentDelivery(
  taskId: string
): Promise<AgentResult> {
  const supabase = createAdminClient();

  // ---- 1. Fetch and validate task ----
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .single();

  if (taskError || !task) {
    return { success: false, error: "Task not found" };
  }

  if (task.state !== "FUNDED") {
    return {
      success: false,
      error: `Task is in ${task.state}, expected FUNDED`,
    };
  }

  console.log(`[AGENT] Processing task ${taskId} (state: ${task.state})`);

  // ---- 2. Short delay before AI generation ----
  await new Promise((resolve) => setTimeout(resolve, AGENT_DELAY_MS));

  // ---- 3. Re-check state (could have expired during wait) ----
  const { data: freshTask } = await supabase
    .from("tasks")
    .select("state, metadata")
    .eq("id", taskId)
    .single();

  if (!freshTask || freshTask.state !== "FUNDED") {
    return {
      success: false,
      error: "Task state changed during agent processing",
    };
  }

  // ---- 4. Generate AI response ----
  const taskType = parseTaskType(task.description);
  const systemPrompt = SYSTEM_PROMPTS[taskType];

  let agentResponse: string;
  try {
    const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Task: ${task.title}\n\nDescription:\n${task.description ?? "No description provided."}`,
        },
      ],
    });

    agentResponse =
      message.content[0].type === "text"
        ? message.content[0].text
        : "Agent could not generate a response.";
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown AI error";
    console.error("[AGENT] Claude API error:", errMsg);
    return { success: false, error: `AI generation failed: ${errMsg}` };
  }

  // ---- 5. Atomic CAS: FUNDED → DELIVERED ----
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const deliverableUrl = `${appUrl}/tasks/${taskId}`;
  const now = new Date().toISOString();

  const isLate =
    task.delivery_deadline && new Date() > new Date(task.delivery_deadline);

  const metadata = {
    ...(freshTask.metadata as Record<string, unknown>),
    agent_response: agentResponse,
    agent_alias: AGENT_ALIAS,
    delivered_at: now,
    delivered_by: AGENT_ALIAS,
    ...(isLate ? { late: true } : {}),
  };

  const { data: updated, error: transitionError } = await supabase
    .from("tasks")
    .update({
      state: "DELIVERED",
      deliverable_url: deliverableUrl,
      metadata,
    })
    .eq("id", taskId)
    .eq("state", "FUNDED") // CAS guard
    .select();

  if (transitionError || !updated || updated.length === 0) {
    return {
      success: false,
      error: `State transition failed: ${transitionError?.message || "task no longer in FUNDED state"}`,
    };
  }

  console.log(
    `[AGENT] ✅ ${taskId} → FUNDED → DELIVERED (type: ${taskType}, ${agentResponse.length} chars)`
  );
  return { success: true };
}
