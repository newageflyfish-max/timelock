import { createClient } from "@/lib/supabase/server";
import type { TaskState } from "@/lib/types";
import { canTransition } from "@/lib/types";

interface TransitionSuccess {
  success: true;
  task: Record<string, unknown>;
}

interface TransitionFailure {
  success: false;
  error: string;
}

type TransitionResult = TransitionSuccess | TransitionFailure;

/**
 * CRITICAL-1: Atomically transition a task's state using compare-and-swap (CAS).
 *
 * Prevents race conditions by including the expected state in the
 * UPDATE WHERE clause. If another request changed the state first,
 * zero rows are updated and we return a conflict error.
 *
 * This replaces the read-then-write pattern that was vulnerable to
 * race conditions (e.g., /verify vs /dispute both reading DELIVERED
 * state simultaneously).
 *
 * @param taskId - The task UUID
 * @param expectedState - The state we expect the task to be in
 * @param newState - The state to transition to
 * @param additionalUpdates - Optional extra columns to update atomically
 * @returns TransitionResult with the updated task or an error
 */
export async function atomicStateTransition(
  taskId: string,
  expectedState: TaskState,
  newState: TaskState,
  additionalUpdates?: Record<string, unknown>
): Promise<TransitionResult> {
  // Validate the transition is allowed by the state machine
  if (!canTransition(expectedState, newState)) {
    return {
      success: false,
      error: `Invalid transition: ${expectedState} → ${newState}`,
    };
  }

  const supabase = createClient();

  // Atomic CAS: only updates if state still matches expectedState
  const { data, error } = await supabase
    .from("tasks")
    .update({ state: newState, ...(additionalUpdates ?? {}) })
    .eq("id", taskId)
    .eq("state", expectedState)
    .select();

  if (error) {
    return { success: false, error: error.message };
  }

  if (!data || data.length === 0) {
    return {
      success: false,
      error: `State conflict: task is no longer in ${expectedState} state. Another request may have modified it.`,
    };
  }

  return { success: true, task: data[0] };
}
