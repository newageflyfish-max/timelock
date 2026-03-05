"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Task type definitions
// ---------------------------------------------------------------------------

type TaskType =
  | "smart_contract_audit"
  | "api_integration"
  | "data_pipeline"
  | "agent_task"
  | "on_chain_action"
  | "research_analysis"
  | "custom";

interface TaskTypeOption {
  value: TaskType;
  label: string;
}

const TASK_TYPES: TaskTypeOption[] = [
  { value: "smart_contract_audit", label: "Smart Contract Audit" },
  { value: "api_integration", label: "API Integration" },
  { value: "data_pipeline", label: "Data Pipeline" },
  { value: "agent_task", label: "Agent Task" },
  { value: "on_chain_action", label: "On-Chain Action" },
  { value: "research_analysis", label: "Research & Analysis" },
  { value: "custom", label: "Custom" },
];

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none";

// ---------------------------------------------------------------------------
// Sat presets per task type
// ---------------------------------------------------------------------------

const SAT_PRESETS: Record<TaskType, number[]> = {
  smart_contract_audit: [250_000, 500_000, 750_000],
  api_integration: [100_000, 250_000, 500_000],
  data_pipeline: [100_000, 250_000, 500_000],
  agent_task: [10_000, 25_000, 50_000],
  on_chain_action: [5_000, 10_000, 25_000],
  research_analysis: [25_000, 50_000, 100_000],
  custom: [10_000, 50_000, 100_000],
};

const MAX_ESCROW_SATS = 1_000_000;

function fmtPresetSats(sats: number): string {
  if (sats >= 1_000_000) return `${sats / 1_000_000}M`;
  if (sats >= 1_000) return `${sats / 1_000}k`;
  return sats.toString();
}

function satsToUsd(sats: number, btcPrice: number | null): string | null {
  if (btcPrice === null) return null;
  const usd = (sats / 100_000_000) * btcPrice;
  if (usd < 0.01) return usd.toFixed(4);
  return usd.toFixed(2);
}

// ---------------------------------------------------------------------------
// Structured field builders per task type
// ---------------------------------------------------------------------------

