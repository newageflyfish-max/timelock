export type TaskState =
  | "CREATED"
  | "FUNDED"
  | "DELIVERED"
  | "VERIFIED"
  | "SETTLED"
  | "DISPUTED"
  | "RESOLVED"
  | "REFUNDED"
  | "EXPIRED";

export type VerificationResult = "PASS" | "FAIL" | "PARTIAL";

export type DisputeState = "OPEN" | "RESOLVED";

export type DisputeResolution = "BUYER_WINS" | "SELLER_WINS" | "SPLIT";

export type EscrowState = "PENDING" | "HELD" | "RELEASED" | "REFUNDED";

export type ReputationEventType =
  | "FUNDED"
  | "COMPLETED"
  | "PERFECT"
  | "DISPUTED"
  | "LATE"
  | "ABANDONED"
  | "DECAY";

export interface Agent {
  id: string;
  created_at: string;
  user_id: string;
  alias: string;
  pubkey: string | null;
  reputation_score: number;
  total_tasks_completed: number;
  total_tasks_disputed: number;
  total_sats_earned: number;
  total_sats_paid: number;
  last_active: string;
  metadata: Record<string, unknown>;
}

export interface Task {
  id: string;
  created_at: string;
  buyer_agent_id: string;
  seller_agent_id: string | null;
  title: string;
  description: string | null;
  deliverable_url: string | null;
  amount_sats: number;
  state: TaskState;
  payment_hash: string | null;
  delivery_deadline: string | null;
  verification_deadline: string | null;
  arbiter_agent_id: string | null;
  metadata: Record<string, unknown>;
  buyer_agent?: Agent;
  seller_agent?: Agent;
}

export interface EscrowHold {
  id: string;
  task_id: string;
  amount_sats: number;
  hold_invoice: string | null;
  release_invoice: string | null;
  refund_invoice: string | null;
  state: EscrowState;
  held_at: string | null;
  released_at: string | null;
  created_at: string;
}

export interface VerificationResultRecord {
  id: string;
  task_id: string;
  verifier_agent_id: string;
  result: VerificationResult;
  score: number | null;
  evidence_url: string | null;
  notes: string | null;
  created_at: string;
}

export interface Dispute {
  id: string;
  task_id: string;
  opened_by: string;
  reason: string;
  evidence: string | null;
  state: DisputeState;
  resolution: DisputeResolution | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface ReputationEvent {
  id: string;
  agent_id: string;
  task_id: string;
  event_type: ReputationEventType;
  score_delta: number;
  created_at: string;
}

// Phase 2 state machine — strict transitions
export const VALID_STATE_TRANSITIONS: Record<TaskState, TaskState[]> = {
  CREATED: ["FUNDED"],
  FUNDED: ["DELIVERED", "EXPIRED"],
  DELIVERED: ["VERIFIED", "DISPUTED"],
  VERIFIED: ["SETTLED"],
  SETTLED: [],
  DISPUTED: ["RESOLVED"],
  RESOLVED: ["SETTLED"],
  EXPIRED: ["REFUNDED"],
  REFUNDED: [],
};

export const MAX_ESCROW_SATS = 1_000_000;

export function clampReputation(score: number): number {
  return Math.max(0, Math.min(1000, score));
}

export function canTransition(from: TaskState, to: TaskState): boolean {
  return VALID_STATE_TRANSITIONS[from].includes(to);
}

// CRITICAL-4: Shared validator that throws on invalid transitions
export class StateTransitionError extends Error {
  public from: TaskState;
  public to: TaskState;
  constructor(from: TaskState, to: TaskState) {
    super(`Invalid state transition: ${from} → ${to}`);
    this.name = "StateTransitionError";
    this.from = from;
    this.to = to;
  }
}

export function validateTransition(from: TaskState, to: TaskState): void {
  if (!VALID_STATE_TRANSITIONS[from]?.includes(to)) {
    throw new StateTransitionError(from, to);
  }
}

// CRITICAL-2: Sybil reputation farming rate limits (completions per 24h)
export const COMPLETION_RATE_LIMITS: Record<string, number> = {
  Dev: 10,
  Builder: 50,
  Pro: 200,
};

// CRITICAL-3: Max concurrent active tasks per agent (FUNDED + DELIVERED + DISPUTED)
export const MAX_CONCURRENT_ACTIVE_TASKS = 10;

export interface SubscriptionTier {
  name: string;
  price: number;
  tasks_per_month: number;
  price_id: string;
  features: string[];
}

export const SUBSCRIPTION_TIERS: SubscriptionTier[] = [
  {
    name: "Dev",
    price: 0,
    tasks_per_month: 100,
    price_id: "",
    features: [
      "100 tasks/month",
      "Basic reputation score",
      "Community support",
      "API access",
    ],
  },
  {
    name: "Builder",
    price: 49,
    tasks_per_month: 2000,
    price_id: "builder",
    features: [
      "2,000 tasks/month",
      "Advanced reputation analytics",
      "Priority support",
      "Webhook integrations",
      "Custom arbiter selection",
    ],
  },
  {
    name: "Pro",
    price: 149,
    tasks_per_month: 20000,
    price_id: "pro",
    features: [
      "20,000 tasks/month",
      "Enterprise reputation API",
      "Dedicated support",
      "SLA guarantees",
      "Custom escrow logic",
      "Multi-agent management",
    ],
  },
];
