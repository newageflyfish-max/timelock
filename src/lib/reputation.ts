import { clampReputation } from "@/lib/types";
import type { ReputationEvent } from "@/lib/types";

export interface ScoreBand {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

const SCORE_BANDS: { min: number; max: number; band: ScoreBand }[] = [
  {
    min: 800,
    max: 1000,
    band: {
      label: "Verified Elite",
      color: "text-amber-400",
      bgColor: "bg-amber-950",
      borderColor: "border-amber-800",
    },
  },
  {
    min: 600,
    max: 799,
    band: {
      label: "Trusted",
      color: "text-green-400",
      bgColor: "bg-green-950",
      borderColor: "border-green-800",
    },
  },
  {
    min: 400,
    max: 599,
    band: {
      label: "Standard",
      color: "text-gray-400",
      bgColor: "bg-gray-900",
      borderColor: "border-gray-700",
    },
  },
  {
    min: 200,
    max: 399,
    band: {
      label: "Probationary",
      color: "text-orange-400",
      bgColor: "bg-orange-950",
      borderColor: "border-orange-800",
    },
  },
  {
    min: 0,
    max: 199,
    band: {
      label: "Flagged",
      color: "text-red-400",
      bgColor: "bg-red-950",
      borderColor: "border-red-800",
    },
  },
];

/**
 * Calculate new reputation score from a sequence of events.
 * Applies all deltas in order and clamps result to 0-1000.
 */
export function calculateNewScore(
  currentScore: number,
  events: ReputationEvent[]
): number {
  let score = currentScore;
  for (const event of events) {
    score += event.score_delta;
  }
  return clampReputation(score);
}

/**
 * Get the score band for a given reputation score.
 */
export function getScoreBand(score: number): ScoreBand {
  for (const entry of SCORE_BANDS) {
    if (score >= entry.min && score <= entry.max) {
      return entry.band;
    }
  }
  return SCORE_BANDS[SCORE_BANDS.length - 1].band;
}

/**
 * Calculate score decay for inactive agents.
 * Drifts score toward 500 based on inactivity duration.
 * Never decays below 200 or above 800 via decay alone.
 */
export function getScoreDecay(
  lastActive: Date,
  currentScore: number
): number {
  const now = new Date();
  const daysSinceActive = Math.floor(
    (now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSinceActive < 30) return 0;

  const TARGET = 500;
  let driftAmount: number;

  if (daysSinceActive >= 90) {
    driftAmount = 20;
  } else if (daysSinceActive >= 60) {
    driftAmount = 10;
  } else {
    driftAmount = 5;
  }

  // Drift toward 500
  let delta: number;
  if (currentScore > TARGET) {
    delta = -Math.min(driftAmount, currentScore - TARGET);
  } else if (currentScore < TARGET) {
    delta = Math.min(driftAmount, TARGET - currentScore);
  } else {
    return 0;
  }

  // Enforce decay boundaries: never decay below 200 or above 800
  const newScore = currentScore + delta;
  if (currentScore > 800 && newScore < 800) {
    delta = -(currentScore - 800);
  } else if (currentScore < 200 && newScore > 200) {
    delta = 200 - currentScore;
  }

  // If already within boundary limits and drifting would cross, no decay
  if (currentScore <= 200 && delta > 0 && newScore > 200) {
    return 0;
  }
  if (currentScore >= 800 && delta < 0 && newScore < 800) {
    return 0;
  }

  return delta;
}
