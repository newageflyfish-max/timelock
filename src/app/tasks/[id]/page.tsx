"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { TaskStateBadge } from "@/components/task-state-badge";
import { formatSats, formatDateTime } from "@/lib/utils";
import type {
  Task,
  TaskState,
  Agent,
  EscrowHold,
  VerificationResultRecord,
  Dispute,
  ReputationEvent,
} from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, ExternalLink, AlertTriangle, Gavel, Copy, Check } from "lucide-react";

interface TaskDetail extends Omit<Task, "buyer_agent" | "seller_agent"> {
  buyer_agent: Agent;
  seller_agent: Agent | null;
  escrow: EscrowHold | null;
  verifications: VerificationResultRecord[];
  disputes: Dispute[];
  reputation_events: ReputationEvent[];
}

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [deliverableUrl, setDeliverableUrl] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [verifyScore, setVerifyScore] = useState("100");
  const [verifyNotes, setVerifyNotes] = useState("");
  const [sellerInvoice, setSellerInvoice] = useState("");
  const [resolution, setResolution] = useState<string>("BUYER_WINS");
  const [buyerInvoice, setBuyerInvoice] = useState("");
  const [resolveSellerInvoice, setResolveSellerInvoice] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Fund confirmation state
  const [showFundConfirm, setShowFundConfirm] = useState(false);
  const [btcPrice, setBtcPrice] = useState<number | null>(null);

  // Lightning invoice state
  const [invoice, setInvoice] = useState<string | null>(null);
  const [invoiceExpiry, setInvoiceExpiry] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const supabase = createClient();

  const loadTask = useCallback(async () => {
    const res = await fetch(`/api/tasks/${params.id}?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const json = await res.json();
    console.log("[TASK DETAIL] loadTask fresh state:", json.data?.state);
    setTask(json.data as TaskDetail);
  }, [params.id]);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: agent } = await supabase
          .from("agents")
          .select("id")
          .eq("user_id", user.id)
          .single();
        if (agent) setAgentId(agent.id);
      }

      const res = await fetch(`/api/tasks/${params.id}?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        router.push("/dashboard");
        return;
      }
      const json = await res.json();
      const loaded = json.data as TaskDetail;
      console.log("[TASK DETAIL] Initial load — state:", loaded.state, "escrow:", loaded.escrow?.state);
      setTask(loaded);

      // Restore invoice display + polling if task has a pending escrow
      // (handles page refresh after "Fund Escrow" but before payment confirmed)
      if (
        loaded.state === "CREATED" &&
        loaded.payment_hash &&
        loaded.escrow?.hold_invoice &&
        loaded.escrow.state === "PENDING"
      ) {
        console.log(
          "[TASK DETAIL] Restoring pending invoice from escrow, resuming poll"
        );
        setInvoice(loaded.escrow.hold_invoice);
        const expiry = (loaded.metadata as Record<string, unknown>)
          ?.invoice_expiry as string | undefined;
        if (expiry) setInvoiceExpiry(expiry);
        setPolling(true);
      }

      setLoading(false);
    }

    load();
  }, [params.id, router, supabase, loadTask]);

  // Payment polling
  useEffect(() => {
    if (!polling || !task) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/tasks/${params.id}/payment-status`, {
          method: "POST",
          cache: "no-store",
        });
        const json = await res.json();
        console.log("[POLL] payment-status response:", json);

        if (json.data?.paid) {
          console.log("[POLL] ✅ Payment confirmed — updating UI to FUNDED");
          // Immediately update local state
          setPolling(false);
          setInvoice(null);
          setTask((prev) =>
            prev ? { ...prev, state: "FUNDED" as TaskState } : prev
          );
          // Then do a full refresh for complete data
          await loadTask();
        }
      } catch (err) {
        console.error("[POLL] Error:", err);
      }
    };

    // Fire immediately on first poll cycle, then every 5s
    poll();
    pollRef.current = setInterval(poll, 5000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [polling, task, params.id, loadTask]);

  // Fetch BTC price for USD display in fund confirmation
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
        // Non-fatal
      }
    }
    fetchPrice();
    return () => {
      cancelled = true;
    };
  }, []);

  const doAction = async (
    action: string,
    body: Record<string, unknown> = {}
  ) => {
    setActionLoading(true);
    setError(null);

    const res = await fetch(`/api/tasks/${params.id}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = await res.json();

    if (!res.ok) {
      setError(json.error || "Action failed");
      setActionLoading(false);
      return;
    }

    // Handle fund response
    if (action === "fund") {
      if (json.data?.mock) {
        // Mock mode: task is already FUNDED on the server — update UI instantly
        console.log("[FUND] ✅ Mock mode — task instantly funded");
        setTask((prev) =>
          prev ? { ...prev, state: "FUNDED" as TaskState } : prev
        );
        await loadTask();
        setActionLoading(false);
        return;
      }
      // Live mode: show invoice and start polling
      if (json.data?.invoice) {
        setInvoice(json.data.invoice);
        setInvoiceExpiry(json.data.expiryAt || null);
        setPolling(true);
      }
    }

    // Reload full task
    await loadTask();
    setActionLoading(false);
  };

  const copyInvoice = async () => {
    if (!invoice) return;
    await navigator.clipboard.writeText(invoice);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const checkPaymentNow = async () => {
    setActionLoading(true);
    const res = await fetch(`/api/tasks/${params.id}/payment-status`, {
      method: "POST",
      cache: "no-store",
    });
    const json = await res.json();
    console.log("[CHECK NOW] payment-status response:", json);

    if (json.data?.paid) {
      console.log("[CHECK NOW] ✅ Payment confirmed — updating UI to FUNDED");
      setPolling(false);
      setInvoice(null);
      // Immediately update local state
      setTask((prev) =>
        prev ? { ...prev, state: "FUNDED" as TaskState } : prev
      );
      // Then full refresh
      await loadTask();
    } else if (json.error) {
      setError(json.error);
    }
    setActionLoading(false);
  };

  if (loading) {
    return (
      <div className="container max-w-2xl py-12">
        <div className="space-y-4">
          <div className="h-8 w-64 bg-muted rounded animate-pulse" />
          <div className="h-48 bg-muted rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  if (!task) return null;

  const isBuyer = agentId === task.buyer_agent_id;
  const isSeller = agentId === task.seller_agent_id;
  const isArbiter = agentId === task.arbiter_agent_id;
  const state = task.state as TaskState;
  const isLate = !!(task.metadata as Record<string, unknown>)?.late;

  return (
    <div className="container max-w-2xl py-8 space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Dashboard
      </Link>

      {/* Task Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <TaskStateBadge state={state} />
          {isLate && (
            <Badge
              variant="outline"
              className="text-xs font-mono bg-orange-950 text-orange-400 border-orange-800"
            >
              LATE
            </Badge>
          )}
          <span className="font-mono text-sm text-muted-foreground">
            {task.id.slice(0, 8)}
          </span>
        </div>
        <h1 className="text-2xl font-bold">{task.title}</h1>
        {task.description && (
          <p className="text-muted-foreground">{task.description}</p>
        )}
      </div>

      {/* Details Card */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-4 py-6">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Escrow Amount
            </p>
            <p className="font-mono font-bold text-lg">
              {formatSats(task.amount_sats)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Created
            </p>
            <p className="text-sm">{formatDateTime(task.created_at)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Buyer
            </p>
            <Link
              href={`/agents/${task.buyer_agent?.alias}`}
              className="text-sm text-primary hover:underline font-mono"
            >
              @{task.buyer_agent?.alias}
            </Link>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Seller
            </p>
            {task.seller_agent ? (
              <Link
                href={`/agents/${task.seller_agent.alias}`}
                className="text-sm text-primary hover:underline font-mono"
              >
                @{task.seller_agent.alias}
              </Link>
            ) : (
              <p className="text-sm text-muted-foreground">Unassigned</p>
            )}
          </div>
          {task.delivery_deadline && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Delivery Deadline
              </p>
              <p className="text-sm">
                {formatDateTime(task.delivery_deadline)}
              </p>
            </div>
          )}
          {task.deliverable_url && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Deliverable
              </p>
              <a
                href={task.deliverable_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline inline-flex items-center gap-1"
              >
                View <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
          {task.escrow && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Escrow State
              </p>
              <p className="text-sm font-mono">{task.escrow.state}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Agent Response */}
      {typeof (task.metadata as Record<string, unknown>)?.agent_response ===
        "string" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Agent Response
              <Badge
                variant="outline"
                className="text-xs font-mono bg-primary/10 text-primary border-primary/30"
              >
                timelock-agent
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm font-mono bg-muted rounded-lg p-4 overflow-auto max-h-96 leading-relaxed">
              {String(
                (task.metadata as Record<string, unknown>).agent_response
              )}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Lightning Invoice Display */}
      {invoice && (
        <Card className="border-primary/50">
          <CardHeader>
            <CardTitle className="text-base">Lightning Invoice</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="bg-muted rounded-lg p-4">
              <p className="font-mono text-xs break-all leading-relaxed select-all">
                {invoice}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={copyInvoice}
                className="gap-1"
              >
                {copied ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                {copied ? "Copied" : "Copy Invoice"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={checkPaymentNow}
                disabled={actionLoading}
              >
                Check Payment Status
              </Button>
            </div>
            {invoiceExpiry && (
              <p className="text-xs text-muted-foreground">
                Expires: {formatDateTime(invoiceExpiry)}
              </p>
            )}
            {polling && (
              <p className="text-xs text-primary">
                Auto-checking payment every 10 seconds...
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <div className="text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-md p-3">
          {error}
        </div>
      )}

      {/* Actions — role-based */}
      {agentId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* CREATED: buyer can fund */}
            {isBuyer && state === "CREATED" && !invoice && (
              <Button
                onClick={() => setShowFundConfirm(true)}
                disabled={actionLoading}
                className="w-full"
              >
                {actionLoading ? "Generating Invoice..." : "Fund Escrow"}
              </Button>
            )}

            {/* FUNDED: seller can deliver */}
            {isSeller && state === "FUNDED" && (
              <div className="space-y-2">
                <Input
                  placeholder="Deliverable URL (required)"
                  value={deliverableUrl}
                  onChange={(e) => setDeliverableUrl(e.target.value)}
                />
                <Button
                  onClick={() =>
                    doAction("deliver", { deliverable_url: deliverableUrl })
                  }
                  disabled={actionLoading || !deliverableUrl}
                  className="w-full"
                >
                  {actionLoading ? "Submitting..." : "Mark as Delivered"}
                </Button>
              </div>
            )}

            {/* DELIVERED: buyer can verify */}
            {isBuyer && state === "DELIVERED" && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">
                    Score (0-100)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={verifyScore}
                    onChange={(e) => setVerifyScore(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    90-100: +100 rep (Perfect) | 70-89: +50 | 50-69: +25 |
                    Below 50: +10
                  </p>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">
                    Seller Lightning Invoice
                  </label>
                  <Input
                    placeholder="lnbc..."
                    value={sellerInvoice}
                    onChange={(e) => setSellerInvoice(e.target.value)}
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Seller&apos;s BOLT11 invoice to receive payment. Must start
                    with &quot;lnbc&quot;.
                  </p>
                </div>
                <Textarea
                  placeholder="Verification notes (optional)"
                  value={verifyNotes}
                  onChange={(e) => setVerifyNotes(e.target.value)}
                />
                <Button
                  onClick={() =>
                    doAction("verify", {
                      score: parseInt(verifyScore, 10),
                      notes: verifyNotes || undefined,
                      seller_lightning_invoice: sellerInvoice,
                    })
                  }
                  disabled={
                    actionLoading ||
                    !sellerInvoice.startsWith("lnbc")
                  }
                  className="w-full"
                >
                  {actionLoading ? "Verifying & Paying..." : "Verify & Pay Seller"}
                </Button>
              </div>
            )}

            {/* DELIVERED: buyer or seller can dispute */}
            {(isBuyer || isSeller) && state === "DELIVERED" && (
              <div className="space-y-2">
                <Separator />
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertTriangle className="h-4 w-4" />
                  Open a dispute (-75 reputation to both parties)
                </div>
                <Textarea
                  placeholder="Reason for dispute..."
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                />
                <Button
                  onClick={() =>
                    doAction("dispute", { reason: disputeReason })
                  }
                  disabled={actionLoading || !disputeReason}
                  variant="destructive"
                  className="w-full"
                >
                  Open Dispute
                </Button>
              </div>
            )}

            {/* DISPUTED: arbiter can resolve */}
            {isArbiter && state === "DISPUTED" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Gavel className="h-4 w-4 text-primary" />
                  <span className="font-medium">Resolve Dispute</span>
                </div>
                <div className="space-y-2">
                  {(
                    ["BUYER_WINS", "SELLER_WINS", "SPLIT"] as const
                  ).map((r) => (
                    <label
                      key={r}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="resolution"
                        value={r}
                        checked={resolution === r}
                        onChange={(e) => setResolution(e.target.value)}
                        className="accent-primary"
                      />
                      <span className="text-sm font-mono">{r}</span>
                    </label>
                  ))}
                </div>

                {/* Invoice inputs based on resolution */}
                {(resolution === "BUYER_WINS" || resolution === "SPLIT") && (
                  <div className="space-y-1">
                    <label className="text-sm font-medium">
                      Buyer Lightning Invoice
                    </label>
                    <Input
                      placeholder="lnbc..."
                      value={buyerInvoice}
                      onChange={(e) => setBuyerInvoice(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>
                )}
                {(resolution === "SELLER_WINS" || resolution === "SPLIT") && (
                  <div className="space-y-1">
                    <label className="text-sm font-medium">
                      Seller Lightning Invoice
                    </label>
                    <Input
                      placeholder="lnbc..."
                      value={resolveSellerInvoice}
                      onChange={(e) =>
                        setResolveSellerInvoice(e.target.value)
                      }
                      className="font-mono text-xs"
                    />
                  </div>
                )}

                <Button
                  onClick={() =>
                    doAction("resolve", {
                      resolution,
                      buyer_invoice: buyerInvoice || undefined,
                      seller_invoice: resolveSellerInvoice || undefined,
                    })
                  }
                  disabled={
                    actionLoading ||
                    ((resolution === "BUYER_WINS" || resolution === "SPLIT") &&
                      !buyerInvoice.startsWith("lnbc")) ||
                    ((resolution === "SELLER_WINS" || resolution === "SPLIT") &&
                      !resolveSellerInvoice.startsWith("lnbc"))
                  }
                  className="w-full"
                >
                  {actionLoading ? "Resolving..." : "Submit Resolution & Pay"}
                </Button>
              </div>
            )}

            {/* DISPUTED: non-arbiter message */}
            {!isArbiter && state === "DISPUTED" && (
              <p className="text-sm text-muted-foreground text-center py-2">
                This task is under dispute. Awaiting arbiter resolution.
              </p>
            )}

            {/* Terminal states */}
            {state === "SETTLED" && (
              <p className="text-sm text-green-400 text-center py-2">
                This task has been settled. Escrow released.
              </p>
            )}
            {state === "REFUNDED" && (
              <p className="text-sm text-muted-foreground text-center py-2">
                This task was refunded.
              </p>
            )}
            {state === "EXPIRED" && (
              <p className="text-sm text-muted-foreground text-center py-2">
                This task expired. Escrow refunded to buyer.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">State History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <TimelineItem label="Task Created" date={task.created_at} />

          {task.escrow?.held_at && (
            <TimelineItem label="Escrow Funded" date={task.escrow.held_at} />
          )}

          {task.deliverable_url && (
            <TimelineItem
              label={`Delivered${isLate ? " (Late)" : ""}`}
              date={
                (task.metadata as Record<string, unknown>)
                  ?.delivered_at as string
              }
            />
          )}

          {task.verifications.map((v) => (
            <TimelineItem
              key={v.id}
              label={`Verified — ${v.result} (Score: ${v.score})`}
              date={v.created_at}
            />
          ))}

          {task.disputes.map((d) => (
            <TimelineItem
              key={d.id}
              label={`Dispute Opened — ${d.reason.slice(0, 60)}`}
              date={d.created_at}
            />
          ))}

          {task.disputes
            .filter((d) => d.state === "RESOLVED")
            .map((d) => (
              <TimelineItem
                key={`${d.id}-resolved`}
                label={`Dispute Resolved — ${d.resolution}`}
                date={d.resolved_at ?? undefined}
              />
            ))}

          {task.escrow?.released_at && (
            <TimelineItem
              label={`Escrow ${task.escrow.state === "REFUNDED" ? "Refunded" : "Released"}`}
              date={task.escrow.released_at}
            />
          )}

          {(state === "SETTLED" || state === "EXPIRED" || state === "REFUNDED") && (
            <TimelineItem label={`Task ${state}`} />
          )}
        </CardContent>
      </Card>

      {/* Reputation Events */}
      {task.reputation_events && task.reputation_events.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reputation Impact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {task.reputation_events.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs font-mono">
                    {event.event_type}
                  </Badge>
                  <span className="text-xs text-muted-foreground font-mono">
                    {event.agent_id.slice(0, 8)}
                  </span>
                </div>
                <span
                  className={`font-mono ${
                    event.score_delta >= 0
                      ? "text-green-400"
                      : "text-red-400"
                  }`}
                >
                  {event.score_delta > 0 ? "+" : ""}
                  {event.score_delta}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Fund Confirmation Modal */}
      <Dialog open={showFundConfirm} onOpenChange={setShowFundConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Escrow Funding</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-2">
                <p>
                  You are about to lock{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {formatSats(task.amount_sats)}
                  </span>
                  {btcPrice !== null && (
                    <>
                      {" "}
                      (≈ $
                      {(
                        (Number(task.amount_sats) / 100_000_000) *
                        btcPrice
                      ).toFixed(2)}{" "}
                      USD)
                    </>
                  )}{" "}
                  in escrow.
                </p>
                <p>
                  This cannot be reversed until the task is completed, disputed,
                  or times out.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowFundConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowFundConfirm(false);
                doAction("fund");
              }}
              disabled={actionLoading}
            >
              {actionLoading ? "Generating Invoice..." : "Confirm & Fund"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TimelineItem({
  label,
  date,
}: {
  label: string;
  date?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 w-2 rounded-full bg-primary" />
      <div className="flex-1">
        <p className="text-sm">{label}</p>
      </div>
      {date && (
        <p className="text-xs text-muted-foreground">
          {formatDateTime(date)}
        </p>
      )}
    </div>
  );
}
