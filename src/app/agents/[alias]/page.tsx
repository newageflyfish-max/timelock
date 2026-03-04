"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatSats, formatDate } from "@/lib/utils";
import {
  Shield,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  BarChart3,
} from "lucide-react";

interface ScoreBand {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

interface AgentStats {
  agent: {
    alias: string;
    reputation_score: number;
    score_band: ScoreBand;
    total_tasks_completed: number;
    total_tasks_disputed: number;
    total_sats_earned: number;
    total_sats_paid: number;
    last_active: string;
    created_at: string;
    pubkey: string | null;
  };
  stats: {
    completion_rate: number;
    dispute_rate: number;
    average_score_received: number;
    total_volume_sats: number;
  };
  reputation_events: Array<{
    id: string;
    event_type: string;
    score_delta: number;
    created_at: string;
    task_title: string | null;
  }>;
  score_history: Array<{
    event_type: string;
    score_delta: number;
    score_before: number;
    score_after: number;
    created_at: string;
  }>;
}

export default function AgentProfilePage() {
  const params = useParams();
  const [data, setData] = useState<AgentStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/agents/${params.alias}/stats`);
      if (res.ok) {
        const json = await res.json();
        setData(json.data as AgentStats);
      }
      setLoading(false);
    }
    load();
  }, [params.alias]);

  if (loading) {
    return (
      <div className="container max-w-3xl py-12">
        <div className="space-y-4">
          <div className="h-16 w-64 bg-muted rounded animate-pulse" />
          <div className="h-6 w-full bg-muted rounded animate-pulse" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container max-w-3xl py-12 text-center">
        <h1 className="text-xl font-bold">Agent not found</h1>
        <p className="text-muted-foreground mt-2">
          No agent with alias &quot;{params.alias}&quot; exists.
        </p>
      </div>
    );
  }

  const { agent, stats, reputation_events, score_history } = data;
  const band = agent.score_band;

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 border-2 border-primary/30">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold font-mono">@{agent.alias}</h1>
            <p className="text-sm text-muted-foreground">
              Member since {formatDate(agent.created_at)}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-4xl font-bold font-mono ${band.color}`}>
            {agent.reputation_score}
          </p>
          <Badge
            variant="outline"
            className={`text-sm font-medium ${band.color} ${band.bgColor} ${band.borderColor}`}
          >
            {band.label}
          </Badge>
        </div>
      </div>

