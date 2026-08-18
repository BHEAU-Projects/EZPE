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
      moveType: "electric",
      moveSource: "known",
      targetSpecies: "Squirtle",
      damage: {
        accuracyPercent: 100,
        missChancePercent: 0,
        expectedDamage: expect.any(Number),
        expectedDamagePercent: expect.any(Number),
        koChancePercent: expect.any(Number),
        criticalMaxDamage: expect.any(Number)
      }
    });
    expect(actions[0].damage!.expectedDamage).toBeGreaterThan(0);
    expect(actions[0].damage!.expectedDamagePercent).toBeGreaterThan(0);
    expect(actions[1]).toMatchObject({
      actorSpecies: "Bulbasaur",
      moveName: "Tackle",
      targetSpecies: "Charmander"
    });
  });

  it("reports spread damage separately for every affected Pokemon", () => {
    const state = structuredClone(singleTurnBattleState);
    state.teams.p1.active[0].set.moveIds = ["earthquake", "protect"];
    const actions: ActionPlan["actions"] = [
      { type: "move", activeSlot: "p1a", moveId: "earthquake", targetSlot: "field", flags: {} },
      { type: "move", activeSlot: "p1b", moveId: "protect", targetSlot: "self", flags: {} }
    ];
    const plan: ActionPlan = {
      id: "spread-plan",
      side: "p1",
      actions,
      showdownChoice: buildShowdownChoiceFromLegalActions(actions, "p1")
    };

    const earthquake = new AdvicePresenter(state).presentPlan(plan)[0];
    expect(earthquake.targetDamages).toHaveLength(3);
    expect(earthquake.targetDamages?.map((target) => target.targetSpecies)).toEqual(
      expect.arrayContaining(["Bulbasaur", "Squirtle", "Charmander"])
    );
    expect(earthquake.targetDamages?.every((target) => target.damage.expectedDamage > 0)).toBe(true);
  });

  it("labels opponent moves as confirmed or predicted", () => {
    const state = structuredClone(singleTurnBattleState);
    state.teams.p2.active[0].set.moveKnowledge = {
      source: "usage-default",
      observedMoveIds: ["tackle"],
      assumedMoveIds: ["protect"]
    };
    state.teams.p2.active[1].set.moveKnowledge = {
      source: "usage-default",
      observedMoveIds: [],
      assumedMoveIds: ["scratch", "protect"]
    };
    const actions: ActionPlan["actions"] = [
      { type: "move", activeSlot: "p2a", moveId: "tackle", targetSlot: "p1a", flags: {} },
      { type: "move", activeSlot: "p2b", moveId: "scratch", targetSlot: "p1b", flags: {} }
    ];
    const plan: ActionPlan = {
      id: "opponent-plan",
      side: "p2",
      actions,
      showdownChoice: buildShowdownChoiceFromLegalActions(actions, "p2")
    };

    expect(new AdvicePresenter(state).presentPlan(plan)).toMatchObject([
      { moveName: "Tackle", moveType: "normal", moveSource: "confirmed" },
      { moveName: "Scratch", moveType: "normal", moveSource: "predicted" }
    ]);
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

  it("finds a worst enemy response for a specific recommended turn", () => {
    const presenter = new AdvicePresenter(singleTurnBattleState);
    const worstCase = presenter.findWorstEnemyDamagePlan(
      planWithMoves("thunderbolt", "tackle")
    );

    expect(worstCase.actions).toHaveLength(2);
    expect(worstCase.actions.every((action) => action.actorSpecies.length > 0)).toBe(true);
    expect(worstCase.actions.every((action) => action.targetSpecies.length > 0)).toBe(true);
    expect(worstCase.actions.every((action) => action.actionChancePercent >= 0)).toBe(true);
    expect(worstCase.totalCriticalMaxDamage).toBeGreaterThanOrEqual(
      worstCase.totalExpectedDamage
    );
  });

  it("removes a faster enemy move when the recommended move guarantees the KO", () => {
    const state = structuredClone(singleTurnBattleState);
    state.teams.p1.active[0].set.stats.spe = 120;
    state.teams.p2.active[0].set.stats.spe = 40;
    state.teams.p2.active[0].hp = { unit: "percent", percent: 10 };
    const presenter = new AdvicePresenter(state);

    const worstCase = presenter.findWorstEnemyDamagePlan(
      planWithMoves("thunderbolt", "tackle")
    );
    const squirtleAction = worstCase.actions.find((action) => action.actorSlot === "p2a");

    expect(squirtleAction?.actionChancePercent).toBe(0);
    expect(squirtleAction?.adjustedExpectedDamage).toBe(0);
  });

  it("keeps the enemy move in proportion to the recommended move's miss chance", () => {
    const state = structuredClone(singleTurnBattleState);
    state.teams.p1.active[0].set.moveIds = ["thunder", "protect"];
    state.teams.p1.active[0].set.stats.spe = 120;
    state.teams.p2.active[0].set.stats.spe = 40;
    state.teams.p2.active[0].hp = { unit: "percent", percent: 10 };
    const presenter = new AdvicePresenter(state);

    const worstCase = presenter.findWorstEnemyDamagePlan(planWithMoves("thunder", "tackle"));
    const squirtleAction = worstCase.actions.find((action) => action.actorSlot === "p2a");

    expect(squirtleAction?.actionChancePercent).toBeCloseTo(30);
    expect(squirtleAction?.adjustedExpectedDamage).toBeCloseTo(
      (squirtleAction?.damage?.expectedDamage ?? 0) * 0.3
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
