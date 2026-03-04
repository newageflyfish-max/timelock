import { Badge } from "@/components/ui/badge";
import type { TaskState } from "@/lib/types";
import { cn } from "@/lib/utils";

const stateConfig: Record<
  TaskState,
  { label: string; className: string }
> = {
  CREATED: {
    label: "Created",
    className: "bg-zinc-800 text-zinc-300 border-zinc-700",
  },
  FUNDED: {
    label: "Funded",
    className: "bg-amber-950 text-amber-400 border-amber-800",
  },
  DELIVERED: {
    label: "Delivered",
    className: "bg-blue-950 text-blue-400 border-blue-800",
  },
  VERIFIED: {
    label: "Verified",
    className: "bg-green-950 text-green-400 border-green-800",
  },
  SETTLED: {
    label: "Settled",
    className: "bg-green-950 text-green-300 border-green-700",
  },
  DISPUTED: {
    label: "Disputed",
    className: "bg-red-950 text-red-400 border-red-800",
  },
  RESOLVED: {
    label: "Resolved",
    className: "bg-purple-950 text-purple-400 border-purple-800",
  },
  REFUNDED: {
    label: "Refunded",
    className: "bg-zinc-800 text-zinc-400 border-zinc-700",
  },
  EXPIRED: {
    label: "Expired",
    className: "bg-zinc-900 text-zinc-500 border-zinc-800",
  },
};

export function TaskStateBadge({ state }: { state: TaskState }) {
  const config = stateConfig[state];
  return (
    <Badge
      variant="outline"
      className={cn("font-mono text-xs", config.className)}
    >
      {config.label}
    </Badge>
  );
}
