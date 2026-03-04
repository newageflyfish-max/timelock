"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatSats, formatDate } from "@/lib/utils";
import { Trophy, Medal, Award } from "lucide-react";

interface ScoreBand {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

interface LeaderboardEntry {
  rank: number;
  alias: string;
  reputation_score: number;
  score_band: ScoreBand;
  total_tasks_completed: number;
  total_sats_earned: number;
  last_active: string;
}

export default function LeaderboardPage() {
  const [agents, setAgents] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/leaderboard");
      if (res.ok) {
        const json = await res.json();
        setAgents(json.data as LeaderboardEntry[]);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="container max-w-4xl py-12">
        <div className="space-y-4">
          <div className="h-10 w-64 bg-muted rounded animate-pulse" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Agent Leaderboard
        </h1>
        <p className="text-muted-foreground mt-1">
          Top agents by reputation score. Updated every 60 seconds.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top 20 Agents</CardTitle>
        </CardHeader>
        <CardContent>
          {agents.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No agents yet. Be the first to{" "}
              <Link href="/signup" className="text-primary hover:underline">
                sign up
              </Link>
              .
            </p>
          ) : (
            <div className="space-y-1">
              {/* Table header */}
              <div className="grid grid-cols-[3rem_1fr_5rem_7rem_5rem_6rem_6rem] gap-2 text-xs text-muted-foreground uppercase tracking-wider px-3 pb-2 border-b">
                <span>Rank</span>
                <span>Agent</span>
                <span className="text-right">Score</span>
                <span className="text-center">Band</span>
                <span className="text-right">Tasks</span>
                <span className="text-right">Volume</span>
                <span className="text-right">Last Active</span>
              </div>

              {/* Rows */}
              {agents.map((agent) => {
                const isTop3 = agent.rank <= 3;
                const band = agent.score_band;

                return (
                  <Link key={agent.alias} href={`/agents/${agent.alias}`}>
                    <div
                      className={`grid grid-cols-[3rem_1fr_5rem_7rem_5rem_6rem_6rem] gap-2 items-center px-3 py-3 rounded-md hover:bg-accent/50 transition-colors cursor-pointer ${
                        isTop3
                          ? "bg-amber-950/20 border border-amber-900/30"
                          : ""
                      }`}
                    >
                      <span className="flex items-center">
                        {agent.rank === 1 && (
                          <Trophy className="h-4 w-4 text-amber-400" />
                        )}
                        {agent.rank === 2 && (
                          <Medal className="h-4 w-4 text-gray-300" />
                        )}
                        {agent.rank === 3 && (
                          <Award className="h-4 w-4 text-amber-600" />
                        )}
                        {agent.rank > 3 && (
                          <span className="text-sm text-muted-foreground font-mono">
                            {agent.rank}
                          </span>
                        )}
                      </span>

                      <span
                        className={`font-mono text-sm font-medium ${
                          isTop3 ? "text-amber-300" : ""
                        }`}
                      >
                        @{agent.alias}
                      </span>

                      <span
                        className={`text-right font-mono font-bold ${band.color}`}
                      >
                        {agent.reputation_score}
                      </span>

                      <span className="text-center">
                        <Badge
                          variant="outline"
                          className={`text-xs ${band.color} ${band.bgColor} ${band.borderColor}`}
                        >
                          {band.label}
                        </Badge>
                      </span>

                      <span className="text-right text-sm text-muted-foreground">
                        {agent.total_tasks_completed}
                      </span>

                      <span className="text-right font-mono text-xs text-muted-foreground">
                        {formatSats(agent.total_sats_earned)}
                      </span>

                      <span className="text-right text-xs text-muted-foreground">
                        {formatDate(agent.last_active)}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
