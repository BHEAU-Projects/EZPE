import { describe, expect, it } from "vitest";

import type { BattleState } from "../src/domain/battle-state.js";
import { singleTurnBattleState } from "../src/fixtures/single-turn-battle-state.js";
import { applyBattleEvent } from "../src/session/state-reducer.js";

const zeroBoosts = {
  atk: 0,
  def: 0,
  spa: 0,
  spd: 0,
  spe: 0,
  accuracy: 0,
  evasion: 0
};

function battleStateWithBenchPokemon(): BattleState {
  const state = structuredClone(singleTurnBattleState);
  state.teams.p1.active[0].hp = { unit: "exact", current: 73, max: 110 };
  state.teams.p1.active[0].status = "par";
  state.teams.p1.active[0].boosts.atk = 2;
  state.teams.p1.bench = [
    {
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
        stats: {
          hp: 100,
          atk: 60,
          def: 60,
          spa: 60,
          spd: 60,
          spe: 60
        }
      },
      hp: { unit: "exact", current: 81, max: 100 },
      status: "brn",
      fainted: false
    }
  ];

  return state;
}

describe("applyBattleEvent", () => {
  it("updates observed HP without mutating the previous state", () => {
    const state = structuredClone(singleTurnBattleState);
    const nextState = applyBattleEvent(state, {
      type: "damage-observed",
      slot: "p2a",
      remainingHp: { unit: "percent", percent: 40 }
    });

    expect(nextState.teams.p2.active[0].hp).toEqual({ unit: "percent", percent: 40 });
    expect(state.teams.p2.active[0].hp).toEqual({ unit: "percent", percent: 100 });
  });

  it("updates the player's exact observed HP", () => {
    const nextState = applyBattleEvent(singleTurnBattleState, {
      type: "damage-observed",
      slot: "p1a",
      remainingHp: { unit: "exact", current: 72 }
    });

    expect(nextState.teams.p1.active[0].hp).toEqual({
      unit: "exact",
      current: 72,
      max: 110
    });
  });

  it("rejects an exact HP observation above that Pokemon's maximum", () => {
    expect(() =>
      applyBattleEvent(singleTurnBattleState, {
        type: "damage-observed",
        slot: "p1a",
        remainingHp: { unit: "exact", current: 111 }
      })
    ).toThrow(/exceeds/);
  });

  it("rejects an HP unit that does not match the observed side", () => {
    expect(() =>
      applyBattleEvent(singleTurnBattleState, {
        type: "damage-observed",
        slot: "p2a",
        remainingHp: { unit: "exact", current: 40 }
      })
    ).toThrow(/must be observed as percent/);
  });

  it("marks fainted Pokemon at zero HP", () => {
    const nextState = applyBattleEvent(singleTurnBattleState, {
      type: "faint-observed",
      slot: "p2a"
    });

    expect(nextState.teams.p2.active[0].hp).toEqual({ unit: "percent", percent: 0 });
  });

  it("swaps active and bench Pokemon while preserving persistent state", () => {
    const state = battleStateWithBenchPokemon();
    const nextState = applyBattleEvent(state, {
      type: "switch-observed",
      side: "p1",
      activeSlot: "p1a",
      benchSlot: 0
    });

    expect(nextState.teams.p1.active[0]).toMatchObject({
      slot: "p1a",
      hp: { unit: "exact", current: 81, max: 100 },
      status: "brn",
      boosts: zeroBoosts,
      volatileEffectIds: [],
      protectedThisTurn: false
    });
    expect(nextState.teams.p1.active[0].set.speciesId).toBe("eevee");
    expect(nextState.teams.p1.bench[0]).toMatchObject({
      benchSlot: 0,
      hp: { unit: "exact", current: 73, max: 110 },
      status: "par",
      fainted: false
    });
    expect(nextState.teams.p1.bench[0].set.speciesId).toBe("pikachu");
  });

  it("applies status, boost, field, and side-condition observations", () => {
    let state = applyBattleEvent(singleTurnBattleState, {
      type: "status-applied",
      slot: "p1a",
      status: "par"
    });
    state = applyBattleEvent(state, {
      type: "boosts-changed",
      slot: "p1a",
      boosts: { ...zeroBoosts, spa: 2 }
    });
    state = applyBattleEvent(state, {
      type: "field-changed",
      changes: { terrain: "electric", terrainTurnsRemaining: 5 }
    });
    state = applyBattleEvent(state, {
      type: "side-condition-changed",
      side: "p2",
      changes: { reflectTurns: 5 }
    });

    expect(state.teams.p1.active[0].status).toBe("par");
    expect(state.teams.p1.active[0].boosts.spa).toBe(2);
    expect(state.field).toMatchObject({ terrain: "electric", terrainTurnsRemaining: 5 });
    expect(state.teams.p2.sideConditions.reflectTurns).toBe(5);
  });

  it("tracks current item, ability, move PP, and volatile effects", () => {
    let state = applyBattleEvent(singleTurnBattleState, {
      type: "item-changed",
      slot: "p1a",
      itemId: null
    });
    state = applyBattleEvent(state, {
      type: "ability-changed",
      slot: "p1a",
      abilityId: "lightningrod"
    });
    state = applyBattleEvent(state, {
      type: "move-pp-changed",
      slot: "p1a",
      moveId: "thunderbolt",
      remainingPp: 3
    });
    state = applyBattleEvent(state, {
      type: "volatiles-changed",
      slot: "p1a",
      volatileEffectIds: ["focusenergy"]
    });

    expect(state.teams.p1.active[0]).toMatchObject({
      currentItemId: null,
      currentAbilityId: "lightningrod",
      movePp: { thunderbolt: 3 },
      volatileEffectIds: ["focusenergy"]
    });
  });

  it("rejects PP observations for moves the Pokemon does not know", () => {
    expect(() =>
      applyBattleEvent(singleTurnBattleState, {
        type: "move-pp-changed",
        slot: "p1a",
        moveId: "surf",
        remainingPp: 5
      })
    ).toThrow(/does not know surf/);
  });

  it("replaces opponent move assumptions as moves are observed", () => {
    const state = structuredClone(singleTurnBattleState);
    state.teams.p2.active[0].set.moveKnowledge = {
      source: "usage-default",
      observedMoveIds: [],
      assumedMoveIds: ["tackle", "protect"],
      usageSnapshotId: "test-snapshot"
    };

    const nextState = applyBattleEvent(state, {
      type: "move-observed",
      slot: "p2a",
      moveId: "watergun"
    });

    expect(nextState.teams.p2.active[0].set).toMatchObject({
      moveIds: ["watergun", "tackle", "protect"],
      moveKnowledge: {
        observedMoveIds: ["watergun"],
        assumedMoveIds: ["tackle", "protect"],
        usageSnapshotId: "test-snapshot"
      }
    });
    expect(state.teams.p2.active[0].set.moveIds).toEqual(["tackle", "protect"]);
  });

  it("rejects move observations for the known player team", () => {
    expect(() =>
      applyBattleEvent(singleTurnBattleState, {
        type: "move-observed",
        slot: "p1a",
        moveId: "fakeout"
      })
    ).toThrow(/opponent move/);
  });

  it("starts a turn, clears protection, and refreshes legal actions", () => {
    const state = structuredClone(singleTurnBattleState);
    state.teams.p1.active[0].protectedThisTurn = true;

    const nextState = applyBattleEvent(state, {
      type: "turn-started",
      turnNumber: 2,
      legalActions: [
        {
          type: "move",
          activeSlot: "p1a",
          moveId: "protect",
          targetSlot: "self",
          flags: {}
        }
      ]
    });

    expect(nextState.turnNumber).toBe(2);
    expect(nextState.teams.p1.active[0].protectedThisTurn).toBe(false);
    expect(nextState.legalActions[0]).toMatchObject({ moveId: "protect" });
  });
});
