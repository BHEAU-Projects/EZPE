import { describe, expect, it } from "vitest";

import { generateLegalActions } from "../src/advisor/legal-action-generator.js";
import { generateActionPlans } from "../src/advisor/move-ranker.js";
import type { BattleState } from "../src/domain/battle-state.js";
import { singleTurnBattleState } from "../src/fixtures/single-turn-battle-state.js";

function stateWithBenchPokemon(): BattleState {
  const state = structuredClone(singleTurnBattleState);
  state.teams.p1.bench.push({
    benchSlot: 0,
    set: {
      speciesId: "eevee",
      displayName: "Eevee",
      level: 50,
      itemId: null,
      abilityId: "runaway",
      moveIds: ["tackle", "protect"],
      statAlignment: "Serious",
      statPoints: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      stats: { hp: 100, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }
    },
    hp: { unit: "exact", current: 100, max: 100 },
    status: "healthy",
    fainted: false
  });
  return state;
}

describe("legal action generator", () => {
  it("derives moves and target choices from Showdown's current request", () => {
    const actions = generateLegalActions(singleTurnBattleState);
    const pikachuActions = actions.filter((action) => action.activeSlot === "p1a");

    expect(pikachuActions).toHaveLength(3);
    expect(pikachuActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "move", moveId: "thunderbolt", targetSlot: "p2a" }),
        expect.objectContaining({ type: "move", moveId: "thunderbolt", targetSlot: "p2b" }),
        expect.objectContaining({ type: "move", moveId: "protect", targetSlot: "self" })
      ])
    );
  });

  it("removes moves with no remaining PP", () => {
    const state = structuredClone(singleTurnBattleState);
    state.teams.p1.active[0].movePp = { thunderbolt: 0 };

    const pikachuActions = generateLegalActions(state).filter(
      (action) => action.activeSlot === "p1a"
    );

    expect(pikachuActions).toHaveLength(1);
    expect(pikachuActions[0]).toMatchObject({ type: "move", moveId: "protect" });
  });

  it("generates switch actions with correct Showdown team positions", () => {
    const plans = generateActionPlans(stateWithBenchPokemon());
    const pikachuSwitch = plans.find(
      (plan) => plan.actions[0]?.type === "switch" && plan.actions[0].activeSlot === "p1a"
    );

    expect(pikachuSwitch?.showdownChoice.startsWith("switch 3")).toBe(true);
  });

  it("does not let both active Pokemon switch into the same bench slot", () => {
    const plans = generateActionPlans(stateWithBenchPokemon());

    expect(
      plans.some((plan) => plan.actions.every((action) => action.type === "switch"))
    ).toBe(false);
  });
});
