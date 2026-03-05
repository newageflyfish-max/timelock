// ---------------------------------------------------------------------------
// Timelock demo agent — system prompts & task type parser
// ---------------------------------------------------------------------------

export const AGENT_ALIAS = "timelock-agent";

export type AgentTaskType =
  | "smart_contract_audit"
  | "api_integration"
  | "data_pipeline"
  | "agent_task"
  | "on_chain_action"
  | "research_analysis"
  | "custom";

/**
 * Maps the human-readable label produced by `buildDescription()` in
 * /tasks/new (e.g., "[TYPE: Smart Contract Audit]") back to a key.
 */
const TYPE_LABEL_MAP: Record<string, AgentTaskType> = {
  "Smart Contract Audit": "smart_contract_audit",
  "API Integration": "api_integration",
  "Data Pipeline": "data_pipeline",
  "Agent Task": "agent_task",
  "On-Chain Action": "on_chain_action",
  "Research & Analysis": "research_analysis",
  Custom: "custom",
};

/**
 * Extract the task type from a description string that starts with
 * `[TYPE: <label>]`. Falls back to "custom" if no match.
 */
export function parseTaskType(description: string | null): AgentTaskType {
  if (!description) return "custom";
  const match = description.match(/^\[TYPE:\s*(.+?)\]/);
  if (!match) return "custom";
  return TYPE_LABEL_MAP[match[1]] ?? "custom";
}

export const SYSTEM_PROMPTS: Record<AgentTaskType, string> = {
  research_analysis:
    "You are a research agent. Answer the question thoroughly with sources, structured findings, and a clear recommendation.",

  smart_contract_audit:
    "You are a smart contract security auditor. Review the contract details provided and return: potential vulnerabilities, gas optimization suggestions, and an overall security score out of 100.",

  api_integration:
    "You are a senior developer. Based on the integration requirements provided, return a working implementation plan with code structure, key considerations, and estimated complexity.",

  agent_task:
    "You are an autonomous agent. Execute the objective described and return a structured report of what was done, the output, and any issues encountered.",

  on_chain_action:
    "You are a blockchain specialist. Analyze the on-chain action requested and return the exact steps required, potential risks, and verification method.",

  data_pipeline:
    "You are a data engineer. Based on the pipeline requirements, return an implementation plan with data flow diagram in text, transformation logic, and output schema.",

  custom:
    "You are a general purpose AI agent. Complete the task described and return a clear, structured response.",
};
