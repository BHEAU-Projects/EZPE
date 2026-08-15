import { describe, expect, it } from "vitest";

import { singleTurnBattleState, singleTurnChoices } from "../src/fixtures/single-turn-battle-state.js";
import { generateActionPlans, rankMoves } from "../src/advisor/move-ranker.js";
import type { BattleState } from "../src/domain/battle-state.js";

function battleStateWithAlternativePikachuAction(): BattleState {
  const battleState = structuredClone(singleTurnBattleState);

  battleState.legalActions = [
    ...battleState.legalActions,
    {
      type: "move",
      activeSlot: "p1a",
      moveId: "protect",
      targetSlot: "self",
      flags: {}
    }
  ];

  return battleState;
}

describe("move ranker", () => {
  it("generates complete action plans for the player's active Pokemon", () => {
    const actionPlans = generateActionPlans(battleStateWithAlternativePikachuAction());

    expect(actionPlans).toHaveLength(2);
    expect(actionPlans.map((plan) => plan.showdownChoice)).toEqual([
      "move thunderbolt 1, move tackle 1",
      "move protect, move tackle 1"
    ]);
  });

  it("ranks a super-effective KO plan above a weaker defensive plan", () => {
    const advice = rankMoves(battleStateWithAlternativePikachuAction(), {
      opponentChoice: singleTurnChoices.p2Choice,
      seed: [1, 2, 3, 4]
    });

    expect(advice).toHaveLength(2);
    expect(advice[0].actionPlan.showdownChoice).toBe("move thunderbolt 1, move tackle 1");
    expect(advice[0].score).toBeGreaterThan(advice[1].score);
    expect(advice[0].explanationTags).toContain("confirmed-ko");
    expect(advice[0].debug.scoreBreakdown).toMatchObject({
      damageDealt: expect.any(Number),
      damageTaken: expect.any(Number),
      kosDealt: 1,
      kosTaken: 0
    });
  });
});
