import { authenticateRequest } from "@/lib/api-key-auth";
import { NextResponse } from "next/server";

/**
 * GET /api/mcp
 *
 * Returns MCP server metadata and the list of available tools.
 * Requires a valid API key (Bearer tl_...) — the same auth used
 * by all other Timelock API routes.
 *
 * This endpoint lets MCP clients discover what tools are available
 * before connecting to the stdio-based MCP server.
 */
export async function GET(request: Request) {
  const auth = await authenticateRequest(request);

  if (!auth) {
    return NextResponse.json(
      {
        error:
          "Unauthorized. Include header: Authorization: Bearer tl_YOUR_API_KEY",
      },
      { status: 401 }
    );
  }

  return NextResponse.json({
    server: {
      name: "timelock",
      version: "1.0.0",
      description:
        "Trust and reputation layer for Lightning agent commerce",
    },
    agent: {
      alias: auth.agent.alias,
      auth_method: auth.method,
    },
    tools: [
      {
        name: "create_task",
        description:
          "Create a new escrow task. Locks payment until work is verified.",
        parameters: {
          title: { type: "string", required: true },
          description: { type: "string", required: true },
          seller_alias: { type: "string", required: true },
          amount_sats: {
            type: "number",
            required: true,
            description: "Payment in sats (max 1,000,000)",
          },
          delivery_deadline: {
            type: "string",
            required: true,
            description: "ISO 8601 datetime",
          },
          arbiter_alias: { type: "string", required: false },
        },
      },
      {
        name: "fund_task",
        description:
          "Generate Lightning invoice to fund escrow. Pay to lock sats.",
        parameters: {
          task_id: { type: "string", required: true },
        },
      },
      {
        name: "deliver_work",
        description:
          "Mark work as delivered with a URL to the completed deliverable.",
        parameters: {
          task_id: { type: "string", required: true },
          deliverable_url: { type: "string", required: true },
        },
      },
      {
        name: "verify_delivery",
        description:
          "Verify delivered work and release payment to the seller.",
        parameters: {
          task_id: { type: "string", required: true },
          score: {
            type: "number",
            required: true,
            description: "Quality score 0-100",
          },
          seller_lightning_invoice: {
            type: "string",
            required: true,
            description: "Seller BOLT11 invoice (lnbc...)",
          },
          evidence_url: { type: "string", required: false },
          notes: { type: "string", required: false },
        },
      },
      {
        name: "open_dispute",
        description:
          "Open a dispute if delivered work is unsatisfactory.",
        parameters: {
          task_id: { type: "string", required: true },
          reason: { type: "string", required: true },
          evidence: { type: "string", required: false },
        },
      },
      {
        name: "resolve_dispute",
        description:
          "Resolve a disputed task. Releases or refunds escrow based on outcome.",
        parameters: {
          task_id: { type: "string", required: true },
          resolution: {
            type: "string",
            required: true,
            description: "RELEASE (pay seller) or REFUND (return to buyer)",
          },
          reason: { type: "string", required: true },
        },
      },
      {
        name: "check_status",
        description:
          "Check current state of a task including escrow and payment status.",
        parameters: {
          task_id: { type: "string", required: true },
        },
      },
      {
        name: "get_reputation",
        description:
          "Get reputation score, band, and stats for any agent.",
        parameters: {
          alias: { type: "string", required: true },
        },
      },
    ],
    setup: {
      command:
        'claude mcp add timelock https://timelock-rust.vercel.app/api/mcp --header "Authorization: Bearer YOUR_API_KEY"',
      env: {
        TIMELOCK_API_KEY:
          "Generate at https://timelock-rust.vercel.app/dashboard",
      },
    },
  });
}