function SmartContractAuditFields({
  fields,
  set,
}: {
  fields: Record<string, string>;
  set: (k: string, v: string) => void;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label>Contract Address or Repo URL</Label>
        <Input
          placeholder="0x... or https://github.com/..."
          value={fields.contract ?? ""}
          onChange={(e) => set("contract", e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Chain</Label>
        <select
          className={selectClass}
          value={fields.chain ?? ""}
          onChange={(e) => set("chain", e.target.value)}
          required
        >
          <option value="" disabled>
            Select chain
          </option>
          <option value="Bitcoin / Lightning">Bitcoin / Lightning</option>
          <option value="Base">Base</option>
          <option value="Ethereum">Ethereum</option>
          <option value="Solana">Solana</option>
          <option value="Other">Other</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label>Audit Focus</Label>
        <select
          className={selectClass}
          value={fields.focus ?? ""}
          onChange={(e) => set("focus", e.target.value)}
          required
        >
          <option value="" disabled>
            Select focus
          </option>
          <option value="Security">Security</option>
          <option value="Gas optimization">Gas optimization</option>
          <option value="Logic review">Logic review</option>
          <option value="Full audit">Full audit</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label>Success Criteria</Label>
        <Textarea
          placeholder="What does a passing audit look like?"
          value={fields.criteria ?? ""}
          onChange={(e) => set("criteria", e.target.value)}
          rows={3}
          required
        />
      </div>
    </>
  );
}

function ApiIntegrationFields({
  fields,
  set,
}: {
  fields: Record<string, string>;
  set: (k: string, v: string) => void;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label>API Name and Docs URL</Label>
        <Input
          placeholder="e.g., Stripe API — https://docs.stripe.com"
          value={fields.api ?? ""}
          onChange={(e) => set("api", e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label>What Needs to Be Built</Label>
        <Textarea
          placeholder="Describe the integration requirements..."
          value={fields.requirements ?? ""}
          onChange={(e) => set("requirements", e.target.value)}
          rows={3}
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Output</Label>
        <select
          className={selectClass}
          value={fields.output ?? ""}
          onChange={(e) => set("output", e.target.value)}
          required
        >
          <option value="" disabled>
            Select output type
          </option>
          <option value="Working code">Working code</option>
          <option value="Documentation">Documentation</option>
          <option value="Both">Both</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label>Language / Framework</Label>
        <Input
          placeholder="e.g., TypeScript / Next.js"
          value={fields.language ?? ""}
          onChange={(e) => set("language", e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Success Criteria</Label>
        <Textarea
          placeholder="How will you verify the integration works?"
          value={fields.criteria ?? ""}
          onChange={(e) => set("criteria", e.target.value)}
          rows={3}
          required
        />
      </div>
    </>
  );
}

function DataPipelineFields({
  fields,
  set,
}: {
  fields: Record<string, string>;
  set: (k: string, v: string) => void;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label>Data Source</Label>
        <Input
          placeholder="e.g., PostgreSQL database, REST API, S3 bucket..."
          value={fields.source ?? ""}
          onChange={(e) => set("source", e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Transform</Label>
        <Textarea
          placeholder="What needs to happen to the data?"
          value={fields.transform ?? ""}
          onChange={(e) => set("transform", e.target.value)}
          rows={3}
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Output Format</Label>
        <select
          className={selectClass}
          value={fields.outputFormat ?? ""}
          onChange={(e) => set("outputFormat", e.target.value)}
          required
        >
          <option value="" disabled>
            Select output format
          </option>
          <option value="JSON">JSON</option>
          <option value="CSV">CSV</option>
          <option value="Database">Database</option>
          <option value="API endpoint">API endpoint</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label>Success Criteria</Label>
        <Textarea
          placeholder="How will you confirm the pipeline is correct?"
          value={fields.criteria ?? ""}
          onChange={(e) => set("criteria", e.target.value)}
          rows={3}
          required
        />
      </div>
    </>
  );
}

function AgentTaskFields({
  fields,
  set,
}: {
  fields: Record<string, string>;
  set: (k: string, v: string) => void;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label>Objective</Label>
        <Textarea
          placeholder="What should the agent accomplish?"
          value={fields.objective ?? ""}
          onChange={(e) => set("objective", e.target.value)}
          rows={3}
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Input Context</Label>
        <Textarea
          placeholder="What data or access does the agent need?"
          value={fields.context ?? ""}
          onChange={(e) => set("context", e.target.value)}
          rows={3}
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Output Format</Label>
        <select
          className={selectClass}
          value={fields.outputFormat ?? ""}
          onChange={(e) => set("outputFormat", e.target.value)}
          required
        >
          <option value="" disabled>
            Select output format
          </option>
          <option value="Text">Text</option>
          <option value="JSON">JSON</option>
          <option value="File">File</option>
          <option value="Action taken">Action taken</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label>Verification Method</Label>
        <Textarea
          placeholder="How will you confirm it worked?"
          value={fields.verification ?? ""}
          onChange={(e) => set("verification", e.target.value)}
          rows={3}
          required
        />
      </div>
    </>
  );
}

function OnChainActionFields({
  fields,
  set,
}: {
  fields: Record<string, string>;
  set: (k: string, v: string) => void;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label>Protocol</Label>
        <Input
          placeholder="e.g., Uniswap, Aave, Jupiter..."
          value={fields.protocol ?? ""}
          onChange={(e) => set("protocol", e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Action Required</Label>
        <Textarea
          placeholder="Describe the on-chain action..."
          value={fields.action ?? ""}
          onChange={(e) => set("action", e.target.value)}
          rows={3}
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Chain</Label>
        <select
          className={selectClass}
          value={fields.chain ?? ""}
          onChange={(e) => set("chain", e.target.value)}
          required
        >
          <option value="" disabled>
            Select chain
          </option>
          <option value="Base">Base</option>
          <option value="Ethereum">Ethereum</option>
          <option value="Solana">Solana</option>
          <option value="Other">Other</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label>Verification</Label>
        <select
          className={selectClass}
          value={fields.verification ?? ""}
          onChange={(e) => set("verification", e.target.value)}
          required
        >
          <option value="" disabled>
            Select verification method
          </option>
          <option value="TX hash">TX hash</option>
          <option value="State change">State change</option>
          <option value="Other">Other</option>
        </select>
      </div>
    </>
  );
}

function ResearchAnalysisFields({
  fields,
  set,
}: {
  fields: Record<string, string>;
  set: (k: string, v: string) => void;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label>Question</Label>
        <Textarea
          placeholder="What do you need researched or analyzed?"
          value={fields.question ?? ""}
          onChange={(e) => set("question", e.target.value)}
          rows={3}
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Sources</Label>
        <select
          className={selectClass}
          value={fields.sources ?? ""}
          onChange={(e) => set("sources", e.target.value)}
          required
        >
          <option value="" disabled>
            Select source type
          </option>
          <option value="On-chain data">On-chain data</option>
          <option value="Web">Web</option>
          <option value="Academic">Academic</option>
          <option value="Any">Any</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label>Output</Label>
        <select
          className={selectClass}
          value={fields.output ?? ""}
          onChange={(e) => set("output", e.target.value)}
          required
        >
          <option value="" disabled>
            Select output type
          </option>
          <option value="Report">Report</option>
          <option value="Summary">Summary</option>
          <option value="Raw data">Raw data</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label>Success Criteria</Label>
        <Textarea
          placeholder="How will you judge the quality of the research?"
          value={fields.criteria ?? ""}
          onChange={(e) => set("criteria", e.target.value)}
          rows={3}
          required
        />
      </div>
    </>
  );
}

function CustomFields({
  fields,
  set,
}: {
  fields: Record<string, string>;
  set: (k: string, v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>Description</Label>
      <Textarea
        placeholder="Describe the deliverable, acceptance criteria, and any constraints..."
        value={fields.description ?? ""}
        onChange={(e) => set("description", e.target.value)}
        rows={4}
        required
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Serialize structured fields → description string
// ---------------------------------------------------------------------------

function buildDescription(
  taskType: TaskType,
  fields: Record<string, string>
): string {
  const label =
    TASK_TYPES.find((t) => t.value === taskType)?.label ?? "Custom";

  switch (taskType) {
    case "smart_contract_audit":
      return [
        `[TYPE: ${label}]`,
        `CONTRACT: ${fields.contract ?? ""}`,
        `CHAIN: ${fields.chain ?? ""}`,
        `FOCUS: ${fields.focus ?? ""}`,
        `SUCCESS CRITERIA: ${fields.criteria ?? ""}`,
      ].join("\n");

    case "api_integration":
      return [
        `[TYPE: ${label}]`,
        `API: ${fields.api ?? ""}`,
        `REQUIREMENTS: ${fields.requirements ?? ""}`,
        `OUTPUT: ${fields.output ?? ""}`,
        `LANGUAGE/FRAMEWORK: ${fields.language ?? ""}`,
        `SUCCESS CRITERIA: ${fields.criteria ?? ""}`,
      ].join("\n");

    case "data_pipeline":
      return [
        `[TYPE: ${label}]`,
        `DATA SOURCE: ${fields.source ?? ""}`,
        `TRANSFORM: ${fields.transform ?? ""}`,
        `OUTPUT FORMAT: ${fields.outputFormat ?? ""}`,
        `SUCCESS CRITERIA: ${fields.criteria ?? ""}`,
      ].join("\n");

    case "agent_task":
      return [
        `[TYPE: ${label}]`,
        `OBJECTIVE: ${fields.objective ?? ""}`,
        `INPUT CONTEXT: ${fields.context ?? ""}`,
        `OUTPUT FORMAT: ${fields.outputFormat ?? ""}`,
        `VERIFICATION METHOD: ${fields.verification ?? ""}`,
      ].join("\n");

    case "on_chain_action":
      return [
        `[TYPE: ${label}]`,
        `PROTOCOL: ${fields.protocol ?? ""}`,
        `ACTION: ${fields.action ?? ""}`,
        `CHAIN: ${fields.chain ?? ""}`,
        `VERIFICATION: ${fields.verification ?? ""}`,
      ].join("\n");

    case "research_analysis":
      return [
        `[TYPE: ${label}]`,
        `QUESTION: ${fields.question ?? ""}`,
        `SOURCES: ${fields.sources ?? ""}`,
        `OUTPUT: ${fields.output ?? ""}`,
        `SUCCESS CRITERIA: ${fields.criteria ?? ""}`,
      ].join("\n");

    case "custom":
      return fields.description ?? "";

    default:
      return fields.description ?? "";
  }
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function NewTaskPage() {
  const [title, setTitle] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("custom");
  const [structuredFields, setStructuredFields] = useState<
    Record<string, string>
  >({});
  const [amountSats, setAmountSats] = useState("");
  const [sellerAlias, setSellerAlias] = useState("");
  const [deliveryDeadline, setDeliveryDeadline] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // ---- Real-time sat/USD conversion ----
  const [btcPrice, setBtcPrice] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchPrice() {
      try {
        const res = await fetch("https://mempool.space/api/v1/prices");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && typeof data.USD === "number") {
          setBtcPrice(data.USD);
        }
      } catch {
        // Non-fatal: conversion just won't show
      }
    }
    fetchPrice();
    return () => {
      cancelled = true;
    };
  }, []);

  const usdValue =
    btcPrice !== null && amountSats
      ? (parseInt(amountSats, 10) / 100_000_000) * btcPrice
      : null;

  const overCap = amountSats
    ? parseInt(amountSats, 10) > MAX_ESCROW_SATS
    : false;

  // ---- Field setter (resets fields on task type change) ----

  const setField = (key: string, value: string) => {
    setStructuredFields((prev) => ({ ...prev, [key]: value }));
  };

  const handleTaskTypeChange = (newType: TaskType) => {
    setTaskType(newType);
    setStructuredFields({});
  };

  // ---- Submit ----

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const amount = parseInt(amountSats, 10);
    if (isNaN(amount) || amount <= 0) {
      setError("Amount must be a positive number");
      setLoading(false);
      return;
    }

    if (amount > MAX_ESCROW_SATS) {
      setError("Maximum escrow amount is 1,000,000 sats on the free tier.");
      setLoading(false);
      return;
    }

    const description = buildDescription(taskType, structuredFields);
    if (!description.trim()) {
      setError("Please fill in the task details");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        amount_sats: amount,
        seller_alias: sellerAlias || undefined,
        delivery_deadline: deliveryDeadline || undefined,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to create task");
      setLoading(false);
      return;
    }

    const data = await res.json();
    router.push(`/tasks/${data.data?.id ?? data.id}`);
  };

  // ---- Render structured fields for selected task type ----

  function renderStructuredFields() {
    const props = { fields: structuredFields, set: setField };
    switch (taskType) {
      case "smart_contract_audit":
        return <SmartContractAuditFields {...props} />;
      case "api_integration":
        return <ApiIntegrationFields {...props} />;
      case "data_pipeline":
        return <DataPipelineFields {...props} />;
      case "agent_task":
        return <AgentTaskFields {...props} />;
      case "on_chain_action":
        return <OnChainActionFields {...props} />;
      case "research_analysis":
        return <ResearchAnalysisFields {...props} />;
      case "custom":
        return <CustomFields {...props} />;
      default:
        return <CustomFields {...props} />;
    }
  }

  return (
    <div className="container max-w-lg py-12">
      <Card>
        <CardHeader>
          <CardTitle>Create Escrow Task</CardTitle>
          <CardDescription>
            Define a deliverable, set the escrow amount, and assign a seller.
            Funds will be locked until the work is verified.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-md p-3">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="title">Task Title</Label>
              <Input
                id="title"
                placeholder="e.g., Audit Uniswap V4 hook contract"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            {/* ---- Task Type Selector ---- */}
            <div className="space-y-2">
              <Label htmlFor="taskType">Task Type</Label>
              <select
                id="taskType"
                className={selectClass}
                value={taskType}
                onChange={(e) =>
                  handleTaskTypeChange(e.target.value as TaskType)
                }
              >
                {TASK_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {/* ---- Structured Fields ---- */}
            {renderStructuredFields()}

            {/* ---- Escrow Amount + USD conversion ---- */}
            <div className="space-y-2">
              <Label htmlFor="amount">Escrow Amount (sats)</Label>
              <Input
                id="amount"
                type="number"
                placeholder="10000"
                value={amountSats}
                onChange={(e) => setAmountSats(e.target.value)}
                required
                min={1}
              />

              {/* Preset buttons */}
              <div className="flex flex-wrap gap-2">
                {SAT_PRESETS[taskType].map((preset) => {
                  const usd = satsToUsd(preset, btcPrice);
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAmountSats(preset.toString())}
                      className="rounded-md border border-input bg-background px-2.5 py-1 text-xs font-mono hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      {fmtPresetSats(preset)} sats
                      {usd && (
                        <span className="text-muted-foreground ml-1">
                          ≈ ${usd}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {overCap && (
                <p className="text-sm text-red-400">
                  Maximum escrow amount is 1,000,000 sats on the free tier.
                </p>
              )}

              <p className="text-xs text-muted-foreground">
                {usdValue !== null && !isNaN(usdValue) && usdValue > 0 ? (
                  <>
                    ≈ ${usdValue < 0.01 ? usdValue.toFixed(4) : usdValue.toFixed(2)} USD
                    <span className="mx-1">·</span>
                  </>
                ) : null}
                This amount will be locked in escrow when funded.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="seller">
                Seller Agent Alias{" "}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="seller"
                placeholder="e.g., data-agent-42"
                value={sellerAlias}
                onChange={(e) => setSellerAlias(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="deadline">
                Delivery Deadline{" "}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="deadline"
                type="datetime-local"
                value={deliveryDeadline}
                onChange={(e) => setDeliveryDeadline(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button
              type="submit"
              className="w-full"
              disabled={loading || overCap}
            >
              {loading ? "Creating..." : "Create Task"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
