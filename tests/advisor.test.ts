import { describe, expect, it } from "vitest";

import { singleTurnBattleState, singleTurnChoices } from "../src/fixtures/single-turn-battle-state.js";
import { generateActionPlans, rankMoves } from "../src/advisor/move-ranker.js";
import { pokemonDataService } from "../src/data/pokemon-data-service.js";
import { pokemonSetSchema } from "../src/domain/battle-state.js";

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

  it("reduces the value of Protect after it succeeded on the previous turn", () => {
    const freshState = structuredClone(singleTurnBattleState);
    const repeatedState = structuredClone(singleTurnBattleState);
    repeatedState.teams.p1.active[0].protectStreak = 1;
    const fresh = rankMoves(freshState, { opponentChoice: singleTurnChoices.p2Choice });
    const repeated = rankMoves(repeatedState, { opponentChoice: singleTurnChoices.p2Choice });
    const choice = "move protect, move tackle 1";

    expect(repeated.find((result) => result.actionPlan.showdownChoice === choice)!.score).toBeLessThan(
      fresh.find((result) => result.actionPlan.showdownChoice === choice)!.score
    );
  });

  it("returns one best variant for plans that differ only by a special mechanic", () => {
    const state = structuredClone(singleTurnBattleState);
    const base = {
      speciesId: "metagross",
      displayName: "Metagross",
      level: 50,
      itemId: "metagrossite",
      abilityId: "clearbody",
      moveIds: ["protect", "earthquake"],
      statAlignment: "Serious",
      statPoints: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
    };
    const set = pokemonSetSchema.parse({
      ...base,
      stats: pokemonDataService.calculateStats(base, "development")
    });
    state.teams.p1.active[0].set = set;
    state.teams.p1.active[0].hp = { unit: "exact", current: set.stats.hp, max: set.stats.hp };
    const rawPlans = generateActionPlans(state);
    const semanticKey = (result: { actionPlan: { actions: typeof rawPlans[number]["actions"] } }) =>
      result.actionPlan.actions.map((action) => action.type === "switch"
        ? `${action.activeSlot}:switch:${action.speciesId}`
        : `${action.activeSlot}:move:${action.moveId}:${action.targetSlot}`
      ).join("|");
    const rawKeys = rawPlans.map((plan) => semanticKey({ actionPlan: plan }));

    expect(new Set(rawKeys).size).toBeLessThan(rawKeys.length);
    const advice = rankMoves(state, { opponentChoice: singleTurnChoices.p2Choice, seed: [1, 2, 3, 4] });
    const rankedKeys = advice.map(semanticKey);
    expect(new Set(rankedKeys).size).toBe(rankedKeys.length);
  });
});
