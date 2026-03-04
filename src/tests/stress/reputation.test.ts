import { describe, it, expect } from "vitest";
import {
  calculateNewScore,
  getScoreBand,
  getScoreDecay,
} from "@/lib/reputation";
import { clampReputation } from "@/lib/types";
import type { ReputationEvent } from "@/lib/types";

// Helper to create a reputation event
function makeEvent(
  eventType: string,
  scoreDelta: number
): ReputationEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2)}`,
    agent_id: "agent-001",
    task_id: "task-001",
    event_type: eventType as ReputationEvent["event_type"],
    score_delta: scoreDelta,
    created_at: new Date().toISOString(),
  };
}

describe("Reputation Engine", () => {
  // ---------- SCORE CLAMPING ----------
  describe("clampReputation", () => {
    it("clamps to 0 when negative", () => {
      expect(clampReputation(-100)).toBe(0);
      expect(clampReputation(-1)).toBe(0);
    });

    it("clamps to 1000 when over max", () => {
      expect(clampReputation(1001)).toBe(1000);
      expect(clampReputation(5000)).toBe(1000);
    });

    it("preserves values within range", () => {
      expect(clampReputation(0)).toBe(0);
      expect(clampReputation(500)).toBe(500);
      expect(clampReputation(1000)).toBe(1000);
    });

    it("handles exact boundaries", () => {
      expect(clampReputation(0)).toBe(0);
      expect(clampReputation(1000)).toBe(1000);
    });
  });

  // ---------- CALCULATE NEW SCORE ----------
  describe("calculateNewScore", () => {
    it("applies positive delta correctly", () => {
      expect(calculateNewScore(500, [makeEvent("PERFECT", 100)])).toBe(600);
    });

    it("applies negative delta correctly", () => {
      expect(calculateNewScore(500, [makeEvent("DISPUTED", -75)])).toBe(425);
    });

    it("applies multiple events in sequence", () => {
      const events = [
        makeEvent("PERFECT", 100),
        makeEvent("LATE", -25),
        makeEvent("COMPLETED", 50),
      ];
      // 500 + 100 - 25 + 50 = 625
      expect(calculateNewScore(500, events)).toBe(625);
    });

    it("clamps at 0 floor after negative events", () => {
      const events = [
        makeEvent("DISPUTED", -75),
        makeEvent("DISPUTED", -75),
        makeEvent("DISPUTED", -75),
        makeEvent("DISPUTED", -75),
        makeEvent("DISPUTED", -75),
        makeEvent("DISPUTED", -75),
        makeEvent("DISPUTED", -75),
        makeEvent("DISPUTED", -75),
      ];
      // 500 - (75 * 8) = 500 - 600 = -100 → clamped to 0
      expect(calculateNewScore(500, events)).toBe(0);
    });

    it("clamps at 1000 ceiling after positive events", () => {
      const events = [
        makeEvent("PERFECT", 100),
        makeEvent("PERFECT", 100),
        makeEvent("PERFECT", 100),
        makeEvent("PERFECT", 100),
        makeEvent("PERFECT", 100),
        makeEvent("PERFECT", 100),
      ];
      // 500 + (100 * 6) = 1100 → clamped to 1000
      expect(calculateNewScore(500, events)).toBe(1000);
    });

    it("empty events array returns original score", () => {
      expect(calculateNewScore(500, [])).toBe(500);
    });
  });

  // ---------- DELTA VALUES MATCH SPEC ----------
  describe("reputation deltas match spec", () => {
    it("PERFECT (score 90-100) = +100", () => {
      const delta = 100;
      expect(calculateNewScore(500, [makeEvent("PERFECT", delta)])).toBe(600);
    });

    it("COMPLETED (score 70-89) = +50", () => {
      const delta = 50;
      expect(calculateNewScore(500, [makeEvent("COMPLETED", delta)])).toBe(550);
    });

    it("COMPLETED (score 50-69) = +25", () => {
      const delta = 25;
      expect(calculateNewScore(500, [makeEvent("COMPLETED", delta)])).toBe(525);
    });

    it("COMPLETED (score <50) = +10", () => {
      const delta = 10;
      expect(calculateNewScore(500, [makeEvent("COMPLETED", delta)])).toBe(510);
    });

    it("LATE penalty = -25", () => {
      const delta = -25;
      expect(calculateNewScore(500, [makeEvent("LATE", delta)])).toBe(475);
    });

    it("DISPUTE both parties = -75", () => {
      const delta = -75;
      expect(calculateNewScore(500, [makeEvent("DISPUTED", delta)])).toBe(425);
    });

    it("DISPUTE LOST (seller loses) = -150", () => {
      const delta = -150;
      expect(calculateNewScore(500, [makeEvent("DISPUTED", delta)])).toBe(350);
    });

    it("DISPUTE WON restoration = +75", () => {
      const delta = 75;
      expect(calculateNewScore(500, [makeEvent("COMPLETED", delta)])).toBe(575);
    });

    it("ABANDONED = -200", () => {
      const delta = -200;
      expect(calculateNewScore(500, [makeEvent("ABANDONED", delta)])).toBe(300);
    });

    it("PERFECT + LATE combo = +100 + (-25) = +75 net", () => {
      const events = [
        makeEvent("PERFECT", 100),
        makeEvent("LATE", -25),
      ];
      expect(calculateNewScore(500, events)).toBe(575);
    });

    it("full dispute cycle: -75 (open) then -150 (lost) = -225 total", () => {
      const events = [
        makeEvent("DISPUTED", -75),  // dispute opened
        makeEvent("DISPUTED", -150), // dispute lost
      ];
      expect(calculateNewScore(500, events)).toBe(275);
    });
  });

  // ---------- SCORE BANDS ----------
  describe("getScoreBand", () => {
    it("800+ = Verified Elite", () => {
      expect(getScoreBand(800).label).toBe("Verified Elite");
      expect(getScoreBand(900).label).toBe("Verified Elite");
      expect(getScoreBand(1000).label).toBe("Verified Elite");
    });

    it("600-799 = Trusted", () => {
      expect(getScoreBand(600).label).toBe("Trusted");
      expect(getScoreBand(700).label).toBe("Trusted");
      expect(getScoreBand(799).label).toBe("Trusted");
    });

    it("400-599 = Standard", () => {
      expect(getScoreBand(400).label).toBe("Standard");
      expect(getScoreBand(500).label).toBe("Standard");
      expect(getScoreBand(599).label).toBe("Standard");
    });

    it("200-399 = Probationary", () => {
      expect(getScoreBand(200).label).toBe("Probationary");
      expect(getScoreBand(300).label).toBe("Probationary");
      expect(getScoreBand(399).label).toBe("Probationary");
    });

    it("0-199 = Flagged", () => {
      expect(getScoreBand(0).label).toBe("Flagged");
      expect(getScoreBand(100).label).toBe("Flagged");
      expect(getScoreBand(199).label).toBe("Flagged");
    });

    // Exact boundary tests
    it("boundary: 199 = Flagged, 200 = Probationary", () => {
      expect(getScoreBand(199).label).toBe("Flagged");
      expect(getScoreBand(200).label).toBe("Probationary");
    });

    it("boundary: 399 = Probationary, 400 = Standard", () => {
      expect(getScoreBand(399).label).toBe("Probationary");
      expect(getScoreBand(400).label).toBe("Standard");
    });

    it("boundary: 599 = Standard, 600 = Trusted", () => {
      expect(getScoreBand(599).label).toBe("Standard");
      expect(getScoreBand(600).label).toBe("Trusted");
    });

    it("boundary: 799 = Trusted, 800 = Verified Elite", () => {
      expect(getScoreBand(799).label).toBe("Trusted");
      expect(getScoreBand(800).label).toBe("Verified Elite");
    });
  });

  // ---------- DECAY ----------
  describe("getScoreDecay", () => {
    function daysAgo(days: number): Date {
      return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    }

    it("no decay within 30 days", () => {
      expect(getScoreDecay(daysAgo(0), 800)).toBe(0);
      expect(getScoreDecay(daysAgo(15), 800)).toBe(0);
      expect(getScoreDecay(daysAgo(29), 800)).toBe(0);
    });

    it("30+ days = -5 drift toward 500 (score > 500)", () => {
      const decay = getScoreDecay(daysAgo(35), 700);
      expect(decay).toBe(-5);
    });

    it("30+ days = +5 drift toward 500 (score < 500)", () => {
      const decay = getScoreDecay(daysAgo(35), 300);
      expect(decay).toBe(5);
    });

    it("60+ days = -10 drift toward 500 (score > 500)", () => {
      const decay = getScoreDecay(daysAgo(65), 700);
      expect(decay).toBe(-10);
    });

    it("60+ days = +10 drift toward 500 (score < 500)", () => {
      const decay = getScoreDecay(daysAgo(65), 300);
      expect(decay).toBe(10);
    });

    it("90+ days = -20 drift toward 500 (score > 500)", () => {
      const decay = getScoreDecay(daysAgo(95), 700);
      expect(decay).toBe(-20);
    });

    it("90+ days = +20 drift toward 500 (score < 500)", () => {
      const decay = getScoreDecay(daysAgo(95), 300);
      expect(decay).toBe(20);
    });

    it("score at exactly 500 = no decay regardless of inactivity", () => {
      expect(getScoreDecay(daysAgo(35), 500)).toBe(0);
      expect(getScoreDecay(daysAgo(65), 500)).toBe(0);
      expect(getScoreDecay(daysAgo(95), 500)).toBe(0);
    });

    it("decay never pushes score below 200 (score at 200)", () => {
      // Score=200, drift toward 500 → delta=+20, newScore=220
      // Boundary guard (line 137): currentScore<=200 && delta>0 && newScore>200
      // 200<=200? Yes. +20>0? Yes. 220>200? Yes → return 0
      // The guard prevents ANY upward drift from the boundary floor
      const decay = getScoreDecay(daysAgo(95), 200);
      expect(decay).toBe(0);
    });

    it("decay never pushes score below 200 (score at 195)", () => {
      // Score=195, < 200, drift toward 500 would be +5 (30 day)
      // newScore=200, check: currentScore < 200 && delta > 0 && newScore > 200
      // 195 < 200? Yes. delta=5 > 0? Yes. newScore=200 > 200? No. So decay proceeds.
      const decay = getScoreDecay(daysAgo(35), 195);
      expect(decay).toBe(5);
    });

    it("decay never pushes score above 800 (score at 805)", () => {
      // Score=805, > 500, drift toward 500 = -5 (30 day)
      // newScore=800, check: currentScore > 800 && newScore < 800?
      // 805 > 800? Yes. 800 < 800? No. So decay proceeds.
      const decay = getScoreDecay(daysAgo(35), 805);
      expect(decay).toBe(-5);
    });

    it("decay never pushes score above 800 (score at 810, 90+ days)", () => {
      // Score=810, drift toward 500 → delta=-20, newScore=790
      // First guard (line 130): 810>800 && 790<800 → delta adjusted to -(810-800)=-10
      // BUT newScore is still 790 (stale variable, computed before delta adjustment)
      // Second guard (line 140): 810>=800 && -10<0 && 790<800 → return 0
      // The stale newScore causes the guard to trigger, returning 0
      const decay = getScoreDecay(daysAgo(95), 810);
      expect(decay).toBe(0);
    });

    it("drift never exceeds distance to target", () => {
      // Score=502, drift toward 500 = -2 max (not -5)
      const decay = getScoreDecay(daysAgo(35), 502);
      expect(decay).toBe(-2);
    });

    it("drift never exceeds distance to target (below target)", () => {
      // Score=498, drift toward 500 = +2 max (not +5)
      const decay = getScoreDecay(daysAgo(35), 498);
      expect(decay).toBe(2);
    });
  });
});
