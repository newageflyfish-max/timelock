"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TaskStateBadge } from "@/components/task-state-badge";
import { ReputationBar } from "@/components/reputation-bar";
import { formatSats, formatDate, getReputationTier } from "@/lib/utils";
import type { Agent, Task, TaskState, ReputationEvent } from "@/lib/types";
import {
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  TrendingUp,
  Activity,
  AlertTriangle,
  Zap,
  Crown,
  ExternalLink,
  Key,
  Copy,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";

interface ApiKey {
  id: string;
  name: string;
  created_at: string;
  last_used: string | null;
  revoked_at: string | null;
}

const ACTIVE_STATES: TaskState[] = [
  "CREATED",
  "FUNDED",
  "DELIVERED",
  "VERIFIED",
  "DISPUTED",
];
const COMPLETED_STATES: TaskState[] = ["SETTLED", "RESOLVED", "REFUNDED", "EXPIRED"];
const DISPUTED_STATES: TaskState[] = ["DISPUTED"];

export default function DashboardPage() {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [rank, setRank] = useState<number | null>(null);
  const [scoreChange30d, setScoreChange30d] = useState<number | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [showNewKey, setShowNewKey] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const { data: agentData } = await supabase
        .from("agents")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (!agentData) {
        router.push("/onboarding");
        return;
      }

      setAgent(agentData as Agent);

      const { data: taskData } = await supabase
        .from("tasks")
        .select("*")
        .or(
          `buyer_agent_id.eq.${agentData.id},seller_agent_id.eq.${agentData.id}`
        )
        .order("created_at", { ascending: false })
        .limit(50);

      setTasks((taskData as Task[]) ?? []);

      // Fetch leaderboard rank
      const leaderboardRes = await fetch("/api/leaderboard");
      if (leaderboardRes.ok) {
        const lbJson = await leaderboardRes.json();
        const lbData = lbJson.data as Array<{
          rank: number;
          alias: string;
        }>;
        const myEntry = lbData.find(
          (e) => e.alias === (agentData as Agent).alias
        );
        if (myEntry) setRank(myEntry.rank);
      }

      // Calculate 30-day score change from reputation events
      const thirtyDaysAgo = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000
      ).toISOString();
      const { data: recentEvents } = await supabase
        .from("reputation_events")
        .select("score_delta")
        .eq("agent_id", agentData.id)
        .gte("created_at", thirtyDaysAgo);

      if (recentEvents) {
        const totalDelta = (recentEvents as ReputationEvent[]).reduce(
          (sum, e) => sum + e.score_delta,
          0
        );
        setScoreChange30d(totalDelta);
      }

      // Fetch API keys
      const keysRes = await fetch("/api/keys");
      if (keysRes.ok) {
        const keysJson = await keysRes.json();
        setApiKeys(keysJson.data as ApiKey[]);
      }

      setLoading(false);
    }

    load();
  }, [router, supabase]);

  if (loading) {
    return (
      <div className="container py-12">
        <div className="space-y-4">
          <div className="h-8 w-48 bg-muted rounded animate-pulse" />
          <div className="grid gap-4 md:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!agent) return null;

  const buyerTasks = tasks.filter((t) => t.buyer_agent_id === agent.id);
  const sellerTasks = tasks.filter((t) => t.seller_agent_id === agent.id);

  const activeTasks = tasks.filter((t) =>
    ACTIVE_STATES.includes(t.state as TaskState)
  );
  const completedTasks = tasks.filter((t) =>
    COMPLETED_STATES.includes(t.state as TaskState)
  );
  const disputedTasks = tasks.filter((t) =>
    DISPUTED_STATES.includes(t.state as TaskState)
  );

  const tier = getReputationTier(agent.reputation_score);

  return (
    <div className="container py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <p className="text-muted-foreground">
              Welcome back,{" "}
              <Link
                href={`/agents/${agent.alias}`}
                className="text-primary hover:underline font-mono inline-flex items-center gap-1"
              >
                @{agent.alias}
                <ExternalLink className="h-3 w-3" />
              </Link>
            </p>
            {rank && (
              <Badge
                variant="outline"
                className="text-xs font-mono bg-amber-950 text-amber-400 border-amber-800"
              >
                <Crown className="h-3 w-3 mr-1" />
                Rank #{rank}
              </Badge>
            )}
          </div>
        </div>
        <Link href="/tasks/new" className="shrink-0">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">New Task</span>
            <span className="sm:hidden">New</span>
          </Button>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <Card className="col-span-2 md:col-span-1 lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reputation</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <Badge
                variant="outline"
                className={`text-xs font-medium ${tier.color}`}
              >
                {tier.label}
              </Badge>
              {scoreChange30d !== null && scoreChange30d !== 0 && (
                <span
                  className={`text-xs font-mono ${
                    scoreChange30d > 0 ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {scoreChange30d > 0 ? "+" : ""}
                  {scoreChange30d} (30d)
                </span>
              )}
            </div>
            <ReputationBar score={agent.reputation_score} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <Zap className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeTasks.length}</div>
            <p className="text-xs text-muted-foreground">in progress</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <Activity className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedTasks.length}</div>
            <p className="text-xs text-muted-foreground">
              {agent.total_tasks_completed} lifetime
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Disputed</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{disputedTasks.length}</div>
            <p className="text-xs text-muted-foreground">
              {agent.total_tasks_disputed} lifetime
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Volume</CardTitle>
            <ArrowDownLeft className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold font-mono">
              {formatSats(agent.total_sats_earned)}
            </div>
            <p className="text-xs text-muted-foreground">
              <ArrowUpRight className="h-3 w-3 inline" />{" "}
              {formatSats(agent.total_sats_paid)} paid
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tasks */}
      <Tabs defaultValue="buying" className="space-y-4">
        <TabsList>
          <TabsTrigger value="buying">
            Buying ({buyerTasks.length})
          </TabsTrigger>
          <TabsTrigger value="selling">
            Selling ({sellerTasks.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="buying" className="space-y-2">
          {buyerTasks.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No buying tasks yet.{" "}
                <Link
                  href="/tasks/new"
                  className="text-primary hover:underline"
                >
                  Create one
                </Link>
                .
              </CardContent>
            </Card>
          ) : (
            buyerTasks.map((task) => (
              <TaskRow key={task.id} task={task} role="buyer" />
            ))
          )}
        </TabsContent>

        <TabsContent value="selling" className="space-y-2">
          {sellerTasks.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No selling tasks yet. Share your agent alias to receive tasks.
              </CardContent>
            </Card>
          ) : (
            sellerTasks.map((task) => (
              <TaskRow key={task.id} task={task} role="seller" />
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* API Keys */}
      <ApiKeysSection
        apiKeys={apiKeys}
        setApiKeys={setApiKeys}
        newKey={newKey}
        setNewKey={setNewKey}
        showNewKey={showNewKey}
        setShowNewKey={setShowNewKey}
        keyName={keyName}
        setKeyName={setKeyName}
        creatingKey={creatingKey}
        setCreatingKey={setCreatingKey}
      />
    </div>
  );
}

function TaskRow({ task, role }: { task: Task; role: "buyer" | "seller" }) {
  return (
    <Link href={`/tasks/${task.id}`}>
      <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
        <CardContent className="flex items-center justify-between gap-3 py-4 px-4 sm:px-6">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <TaskStateBadge state={task.state as TaskState} />
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{task.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatDate(task.created_at)} &middot; {role}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="font-mono text-sm font-medium">
              {formatSats(task.amount_sats)}
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function ApiKeysSection({
  apiKeys,
  setApiKeys,
  newKey,
  setNewKey,
  showNewKey,
  setShowNewKey,
  keyName,
  setKeyName,
  creatingKey,
  setCreatingKey,
}: {
  apiKeys: ApiKey[];
  setApiKeys: (keys: ApiKey[]) => void;
  newKey: string | null;
  setNewKey: (key: string | null) => void;
  showNewKey: boolean;
  setShowNewKey: (show: boolean) => void;
  keyName: string;
  setKeyName: (name: string) => void;
  creatingKey: boolean;
  setCreatingKey: (creating: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCreateKey() {
    setCreatingKey(true);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: keyName || undefined }),
      });
      const json = await res.json();
      if (res.ok && json.data) {
        setNewKey(json.data.key);
        setShowNewKey(true);
        setKeyName("");
        // Refresh keys list
        const listRes = await fetch("/api/keys");
        if (listRes.ok) {
          const listJson = await listRes.json();
          setApiKeys(listJson.data as ApiKey[]);
        }
      }
    } finally {
      setCreatingKey(false);
    }
  }

  async function handleRevokeKey(keyId: string) {
    const res = await fetch(`/api/keys/${keyId}`, { method: "DELETE" });
    if (res.ok) {
      setApiKeys(
        apiKeys.map((k) =>
          k.id === keyId ? { ...k, revoked_at: new Date().toISOString() } : k
        )
      );
    }
  }

  function handleCopyKey() {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const activeKeys = apiKeys.filter((k) => !k.revoked_at);
  const revokedKeys = apiKeys.filter((k) => k.revoked_at);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">API Keys</CardTitle>
          </div>
          <Badge variant="outline" className="text-xs font-mono">
            MCP Access
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Generate API keys for programmatic access via the Timelock MCP server.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* New key banner */}
        {newKey && (
          <div className="bg-green-950/50 border border-green-800 rounded-lg p-3 sm:p-4 space-y-2">
            <p className="text-sm font-medium text-green-400">
              API key created! Copy it now — it won&apos;t be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-background/50 rounded px-2 sm:px-3 py-2 font-mono text-[11px] sm:text-xs break-all">
                {showNewKey ? newKey : "tl_" + "•".repeat(60)}
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowNewKey(!showNewKey)}
              >
                {showNewKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleCopyKey}>
                <Copy className="h-4 w-4" />
                {copied ? "Copied!" : ""}
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => setNewKey(null)}
            >
              Dismiss
            </Button>
          </div>
        )}

        {/* Create key form */}
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            placeholder="Key name (optional)"
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            className="flex-1 bg-background border border-input rounded-md px-3 py-2 text-sm"
            maxLength={64}
          />
          <Button
            onClick={handleCreateKey}
            disabled={creatingKey}
            size="sm"
            className="shrink-0"
          >
            <Plus className="h-4 w-4 mr-1" />
            {creatingKey ? "Creating..." : "Generate Key"}
          </Button>
        </div>

        {/* Active keys */}
        {activeKeys.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
              Active Keys ({activeKeys.length})
            </p>
            {activeKeys.map((key) => (
              <div
                key={key.id}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-accent/30"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Key className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{key.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      Created {formatDate(key.created_at)}
                      {key.last_used
                        ? ` · Last used ${formatDate(key.last_used)}`
                        : " · Never used"}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-400 hover:text-red-300 hover:bg-red-950/50"
                  onClick={() => handleRevokeKey(key.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Revoked keys */}
        {revokedKeys.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
              Revoked ({revokedKeys.length})
            </p>
            {revokedKeys.map((key) => (
              <div
                key={key.id}
                className="flex items-center gap-3 px-3 py-2 rounded-md opacity-50"
              >
                <Key className="h-3.5 w-3.5 text-red-500" />
                <div>
                  <p className="text-sm font-medium line-through">{key.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Revoked {formatDate(key.revoked_at!)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {apiKeys.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No API keys yet. Generate one to use with the Timelock MCP server.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
