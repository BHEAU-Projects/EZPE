import { describe, expect, it } from "vitest";

import { singleTurnBattleState, singleTurnChoices } from "../src/fixtures/single-turn-battle-state.js";
import {
  buildShowdownChoiceFromLegalActions,
  createSingleTurnSimulationInputFromBattleState,
  createHydratedBattleFromState,
  getShowdownFormatIdForRegulation,
  simulateSingleTurn,
  toShowdownPokemonSet,
  toShowdownCurrentHp
} from "../src/sim/showdown-adapter.js";

describe("showdown adapter", () => {
  it("maps known regulation ids to pinned Showdown format ids", () => {
    expect(getShowdownFormatIdForRegulation("development")).toBe("gen9championsdoublescustomgame");
    expect(getShowdownFormatIdForRegulation("champions-m-b")).toBe("gen9championsvgc2026regmb");
  });

  it("maps Champions Stat Points directly and fixes every IV at 31", () => {
    const set = {
      ...singleTurnBattleState.teams.p1.active[0].set,
      statAlignment: "Modest",
      statPoints: { hp: 1, atk: 0, def: 0, spa: 32, spd: 0, spe: 32 }
    };

    expect(toShowdownPokemonSet(set)).toMatchObject({
      nature: "Modest",
      evs: { hp: 1, atk: 0, def: 0, spa: 32, spd: 0, spe: 32 },
      ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
      level: 50
    });
  });

  it("builds a Showdown move choice from legal actions", () => {
    expect(buildShowdownChoiceFromLegalActions(singleTurnBattleState.legalActions, "p1")).toBe(
      "move thunderbolt 1, move tackle 1"
    );
  });

  it("converts exact and percentage observations to Showdown HP", () => {
    expect(toShowdownCurrentHp({ unit: "exact", current: 55, max: 110 }, 200)).toBe(100);
    expect(toShowdownCurrentHp({ unit: "percent", percent: 25 }, 200)).toBe(50);
    expect(toShowdownCurrentHp({ unit: "percent", percent: 0 }, 200)).toBe(0);
  });

  it("simulates one deterministic doubles turn from sample data", () => {
    const input = createSingleTurnSimulationInputFromBattleState(singleTurnBattleState, singleTurnChoices);
    const result = simulateSingleTurn({
      ...input,
      seed: [1, 2, 3, 4]
    });

    expect(result.formatId).toBe("gen9championsdoublescustomgame");
    expect(result.turn).toBe(2);
    expect(result.moveEvents.map((event) => event.move)).toContain("Thunderbolt");
    expect(result.damageEvents.length).toBeGreaterThan(0);
    expect(result.damageEvents[0]).toMatchObject({
      target: "p2a: Squirtle",
      remainingHp: 0,
      rawHpText: "0 fnt"
    });
  });

  it("uses the opponent's observed percentage as the simulation's starting HP", () => {
    const battleState = structuredClone(singleTurnBattleState);
    battleState.teams.p2.active[0].hp = { unit: "percent", percent: 10 };

    const input = createSingleTurnSimulationInputFromBattleState(battleState, {
      ...singleTurnChoices,
      p1Choice: "move protect, move tackle 1"
    });
    const result = simulateSingleTurn({
      ...input,
      seed: [1, 2, 3, 4]
    });
    const squirtleDamage = result.damageEvents.find(
      (event) => event.target === "p2a: Squirtle"
    );

    expect(squirtleDamage).toMatchObject({ remainingHp: 0 });
    expect(squirtleDamage?.damageAmount).toBeGreaterThan(0);
    expect(squirtleDamage?.damageAmount).toBeLessThan(20);
  });

  it("hydrates the complete persistent board state before simulating", () => {
    const battleState = structuredClone(singleTurnBattleState);
    battleState.turnNumber = 3;
    battleState.teams.p1.active[0].status = "par";
    battleState.teams.p1.active[0].boosts.spa = 2;
    battleState.teams.p1.active[0].volatileEffectIds = ["focusenergy"];
    battleState.teams.p1.active[0].currentItemId = null;
    battleState.teams.p1.active[0].movePp = { thunderbolt: 3 };
    battleState.teams.p1.sideConditions.reflectTurns = 5;
    battleState.teams.p1.sideConditions.spikesLayers = 2;
    battleState.field.weather = "rain";
    battleState.field.weatherTurnsRemaining = 4;
    battleState.field.terrain = "electric";
    battleState.field.terrainTurnsRemaining = 3;
    battleState.field.trickRoomTurnsRemaining = 2;

    const input = createSingleTurnSimulationInputFromBattleState(battleState, singleTurnChoices);
    const result = simulateSingleTurn({ ...input, seed: [1, 2, 3, 4] });
    const pikachu = result.initialState.pokemon.find((pokemon) => pokemon.slot === "p1a");

    expect(result.initialState).toMatchObject({
      turnNumber: 3,
      weather: "raindance",
      weatherTurnsRemaining: 4,
      terrain: "electricterrain",
      terrainTurnsRemaining: 3,
      pseudoWeather: { trickroom: 2 },
      sideConditions: {
        p1: {
          reflect: { duration: 5 },
          spikes: { layers: 2 }
        }
      }
    });
    expect(pikachu).toMatchObject({
      status: "par",
      boosts: { spa: 2 },
      itemId: "",
      movePp: { thunderbolt: 3 },
      volatileEffectIds: ["focusenergy"]
    });
    expect(result.turn).toBe(4);
  });

  it("hydrates Showdown's consecutive Protect counter", () => {
    const state = structuredClone(singleTurnBattleState);
    state.teams.p1.active[0].protectStreak = 1;
    const battle = createHydratedBattleFromState(state);

    try {
      expect(battle.p1.active[0].volatiles.stall).toMatchObject({ counter: 3 });
    } finally {
      battle.destroy();
    }
  });

  it("hydrates active-turn, last-move, and structured volatile memory", () => {
    const state = structuredClone(singleTurnBattleState);
    const target = state.teams.p2.active[0];
    target.turnsActive = 2;
    target.lastMoveId = "tackle";
    target.lastMoveTurn = 2;
    target.lastMoveResult = "hit";
    target.volatileEffectIds = ["encore"];
    target.volatileEffects = [{
      id: "encore",
      turnsRemaining: 2,
      sourceSlot: "p1a",
      associatedMoveId: "tackle"
    }];
    const battle = createHydratedBattleFromState(state);

    try {
      expect(battle.p2.active[0]).toMatchObject({
        activeMoveActions: 2,
        lastMove: { id: "tackle" },
        volatiles: { encore: { duration: 2, move: "tackle" } }
      });
    } finally {
      battle.destroy();
    }
  });

  it("applies hydrated side conditions to turn mechanics", () => {
    const withoutReflect = structuredClone(singleTurnBattleState);
    const withReflect = structuredClone(singleTurnBattleState);
    withReflect.teams.p1.sideConditions.reflectTurns = 5;
    const choices = {
      p1Choice: singleTurnChoices.p1Choice,
      p2Choice: "move tackle 2, move scratch 2"
    };

    const baseline = simulateSingleTurn({
      ...createSingleTurnSimulationInputFromBattleState(withoutReflect, choices),
      seed: [1, 2, 3, 4]
    });
    const reflected = simulateSingleTurn({
      ...createSingleTurnSimulationInputFromBattleState(withReflect, choices),
      seed: [1, 2, 3, 4]
    });

    expect(reflected.summary.damageTakenBySide.p1).toBeGreaterThan(0);
    expect(reflected.summary.damageTakenBySide.p1).toBeLessThan(
      baseline.summary.damageTakenBySide.p1
    );
  });
});
