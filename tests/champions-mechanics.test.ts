import { describe, expect, it } from "vitest";

import { generateLegalActions } from "../src/advisor/legal-action-generator.js";
import { generateActionPlans } from "../src/advisor/move-ranker.js";
import { singleTurnBattleState, singleTurnChoices } from "../src/fixtures/single-turn-battle-state.js";
import {
  createHydratedBattleFromState,
  createSingleTurnSimulationInputFromBattleState,
  simulateSingleTurn
} from "../src/sim/showdown-adapter.js";
import { Dex } from "../src/sim/showdown-runtime.js";

function simulate(
  state: typeof singleTurnBattleState,
  p1Choice: string,
  p2Choice: string
) {
  return simulateSingleTurn({
    ...createSingleTurnSimulationInputFromBattleState(state, {
      ...singleTurnChoices,
      p1Choice,
      p2Choice
    }),
    seed: [1, 2, 3, 4]
  });
}

describe("pinned Pokemon Champions mechanics", () => {
  it("caps move PP at 20 and exposes no Terastallization action", () => {
    const battle = createHydratedBattleFromState(singleTurnBattleState);
    try {
      expect(battle.p2.active[0].moveSlots.find((move) => move.id === "tackle")?.maxpp).toBe(20);
    } finally {
      battle.destroy();
    }

    expect(generateLegalActions(singleTurnBattleState).some(
      (action) => action.type === "move" && action.specialMechanic?.kind === "terastallization"
    )).toBe(false);
  });

  it("never combines two Mega Evolutions into one player plan", () => {
    const state = structuredClone(singleTurnBattleState);
    Object.assign(state.teams.p1.active[0].set, {
      speciesId: "metagross",
      itemId: "metagrossite",
      abilityId: "clearbody",
      moveIds: ["tackle", "protect"]
    });
    Object.assign(state.teams.p1.active[1].set, {
      speciesId: "mawile",
      itemId: "mawilite",
      abilityId: "intimidate",
      moveIds: ["tackle", "protect"]
    });

    const plans = generateActionPlans(state);
    expect(plans.some((plan) => plan.actions.some(
      (action) => action.type === "move" && action.specialMechanic
    ))).toBe(true);
    expect(plans.every((plan) => plan.actions.filter(
      (action) => action.type === "move" && action.specialMechanic
    ).length <= 1)).toBe(true);
  });

  it("applies spread damage to both foes while respecting an immune ally", () => {
    const state = structuredClone(singleTurnBattleState);
    Object.assign(state.teams.p1.active[0].set, {
      speciesId: "garchomp",
      abilityId: "roughskin",
      moveIds: ["earthquake", "protect"]
    });
    Object.assign(state.teams.p1.active[1].set, {
      speciesId: "charizard",
      abilityId: "blaze",
      moveIds: ["tailwind", "protect"]
    });

    const result = simulate(
      state,
      "move earthquake, move tailwind",
      "move tackle 1, move scratch 1"
    );
    const damagedSlots = result.damageEvents.map((event) => event.slot);

    expect(damagedSlots).toEqual(expect.arrayContaining(["p2a", "p2b"]));
    expect(damagedSlots).not.toContain("p1b");
  });

  it("uses Champions Unseen Fist damage through protection", () => {
    const state = structuredClone(singleTurnBattleState);
    state.teams.p1.active[0].set.abilityId = "unseenfist";
    state.teams.p1.active[0].set.moveIds = ["tackle", "protect"];

    const protectedTarget = simulate(
      state,
      "move tackle 1, move protect",
      "move protect, move protect"
    );
    const openTarget = simulate(
      state,
      "move tackle 1, move protect",
      "move tackle 1, move protect"
    );
    const protectedDamage = protectedTarget.damageEvents.find((event) => event.slot === "p2a")?.damageAmount ?? 0;
    const openDamage = openTarget.damageEvents.find((event) => event.slot === "p2a")?.damageAmount ?? 0;

    expect(protectedDamage).toBeGreaterThan(0);
    expect(protectedDamage).toBeLessThan(openDamage);
  });

  it("loads the Champions paralysis, sleep, and freeze rules from the mod", () => {
    const dex = Dex.forFormat("gen9championsdoublescustomgame");
    type ConditionCallbacks = {
      onBeforeMove?: (this: unknown, pokemon: unknown, target: unknown, move: unknown) => unknown;
      onStart?: (this: unknown, target: unknown, source: unknown, sourceEffect: unknown) => unknown;
    };
    const paralysis = dex.conditions.get("par") as unknown as ConditionCallbacks;
    const sleep = dex.conditions.get("slp") as unknown as ConditionCallbacks;
    const freeze = dex.conditions.get("frz") as unknown as ConditionCallbacks;
    let paralysisChance: [number, number] | undefined;
    const paralysisBattle = {
      randomChance(numerator: number, denominator: number) {
        paralysisChance = [numerator, denominator];
        return false;
      },
      add() {}
    };
    paralysis.onBeforeMove?.call(paralysisBattle as never, {} as never, {} as never, {} as never);

    const sleepState: Record<string, unknown> = {};
    let sleepSample: number[] | undefined;
    sleep.onStart?.call({
      effectState: sleepState,
      sample(values: number[]) {
        sleepSample = values;
        return values[0];
      },
      add() {}
    } as never, { removeVolatile() { return false; } } as never, null, null);

    const freezeState: Record<string, unknown> = {};
    freeze.onStart?.call({ effectState: freezeState, add() {} } as never, {
      species: { name: "Pikachu" },
      baseSpecies: { baseSpecies: "Pikachu" }
    } as never, null, null);

    expect(paralysisChance).toEqual([1, 8]);
    expect(sleepSample).toEqual([2, 3, 3]);
    expect(sleepState).toMatchObject({ startTime: 2, time: 2 });
    expect(freezeState).toMatchObject({ startTime: 3, time: 3 });
  });
});
