import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseTaskType, SYSTEM_PROMPTS, AGENT_ALIAS } from "./prompts";

// ---------------------------------------------------------------------------
// Timelock demo agent — auto-delivers tasks using Claude
// ---------------------------------------------------------------------------

const AGENT_DELAY_MS = 3_000; // 3 seconds — keep within Vercel timeout

// States that the agent considers valid for processing
const VALID_AGENT_STATES = new Set(["FUNDED", "CREATED"]);

interface AgentResult {
  success: boolean;
  error?: string;
}

/**
 * Main handler: auto-deliver a funded task using Claude AI.
 *
 * 1. Validate task is in a processable state (FUNDED or CREATED)
 * 2. Wait 3 seconds (short delay to avoid Vercel timeout)
 * 3. Generate AI response via Anthropic Claude
 * 4. Transition to DELIVERED (tries FUNDED first, falls back to CREATED)
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
    return { success: false, error: `Task not found: ${taskError?.message}` };
  }

  console.log(`[AGENT] Task ${taskId} state: ${task.state}`);

  if (!VALID_AGENT_STATES.has(task.state)) {
    return {
      success: false,
      error: `Task is in ${task.state}, expected FUNDED or CREATED`,
    };
  }

  // If task is still CREATED (replication lag), force it to FUNDED
  if (task.state === "CREATED") {
    console.log(`[AGENT] Task still in CREATED — forcing to FUNDED via admin`);
    const { error: forceErr } = await supabase
      .from("tasks")
      .update({ state: "FUNDED" })
      .eq("id", taskId);

    if (forceErr) {
      console.error("[AGENT] Force FUNDED failed:", forceErr.message);
      return { success: false, error: "Failed to force FUNDED state" };
    }
  }

  console.log(`[AGENT] Processing task ${taskId}`);

  // ---- 2. Short delay before AI generation ----
  await new Promise((resolve) => setTimeout(resolve, AGENT_DELAY_MS));

  // ---- 3. Re-check state ----
  const { data: freshTask } = await supabase
    .from("tasks")
    .select("state, metadata")
    .eq("id", taskId)
    .single();

  if (!freshTask || !VALID_AGENT_STATES.has(freshTask.state)) {
    return {
      success: false,
      error: `Task state changed during processing: ${freshTask?.state}`,
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

  // ---- 5. Transition to DELIVERED ----
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const deliverableUrl = `${appUrl}/tasks/${taskId}`;
  const now = new Date().toISOString();

  const isLate =
    task.delivery_deadline && new Date() > new Date(task.delivery_deadline);

  const metadata = {
    ...((freshTask.metadata as Record<string, unknown>) ?? {}),
    agent_response: agentResponse,
    agent_alias: AGENT_ALIAS,
    delivered_at: now,
    delivered_by: AGENT_ALIAS,
    ...(isLate ? { late: true } : {}),
  };

  // Try CAS from FUNDED first, then fallback to direct update
  let updated: Record<string, unknown>[] | null = null;
  let transitionError: { message: string } | null = null;

  // Attempt 1: CAS from FUNDED
  const result1 = await supabase
    .from("tasks")
    .update({
      state: "DELIVERED",
      deliverable_url: deliverableUrl,
      metadata,
    })
    .eq("id", taskId)
    .eq("state", "FUNDED")
    .select();

  if (!result1.error && result1.data && result1.data.length > 0) {
    updated = result1.data;
  } else {
    console.log(`[AGENT] CAS from FUNDED failed, trying from CREATED...`);

    // Attempt 2: CAS from CREATED (replication lag scenario)
    const result2 = await supabase
      .from("tasks")
      .update({
        state: "DELIVERED",
        deliverable_url: deliverableUrl,
        metadata,
      })
      .eq("id", taskId)
      .eq("state", "CREATED")
      .select();

    if (!result2.error && result2.data && result2.data.length > 0) {
      updated = result2.data;
    } else {
      transitionError = result2.error || { message: "No rows updated" };
    }
  }

  if (!updated || updated.length === 0) {
    return {
      success: false,
      error: `State transition failed: ${transitionError?.message || "task not in expected state"}`,
    };
  }

  console.log(
    `[AGENT] ✅ ${taskId} → DELIVERED (type: ${taskType}, ${agentResponse.length} chars)`
  );
  return { success: true };
}
