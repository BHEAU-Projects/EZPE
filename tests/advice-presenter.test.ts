import { describe, expect, it } from "vitest";

import { AdvicePresenter, presentPlayerMovePp } from "../src/advisor/advice-presenter.js";
import type { ActionPlan } from "../src/domain/advice.js";
import { singleTurnBattleState } from "../src/fixtures/single-turn-battle-state.js";
import { buildShowdownChoiceFromLegalActions } from "../src/sim/showdown-adapter.js";

function planWithMoves(firstMove: string, secondMove: string): ActionPlan {
  const actions: ActionPlan["actions"] = [
    {
      type: "move",
      activeSlot: "p1a",
      moveId: firstMove,
      targetSlot: "p2a",
      flags: {}
    },
    {
      type: "move",
      activeSlot: "p1b",
      moveId: secondMove,
      targetSlot: "p2b",
      flags: {}
    }
  ];
  return {
    id: "test-plan",
    side: "p1",
    actions,
    showdownChoice: buildShowdownChoiceFromLegalActions(actions, "p1")
  };
}

describe("advice presentation", () => {
  it("resolves actors, moves, targets, and expected damage", () => {
    const presenter = new AdvicePresenter(singleTurnBattleState);
    const actions = presenter.presentPlan(planWithMoves("thunderbolt", "tackle"));

    expect(actions[0]).toMatchObject({
      actorSpecies: "Pikachu",
      moveName: "Thunderbolt",
      targetSpecies: "Squirtle",
      damage: {
        accuracyPercent: 100,
        missChancePercent: 0,
        expectedDamage: expect.any(Number),
        criticalMaxDamage: expect.any(Number)
      }
    });
    expect(actions[0].damage!.expectedDamage).toBeGreaterThan(0);
    expect(actions[1]).toMatchObject({
      actorSpecies: "Bulbasaur",
      moveName: "Tackle",
      targetSpecies: "Charmander"
    });
  });

  it("includes misses and critical-hit probability in estimates", () => {
    const state = structuredClone(singleTurnBattleState);
    state.teams.p1.active[0].set.moveIds = ["thunder", "protect"];
    const presenter = new AdvicePresenter(state);
    const thunder = presenter.presentPlan(planWithMoves("thunder", "tackle"))[0];

    expect(thunder.damage).toMatchObject({
      accuracyPercent: 70,
      missChancePercent: 30
    });
    expect(thunder.damage!.criticalChancePercent).toBeCloseTo(100 / 24);
    expect(thunder.damage!.criticalMaxDamage).toBeGreaterThan(thunder.damage!.normalMaxDamage);
  });

  it("finds enemy actions with the highest critical damage and names their targets", () => {
    const presenter = new AdvicePresenter(singleTurnBattleState);
    const worstCase = presenter.findWorstEnemyDamagePlan();

    expect(worstCase.actions).toHaveLength(2);
    expect(worstCase.actions.every((action) => action.actorSpecies.length > 0)).toBe(true);
    expect(worstCase.actions.every((action) => action.targetSpecies.length > 0)).toBe(true);
    expect(worstCase.totalCriticalMaxDamage).toBeGreaterThanOrEqual(
      worstCase.totalExpectedDamage
    );
  });

  it("reports current and maximum PP for every player move", () => {
    const state = structuredClone(singleTurnBattleState);
    state.teams.p1.active[0].movePp = { thunderbolt: 6 };

    expect(presentPlayerMovePp(state).p1a).toEqual([
      { moveId: "thunderbolt", moveName: "Thunderbolt", currentPp: 6, maxPp: 15 },
      { moveId: "protect", moveName: "Protect", currentPp: 5, maxPp: 5 }
    ]);
  });
});
