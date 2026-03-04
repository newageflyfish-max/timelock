#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const TIMELOCK_API_KEY = process.env.TIMELOCK_API_KEY ?? "";
const TIMELOCK_API_URL =
  process.env.TIMELOCK_API_URL ?? "https://timelock.network";

if (!TIMELOCK_API_KEY) {
  console.error(
    "TIMELOCK_API_KEY environment variable is required. Get one at https://timelock.network/dashboard"
  );
  process.exit(1);
}

// --- API Client ---

async function apiRequest<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const url = `${TIMELOCK_API_URL}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TIMELOCK_API_KEY}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const json = (await res.json()) as { data?: T; error?: string };

  if (!res.ok || json.error) {
    throw new Error(json.error ?? `API error: ${res.status}`);
  }

  return json.data as T;
}

// --- MCP Server ---

const server = new McpServer({
  name: "timelock",
  version: "1.0.0",
  description:
    "Trust and reputation layer for Lightning agent commerce",
});

// 1. timelock_create_task
server.tool(
  "timelock_create_task",
  "Create a new escrow task. Locks payment until work is verified.",
  {
    title: z.string().describe("Title of the task"),
    description: z.string().describe("Detailed description of the work"),
    seller_alias: z
      .string()
      .describe("Alias of the agent doing the work"),
    amount_sats: z
      .number()
      .int()
      .positive()
      .max(1_000_000)
      .describe("Payment amount in satoshis (max 1,000,000)"),
    delivery_deadline: z
      .string()
      .describe("Delivery deadline as ISO 8601 datetime"),
    arbiter_alias: z
      .string()
      .optional()
      .describe("Alias of the dispute arbiter (optional)"),
  },
  async ({ title, description, seller_alias, amount_sats, delivery_deadline, arbiter_alias }) => {
    try {
      const task = await apiRequest<Record<string, unknown>>(
        "POST",
        "/api/tasks",
        {
          title,
          description,
          seller_alias,
          amount_sats,
          delivery_deadline,
          ...(arbiter_alias ? { arbiter_alias } : {}),
        }
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(task, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error creating task: ${(err as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// 2. timelock_fund_task
server.tool(
  "timelock_fund_task",
  "Generate Lightning invoice to fund escrow. Pay this invoice to lock sats.",
  {
    task_id: z.string().describe("UUID of the task to fund"),
  },
  async ({ task_id }) => {
    try {
      const result = await apiRequest<Record<string, unknown>>(
        "POST",
        `/api/tasks/${task_id}/fund`
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error funding task: ${(err as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// 3. timelock_check_status
server.tool(
  "timelock_check_status",
  "Check current state of a task and payment status.",
  {
    task_id: z.string().describe("UUID of the task to check"),
  },
  async ({ task_id }) => {
    try {
      const task = await apiRequest<Record<string, unknown>>(
        "GET",
        `/api/tasks/${task_id}`
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(task, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error checking task: ${(err as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// 4. timelock_deliver_work
server.tool(
  "timelock_deliver_work",
  "Mark work as delivered. Seller calls this when work is complete.",
  {
    task_id: z.string().describe("UUID of the task"),
    deliverable_url: z
      .string()
      .describe("URL where the completed work can be verified"),
  },
  async ({ task_id, deliverable_url }) => {
    try {
      const result = await apiRequest<Record<string, unknown>>(
        "POST",
        `/api/tasks/${task_id}/deliver`,
        { deliverable_url }
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error delivering work: ${(err as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// 5. timelock_verify_delivery
server.tool(
  "timelock_verify_delivery",
  "Verify delivered work and release payment to seller.",
  {
    task_id: z.string().describe("UUID of the task"),
    score: z
      .number()
      .int()
      .min(0)
      .max(100)
      .describe(
        "Quality score 0-100. 90-100: +100 rep (Perfect), 70-89: +50, 50-69: +25, <50: +10"
      ),
    seller_lightning_invoice: z
      .string()
      .describe(
        "Seller's BOLT11 Lightning invoice to receive payment (must start with lnbc)"
      ),
    evidence_url: z
      .string()
      .optional()
      .describe("URL of verification evidence (optional)"),
    notes: z
      .string()
      .optional()
      .describe("Verification notes (optional)"),
  },
  async ({ task_id, score, seller_lightning_invoice, evidence_url, notes }) => {
    try {
      const result = await apiRequest<Record<string, unknown>>(
        "POST",
        `/api/tasks/${task_id}/verify`,
        {
          score,
          seller_lightning_invoice,
          ...(evidence_url ? { evidence_url } : {}),
          ...(notes ? { notes } : {}),
        }
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error verifying delivery: ${(err as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// 6. timelock_open_dispute
server.tool(
  "timelock_open_dispute",
  "Open a dispute if delivered work is unsatisfactory. Costs -75 reputation to both parties.",
  {
    task_id: z.string().describe("UUID of the task to dispute"),
    reason: z.string().describe("Reason for opening the dispute"),
    evidence: z
      .string()
      .optional()
      .describe("URL or description of evidence (optional)"),
  },
  async ({ task_id, reason, evidence }) => {
    try {
      const result = await apiRequest<Record<string, unknown>>(
        "POST",
        `/api/tasks/${task_id}/dispute`,
        {
          reason,
          ...(evidence ? { evidence } : {}),
        }
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error opening dispute: ${(err as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// 7. timelock_get_reputation
server.tool(
  "timelock_get_reputation",
  "Get reputation score, band, and stats for any agent.",
  {
    alias: z
      .string()
      .describe("Alias of the agent to look up"),
  },
  async ({ alias }) => {
    try {
      const stats = await apiRequest<Record<string, unknown>>(
        "GET",
        `/api/agents/${alias}/stats`
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(stats, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error getting reputation: ${(err as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// 8. timelock_register_agent
server.tool(
  "timelock_register_agent",
  "Register a new agent identity on Timelock. Starting reputation: 500.",
  {
    alias: z
      .string()
      .min(3)
      .describe(
        "Unique identifier for this agent (min 3 chars, lowercase alphanumeric)"
      ),
    pubkey: z
      .string()
      .optional()
      .describe("Lightning node public key (optional)"),
  },
  async ({ alias, pubkey }) => {
    try {
      const agent = await apiRequest<Record<string, unknown>>(
        "POST",
        "/api/agents",
        {
          alias,
          ...(pubkey ? { pubkey } : {}),
        }
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(agent, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error registering agent: ${(err as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Timelock MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
