import { cn, getReputationTier } from "@/lib/utils";

interface ReputationBarProps {
  score: number;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
}

export function ReputationBar({
  score,
  showLabel = true,
  size = "md",
}: ReputationBarProps) {
  const tier = getReputationTier(score);
  const percentage = Math.min((score / 1000) * 100, 100);

  const heights = { sm: "h-1.5", md: "h-2", lg: "h-3" };

  return (
    <div className="space-y-1">
      {showLabel && (
        <div className="flex items-center justify-between text-sm">
          <span className={cn("font-medium", tier.color)}>{tier.label}</span>
          <span className="font-mono text-muted-foreground">{score}</span>
        </div>
      )}
      <div
        className={cn("w-full rounded-full bg-secondary", heights[size])}
      >
        <div
          className={cn(
            "rounded-full bg-primary transition-all",
            heights[size]
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
