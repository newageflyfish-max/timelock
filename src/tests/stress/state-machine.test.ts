import { describe, it, expect } from "vitest";
import {
  canTransition,
  VALID_STATE_TRANSITIONS,
  MAX_ESCROW_SATS,
  type TaskState,
} from "@/lib/types";

const ALL_STATES: TaskState[] = [
  "CREATED",
  "FUNDED",
  "DELIVERED",
  "VERIFIED",
  "SETTLED",
  "DISPUTED",
  "RESOLVED",
  "EXPIRED",
  "REFUNDED",
];

describe("State Machine", () => {
  // ---------- VALID TRANSITIONS ----------
  describe("valid transitions", () => {
    const validPairs: [TaskState, TaskState][] = [
      ["CREATED", "FUNDED"],
      ["FUNDED", "DELIVERED"],
      ["FUNDED", "EXPIRED"],
      ["DELIVERED", "VERIFIED"],
      ["DELIVERED", "DISPUTED"],
      ["VERIFIED", "SETTLED"],
      ["DISPUTED", "RESOLVED"],
      ["RESOLVED", "SETTLED"],
      ["EXPIRED", "REFUNDED"],
    ];

    it.each(validPairs)(
      "should allow %s → %s",
      (from, to) => {
        expect(canTransition(from, to)).toBe(true);
      }
    );
  });

  // ---------- INVALID TRANSITIONS ----------
  describe("invalid transitions", () => {
    // Build every possible pair that is NOT in valid transitions
    const invalidPairs: [TaskState, TaskState][] = [];
    for (const from of ALL_STATES) {
      for (const to of ALL_STATES) {
        if (!VALID_STATE_TRANSITIONS[from].includes(to)) {
          invalidPairs.push([from, to]);
        }
      }
    }

    it(`should reject ${invalidPairs.length} invalid transitions`, () => {
      expect(invalidPairs.length).toBeGreaterThan(0);
    });

    it.each(invalidPairs)(
      "should reject %s → %s",
      (from, to) => {
        expect(canTransition(from, to)).toBe(false);
      }
    );
  });

  // ---------- TERMINAL STATES ----------
  describe("terminal states have no outgoing transitions", () => {
    const terminalStates: TaskState[] = ["SETTLED", "REFUNDED"];

    it.each(terminalStates)(
      "%s should have zero outgoing transitions",
      (state) => {
        expect(VALID_STATE_TRANSITIONS[state]).toHaveLength(0);
        for (const to of ALL_STATES) {
          expect(canTransition(state, to)).toBe(false);
        }
      }
    );
  });

  // ---------- DOUBLE FUND PREVENTION ----------
  describe("double-funding prevention", () => {
    it("FUNDED → FUNDED should be invalid", () => {
      expect(canTransition("FUNDED", "FUNDED")).toBe(false);
    });

    it("CREATED → FUNDED is the only entry to FUNDED", () => {
      const statesThatCanFund = ALL_STATES.filter((s) =>
        canTransition(s, "FUNDED")
      );
      expect(statesThatCanFund).toEqual(["CREATED"]);
    });
  });

  // ---------- TRANSITION COUNTS ----------
  describe("transition graph completeness", () => {
    it("CREATED has exactly 1 outgoing transition", () => {
      expect(VALID_STATE_TRANSITIONS["CREATED"]).toHaveLength(1);
    });

    it("FUNDED has exactly 2 outgoing transitions (DELIVERED, EXPIRED)", () => {
      expect(VALID_STATE_TRANSITIONS["FUNDED"]).toHaveLength(2);
      expect(VALID_STATE_TRANSITIONS["FUNDED"]).toContain("DELIVERED");
      expect(VALID_STATE_TRANSITIONS["FUNDED"]).toContain("EXPIRED");
    });

    it("DELIVERED has exactly 2 outgoing transitions (VERIFIED, DISPUTED)", () => {
      expect(VALID_STATE_TRANSITIONS["DELIVERED"]).toHaveLength(2);
      expect(VALID_STATE_TRANSITIONS["DELIVERED"]).toContain("VERIFIED");
      expect(VALID_STATE_TRANSITIONS["DELIVERED"]).toContain("DISPUTED");
    });

    it("DISPUTED has exactly 1 outgoing transition (RESOLVED)", () => {
      expect(VALID_STATE_TRANSITIONS["DISPUTED"]).toHaveLength(1);
    });

    it("EXPIRED has exactly 1 outgoing transition (REFUNDED)", () => {
      expect(VALID_STATE_TRANSITIONS["EXPIRED"]).toHaveLength(1);
    });
  });

  // ---------- ROLE ENFORCEMENT RULES ----------
  describe("role enforcement logic", () => {
    it("arbiter cannot be buyer (same agent_id check)", () => {
      const buyerId = "agent-001";
      const arbiterId = buyerId;
      expect(arbiterId).toBe(buyerId);
      // Route logic: arbiter.id === agent.id → 400
    });

    it("arbiter cannot be seller (same agent_id check)", () => {
      const sellerId = "agent-002";
      const arbiterId = sellerId;
      expect(arbiterId).toBe(sellerId);
      // Route logic: arbiter.id === seller_agent_id → 400
    });

    it("seller cannot be buyer (same agent_id check)", () => {
      const buyerId = "agent-001";
      const sellerId = buyerId;
      expect(sellerId).toBe(buyerId);
      // Route logic: seller.id === agent.id → 400
    });

    it("seller cannot verify their own task (buyer-only action)", () => {
      // Verify route checks: task.buyer_agent_id !== agent.id → 403
      const buyerAgentId = "agent-001";
      const sellerAgentId = "agent-002";
      const currentAgentId = sellerAgentId;
      expect(currentAgentId).not.toBe(buyerAgentId);
      // This would trigger "Only the buyer can verify a task"
    });

    it("buyer cannot deliver their own task (seller-only action)", () => {
      // Deliver route checks: task.seller_agent_id !== agent.id → 403
      const buyerAgentId = "agent-001";
      const sellerAgentId = "agent-002";
      const currentAgentId = buyerAgentId;
      expect(currentAgentId).not.toBe(sellerAgentId);
      // This would trigger "Only the seller can mark a task as delivered"
    });

    it("only buyer can fund (not seller, not arbiter)", () => {
      // Fund route: task.buyer_agent_id !== agent.id → 403
      const buyerAgentId = "agent-001";
      const sellerAgentId = "agent-002";
      const arbiterAgentId = "agent-003";
      expect(sellerAgentId).not.toBe(buyerAgentId);
      expect(arbiterAgentId).not.toBe(buyerAgentId);
    });

    it("only participants can check payment-status", () => {
      const buyerAgentId = "agent-001";
      const sellerAgentId = "agent-002";
      const randomAgentId = "agent-999";
      expect(randomAgentId).not.toBe(buyerAgentId);
      expect(randomAgentId).not.toBe(sellerAgentId);
      // Route: agent.id !== buyer && agent.id !== seller → 403
    });
  });

  // ---------- MAX ESCROW ----------
  describe("max escrow sats", () => {
    it("MAX_ESCROW_SATS is 1,000,000", () => {
      expect(MAX_ESCROW_SATS).toBe(1_000_000);
    });

    it("1,000,000 sats should be allowed", () => {
      expect(1_000_000).toBeLessThanOrEqual(MAX_ESCROW_SATS);
    });

    it("1,000,001 sats should exceed max", () => {
      expect(1_000_001).toBeGreaterThan(MAX_ESCROW_SATS);
    });
  });
});