      {/* Reputation Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>0</span>
          <span>200</span>
          <span>400</span>
          <span>600</span>
          <span>800</span>
          <span>1000</span>
        </div>
        <div className="h-4 w-full rounded-full bg-secondary overflow-hidden flex">
          <div className="h-full bg-red-500/60" style={{ width: "20%" }} />
          <div className="h-full bg-orange-500/60" style={{ width: "20%" }} />
          <div className="h-full bg-gray-500/60" style={{ width: "20%" }} />
          <div className="h-full bg-green-500/60" style={{ width: "20%" }} />
          <div className="h-full bg-amber-500/60" style={{ width: "20%" }} />
        </div>
        <div className="relative h-2">
          <div
            className="absolute -top-3 w-0 h-0 border-l-[6px] border-r-[6px] border-b-[8px] border-l-transparent border-r-transparent border-b-foreground"
            style={{
              left: `${Math.min((agent.reputation_score / 1000) * 100, 100)}%`,
              transform: "translateX(-50%)",
            }}
          />
        </div>
      </div>

      {/* Four Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <CheckCircle2 className="h-4 w-4" />
              <p className="text-xs uppercase tracking-wider">Completed</p>
            </div>
            <p className="text-2xl font-bold">
              {agent.total_tasks_completed}
            </p>
            <p className="text-xs text-muted-foreground">
              {stats.completion_rate}% rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4" />
              <p className="text-xs uppercase tracking-wider">Earned</p>
            </div>
            <p className="text-2xl font-bold font-mono">
              {formatSats(agent.total_sats_earned)}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatSats(stats.total_volume_sats)} total vol
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <AlertTriangle className="h-4 w-4" />
              <p className="text-xs uppercase tracking-wider">Disputes</p>
            </div>
            <p className="text-2xl font-bold">
              {agent.total_tasks_disputed}
            </p>
            <p className="text-xs text-muted-foreground">
              {stats.dispute_rate}% rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <BarChart3 className="h-4 w-4" />
              <p className="text-xs uppercase tracking-wider">Avg Score</p>
            </div>
            <p className="text-2xl font-bold">
              {stats.average_score_received > 0
                ? `+${stats.average_score_received}`
                : stats.average_score_received}
            </p>
            <p className="text-xs text-muted-foreground">rep delta</p>
          </CardContent>
        </Card>
      </div>

      {/* Score History Chart (inline SVG) */}
      {score_history.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Score History</CardTitle>
          </CardHeader>
          <CardContent>
            <ScoreChart history={score_history} bandColor={band.color} />
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      {reputation_events.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {reputation_events.slice(0, 10).map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Badge
                    variant="outline"
                    className="text-xs font-mono shrink-0"
                  >
                    {event.event_type}
                  </Badge>
                  {event.task_title && (
                    <span className="text-muted-foreground truncate text-xs">
                      {event.task_title}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`font-mono font-medium ${
                      event.score_delta >= 0
                        ? "text-green-400"
                        : "text-red-400"
                    }`}
                  >
                    {event.score_delta > 0 ? "+" : ""}
                    {event.score_delta}
                  </span>
                  <span className="text-xs text-muted-foreground w-20 text-right">
                    {formatDate(event.created_at)}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Lightning Node */}
      {agent.pubkey && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lightning Node</CardTitle>
          </CardHeader>
          <CardContent>
            <code className="text-xs text-muted-foreground break-all bg-muted p-2 rounded block">
              {agent.pubkey}
            </code>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ScoreChart({
  history,
  bandColor,
}: {
  history: Array<{ score_after: number; event_type: string }>;
  bandColor: string;
}) {
  const scores = history.map((h) => h.score_after);
  const minScore = Math.max(0, Math.min(...scores) - 50);
  const maxScore = Math.min(1000, Math.max(...scores) + 50);
  const range = maxScore - minScore || 1;

  const width = 500;
  const height = 120;
  const padding = 24;
  const chartW = width - padding * 2;
  const chartH = height - padding * 2;

  const points = scores.map((score, i) => {
    const x = padding + (i / (scores.length - 1)) * chartW;
    const y = padding + chartH - ((score - minScore) / range) * chartH;
    return { x, y, score };
  });

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  // Determine stroke color class → map to hex
  const colorMap: Record<string, string> = {
    "text-amber-400": "#fbbf24",
    "text-green-400": "#4ade80",
    "text-gray-400": "#9ca3af",
    "text-orange-400": "#fb923c",
    "text-red-400": "#f87171",
  };
  const strokeColor = colorMap[bandColor] || "#fbbf24";

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-32">
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const y = padding + chartH - frac * chartH;
        const label = Math.round(minScore + frac * range);
        return (
          <g key={frac}>
            <line
              x1={padding}
              y1={y}
              x2={width - padding}
              y2={y}
              stroke="currentColor"
              strokeOpacity={0.1}
              strokeDasharray="4"
            />
            <text
              x={padding - 4}
              y={y + 3}
              textAnchor="end"
              fill="currentColor"
              fillOpacity={0.3}
              fontSize="8"
            >
              {label}
            </text>
          </g>
        );
      })}

      {/* Line */}
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Points */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r="3"
          fill={strokeColor}
        />
      ))}

      {/* Score labels on points */}
      {points.map((p, i) => (
        <text
          key={`label-${i}`}
          x={p.x}
          y={p.y - 8}
          textAnchor="middle"
          fill="currentColor"
          fillOpacity={0.5}
          fontSize="7"
        >
          {p.score}
        </text>
      ))}
    </svg>
  );
}
