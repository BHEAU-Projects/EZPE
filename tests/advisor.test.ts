import { describe, expect, it } from "vitest";

import { singleTurnBattleState, singleTurnChoices } from "../src/fixtures/single-turn-battle-state.js";
import { generateActionPlans, rankMoves } from "../src/advisor/move-ranker.js";

describe("move ranker", () => {
  it("generates complete action plans for the player's active Pokemon", () => {
    const battleState = structuredClone(singleTurnBattleState);
    battleState.legalActions = [];
    const actionPlans = generateActionPlans(battleState);

    expect(actionPlans).toHaveLength(9);
    expect(actionPlans.map((plan) => plan.showdownChoice)).toContain(
      "move thunderbolt 1, move tackle 1"
    );
    expect(actionPlans.map((plan) => plan.showdownChoice)).toContain(
      "move protect, move protect"
    );
  });

  it("ranks a super-effective KO plan above a weaker defensive plan", () => {
    const advice = rankMoves(singleTurnBattleState, {
      opponentChoice: singleTurnChoices.p2Choice,
      seed: [1, 2, 3, 4]
    });
    const defensivePlan = advice.find(
      (result) => result.actionPlan.showdownChoice === "move protect, move protect"
    );

    expect(advice).toHaveLength(9);
    expect(advice[0].actionPlan.actions.some(
      (action) => action.type === "move" && action.moveId === "thunderbolt"
    )).toBe(true);
    expect(defensivePlan).toBeDefined();
    expect(advice[0].score).toBeGreaterThan(defensivePlan!.score);
    expect(advice[0].explanationTags).toContain("confirmed-ko");
    expect(advice[0].debug.scoreBreakdown).toMatchObject({
      damageDealt: expect.any(Number),
      damageTaken: expect.any(Number),
      kosDealt: 1,
      kosTaken: 0
    });
  });
});
