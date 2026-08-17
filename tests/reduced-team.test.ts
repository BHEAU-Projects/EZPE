import { describe, expect, it } from "vitest";

import { generateActionPlansForSide, rankMoves } from "../src/advisor/move-ranker.js";
import type { BattleState } from "../src/domain/battle-state.js";
import { singleTurnBattleState } from "../src/fixtures/single-turn-battle-state.js";

function faintSlot(state: BattleState, slot: "p1a" | "p1b" | "p2a" | "p2b"): void {
  const side = slot.slice(0, 2) as "p1" | "p2";
  const pokemon = state.teams[side].active.find((candidate) => candidate.slot === slot);
  if (!pokemon) throw new Error(`Missing fixture slot ${slot}.`);
  pokemon.hp = pokemon.hp.unit === "exact"
    ? { ...pokemon.hp, current: 0 }
    : { unit: "percent", percent: 0 };
}

describe("reduced doubles sides", () => {
  it("uses an internal pass for a fainted slot", () => {
    const state = structuredClone(singleTurnBattleState);
    faintSlot(state, "p2b");

    const plans = generateActionPlansForSide(state, "p2");

    expect(plans.length).toBeGreaterThan(0);
    expect(plans.every((plan) => plan.actions.length === 1)).toBe(true);
    expect(plans.every((plan) => plan.showdownChoice.endsWith(", pass"))).toBe(true);
  });

  it("ranks a 1v1 board without requiring two legal moves per side", () => {
    const state = structuredClone(singleTurnBattleState);
    faintSlot(state, "p1b");
    faintSlot(state, "p2b");

    const results = rankMoves(state, {
      maxOpponentPlans: 1,
      seeds: [[1, 2, 3, 4]]
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].actionPlan.actions).toHaveLength(1);
    expect(results[0].actionPlan.showdownChoice).toContain(", pass");
  });

  it("supports a side represented by only one occupied active slot", () => {
    const state = structuredClone(singleTurnBattleState);
    state.teams.p1.active = [state.teams.p1.active[0]];
    state.teams.p2.active = [state.teams.p2.active[0]];

    const results = rankMoves(state, {
      maxOpponentPlans: 1,
      seeds: [[1, 2, 3, 4]]
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].actionPlan.showdownChoice).toMatch(/, pass$/);
  });

  it("returns no recommendations after either side has no living active Pokemon", () => {
    const state = structuredClone(singleTurnBattleState);
    faintSlot(state, "p2a");
    faintSlot(state, "p2b");

    expect(rankMoves(state, { maxOpponentPlans: 1 })).toEqual([]);
    expect(generateActionPlansForSide(state, "p2")).toEqual([]);
  });
});
