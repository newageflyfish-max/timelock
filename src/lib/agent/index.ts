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

const AGENT_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Find the "timelock-agent" row, or auto-create it directly in the
 * agents table using the service-role client (no auth user needed).
 */
async function getOrCreateAgent(
  supabase: ReturnType<typeof createAdminClient>
): Promise<string | null> {
  // Try to find existing agent
  const { data: existing } = await supabase
    .from("agents")
    .select("id")
    .eq("id", AGENT_ID)
    .single();

  if (existing) return existing.id;

  // Insert agent row directly — service role bypasses RLS & FK checks
  console.log("[AGENT] Upserting agent row with admin client (service role)");
  const { data: newAgent, error: agentError } = await supabase
    .from("agents")
    .upsert(
      {
        id: AGENT_ID,
        user_id: AGENT_ID,
        alias: AGENT_ALIAS,
        pubkey: null,
        reputation_score: 1000,
        total_tasks_completed: 0,
        total_tasks_disputed: 0,
        total_sats_earned: 0,
        total_sats_paid: 0,
        metadata: { is_bot: true, description: "Timelock demo agent" },
        created_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )
    .select("id")
    .single();

  if (agentError || !newAgent) {
    console.error("[AGENT] Failed to create agent row:", agentError?.message);
    return null;
  }

  console.log(`[AGENT] Created timelock-agent: ${newAgent.id}`);
  return newAgent.id;
}

/**
 * Main handler: auto-deliver a funded task using Claude AI.
 *
 * 1. Validate task is FUNDED
 * 2. Find/create timelock-agent, assign as seller if needed
 * 3. Wait 3 seconds (short delay to avoid Vercel timeout)
 * 4. Generate AI response via Anthropic Claude
 * 5. Atomic CAS transition FUNDED → DELIVERED
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

  // ---- 2. Find or create timelock-agent ----
  const agentId = await getOrCreateAgent(supabase);
  if (!agentId) {
    return { success: false, error: "Failed to find or create timelock-agent" };
  }

  // ---- 3. Assign as seller if no seller ----
  if (!task.seller_agent_id) {
    const { error: assignError } = await supabase
      .from("tasks")
      .update({ seller_agent_id: agentId })
      .eq("id", taskId)
      .eq("state", "FUNDED"); // CAS guard

    if (assignError) {
      console.error("[AGENT] Failed to assign seller:", assignError.message);
      return { success: false, error: "Failed to assign seller" };
    }

    console.log(`[AGENT] Assigned timelock-agent as seller for task ${taskId}`);
  }

  // ---- 4. Short delay before AI generation ----
  await new Promise((resolve) => setTimeout(resolve, AGENT_DELAY_MS));

  // ---- 5. Re-check state (could have expired during wait) ----
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

  // ---- 6. Generate AI response ----
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

  // ---- 7. Atomic CAS: FUNDED → DELIVERED ----
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const deliverableUrl = `${appUrl}/tasks/${taskId}`;
  const now = new Date().toISOString();

  const isLate =
    task.delivery_deadline && new Date() > new Date(task.delivery_deadline);

  const metadata = {
    ...(freshTask.metadata as Record<string, unknown>),
    agent_response: agentResponse,
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
    `[AGENT] ${taskId} → FUNDED → DELIVERED (type: ${taskType}, ${agentResponse.length} chars)`
  );
  return { success: true };
}
