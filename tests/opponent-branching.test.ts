import { describe, expect, it } from "vitest";

import {
  generateActionPlansForSide,
  rankMoves
} from "../src/advisor/move-ranker.js";
import {
  singleTurnBattleState,
  singleTurnChoices
} from "../src/fixtures/single-turn-battle-state.js";

describe("opponent response branching", () => {
  it("generates complete legal plans for the opponent side", () => {
    const opponentPlans = generateActionPlansForSide(singleTurnBattleState, "p2");

    expect(opponentPlans).toHaveLength(9);
    expect(opponentPlans.every((plan) => plan.side === "p2")).toBe(true);
    expect(opponentPlans.map((plan) => plan.showdownChoice)).toContain(
      "move tackle 1, move scratch 1"
    );
  });

  it("evaluates generated opponent plans and reports aggregate bounds", () => {
    const advice = rankMoves(singleTurnBattleState, {
      maxOpponentPlans: 4,
      seed: [1, 2, 3, 4]
    });
    const evaluation = advice[0].debug.opponentEvaluation;

    expect(evaluation.responseCount).toBe(4);
    expect(evaluation.simulationCount).toBe(4);
    expect(evaluation.worstCaseScore).toBeLessThanOrEqual(evaluation.expectedScore);
    expect(evaluation.expectedScore).toBeLessThanOrEqual(evaluation.bestCaseScore);
    expect(evaluation.worstOpponentChoice).toMatch(/^move /);
  });

  it("evaluates every selected response across every supplied seed", () => {
    const advice = rankMoves(singleTurnBattleState, {
      maxOpponentPlans: 3,
      seeds: [
        [1, 2, 3, 4],
        [5, 6, 7, 8]
      ]
    });

    expect(advice[0].debug.opponentEvaluation).toMatchObject({
      responseCount: 3,
      simulationCount: 6
    });
  });

  it("supports a fixed opponent choice for reproducible focused analysis", () => {
    const advice = rankMoves(singleTurnBattleState, {
      opponentChoice: singleTurnChoices.p2Choice,
      seed: [1, 2, 3, 4]
    });

    expect(advice[0].debug.opponentEvaluation).toMatchObject({
      responseCount: 1,
      simulationCount: 1,
      worstOpponentChoice: singleTurnChoices.p2Choice
    });
  });

  it("rejects invalid branch controls", () => {
    expect(() => rankMoves(singleTurnBattleState, { maxOpponentPlans: 0 })).toThrow(
      /positive integer/
    );
    expect(() => rankMoves(singleTurnBattleState, { seeds: [] })).toThrow(/cannot be empty/);
  });
});
