import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import { buildServer } from "../src/api/server.js";
import type { ActivePokemon, BattleState, TargetSlot } from "../src/domain/battle-state.js";
import { singleTurnBattleState } from "../src/fixtures/single-turn-battle-state.js";
import { createBattleSession } from "../src/session/battle-session.js";
import { suggestTurnEffects } from "../src/session/turn-effects.js";
import { turnReportSchema, type TurnReport } from "../src/session/turn-report.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

function reportWithMove(
  state: BattleState,
  slot: ActivePokemon["slot"],
  moveId: string,
  targetSlot: TargetSlot
): TurnReport {
  const pokemon = state.teams[slot.slice(0, 2) as "p1" | "p2"].active.find(
    (candidate) => candidate.slot === slot
  );
  if (!pokemon) throw new Error(`Missing ${slot}.`);
  pokemon.set.moveIds = [moveId, ...pokemon.set.moveIds.filter((id) => id !== moveId)].slice(0, 4);

  return turnReportSchema.parse({
    turnNumber: state.turnNumber,
    actions: [...state.teams.p1.active, ...state.teams.p2.active]
      .filter((active) => !isFainted(active))
      .map((active) => active.slot === slot
        ? { type: "move" as const, activeSlot: active.slot, moveId, targetSlot }
        : { type: "no-action" as const, activeSlot: active.slot, reason: "other" as const }),
    hp: [...state.teams.p1.active, ...state.teams.p2.active].map((active) => ({
      slot: active.slot,
      remainingHp: active.hp.unit === "exact"
        ? { unit: "exact" as const, current: active.hp.current }
        : { unit: "percent" as const, percent: active.hp.percent }
    }))
  });
}

function resolveMove(
  moveId: string,
  targetSlot: TargetSlot,
  configure?: (state: BattleState) => void
): BattleState {
  const state = structuredClone(singleTurnBattleState);
  configure?.(state);
  const report = reportWithMove(state, "p1a", moveId, targetSlot);
  const session = createBattleSession(state);
  return session.applyTurn(report).state;
}

describe("automatic timed effects", () => {
  it("starts weather and stores its next-turn remaining duration", () => {
    const state = resolveMove("raindance", "field", (battle) => {
      battle.teams.p1.active[0].set.itemId = null;
    });

    expect(state.field).toMatchObject({ weather: "rain", weatherTurnsRemaining: 4 });
  });

  it("uses Showdown item duration callbacks for weather, terrain, and screens", () => {
    const dampRock = resolveMove("raindance", "field", (battle) => {
      battle.teams.p1.active[0].set.itemId = "damprock";
    });
    const terrainExtender = resolveMove("electricterrain", "field", (battle) => {
      battle.teams.p1.active[0].set.itemId = "terrainextender";
    });
    const lightClay = resolveMove("reflect", "allySide", (battle) => {
      battle.teams.p1.active[0].set.itemId = "lightclay";
    });

    expect(dampRock.field.weatherTurnsRemaining).toBe(7);
    expect(terrainExtender.field).toMatchObject({ terrain: "electric", terrainTurnsRemaining: 7 });
    expect(lightClay.teams.p1.sideConditions.reflectTurns).toBe(7);
  });

  it("tracks rooms, Tailwind, hazards, and effect expiry", () => {
    const trickRoom = resolveMove("trickroom", "field");
    const tailwind = resolveMove("tailwind", "allySide");
    const rocks = resolveMove("stealthrock", "opponentSide");
    const expiring = resolveMove("protect", "self", (battle) => {
      battle.field.weather = "rain";
      battle.field.weatherTurnsRemaining = 1;
    });

    expect(trickRoom.field.trickRoomTurnsRemaining).toBe(4);
    expect(tailwind.teams.p1.sideConditions.tailwindTurns).toBe(3);
    expect(rocks.teams.p2.sideConditions.stealthRock).toBe(true);
    expect(expiring.field).toMatchObject({ weather: null, weatherTurnsRemaining: 0 });
    expect(expiring.teams.p1.active[0].protectStreak).toBe(1);
  });

  it("resets a consecutive protection streak when the move visibly fails", () => {
    const state = structuredClone(singleTurnBattleState);
    state.teams.p1.active[0].protectStreak = 1;
    const report = reportWithMove(state, "p1a", "protect", "self");
    report.confirmedEffects.push({ kind: "move-result", slot: "p1a", result: "failed" });

    const next = createBattleSession(state).applyTurn(report).state;
    expect(next.teams.p1.active[0].protectStreak).toBe(0);
  });

  it("does not apply a field effect marked as missed or failed", () => {
    const state = structuredClone(singleTurnBattleState);
    const report = reportWithMove(state, "p1a", "raindance", "field");
    report.confirmedEffects.push({ kind: "move-result", slot: "p1a", result: "failed" });
    const session = createBattleSession(state);

    expect(session.applyTurn(report).state.field.weather).toBeNull();
  });

  it("stores deterministic volatile effects with Showdown durations and move memory", () => {
    const encored = resolveMove("encore", "p2a", (battle) => {
      const target = battle.teams.p2.active[0];
      target.lastMoveId = "tackle";
      target.lastMoveTurn = 1;
      target.lastMoveResult = "hit";
    });

    expect(encored.teams.p2.active[0].volatileEffects).toContainEqual({
      id: "encore",
      turnsRemaining: 2,
      sourceSlot: "p1a",
      associatedMoveId: "tackle"
    });
  });

  it("expires structured volatile durations at the next-turn boundary", () => {
    const state = resolveMove("protect", "self", (battle) => {
      battle.teams.p1.active[1].volatileEffectIds = ["focusenergy"];
      battle.teams.p1.active[1].volatileEffects = [{ id: "focusenergy", turnsRemaining: 1 }];
    });

    expect(state.teams.p1.active[1].volatileEffectIds).not.toContain("focusenergy");
    expect(state.teams.p1.active[1].volatileEffects).toEqual([]);
  });
});

describe("contextual effect suggestions", () => {
  it("offers a one-tap failure outcome for consecutive Protect attempts", () => {
    const state = structuredClone(singleTurnBattleState);
    state.teams.p1.active[0].protectStreak = 1;

    const suggestions = suggestTurnEffects(state, [
      { type: "move", activeSlot: "p1a", moveId: "protect", targetSlot: "self" }
    ]);

    expect(suggestions).toContainEqual(expect.objectContaining({
      label: "Protect failed",
      chancePercent: expect.closeTo(200 / 3),
      effect: { kind: "move-result", slot: "p1a", result: "failed" }
    }));
  });

  it("describes misses, status chances, flinches, and spread stat changes from Showdown data", () => {
    const state = structuredClone(singleTurnBattleState);
    const suggestions = suggestTurnEffects(state, [
      { type: "move", activeSlot: "p1a", moveId: "thunderbolt", targetSlot: "p2a" },
      { type: "move", activeSlot: "p1b", moveId: "fakeout", targetSlot: "p2b" },
      { type: "move", activeSlot: "p2a", moveId: "icywind", targetSlot: "opponentSide" }
    ]);

    expect(suggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({ chancePercent: 10, effect: { kind: "status-applied", slot: "p2a", status: "par" } }),
      expect.objectContaining({ chancePercent: 100, effect: { kind: "action-denied", slot: "p2b", reason: "flinched" } }),
      expect.objectContaining({ chancePercent: 5, effect: { kind: "move-result", slot: "p2a", result: "missed" } }),
      expect.objectContaining({ chancePercent: 95, effect: expect.objectContaining({ kind: "boosts-changed", slot: "p1a" }) }),
      expect.objectContaining({ chancePercent: 95, effect: expect.objectContaining({ kind: "boosts-changed", slot: "p1b" }) })
    ]));
  });

  it("serves effect suggestions for the turn UI", async () => {
    app = buildServer(structuredClone(singleTurnBattleState));
    const response = await app.inject({
      method: "POST",
      url: "/api/turn/effects",
      payload: {
        actions: [{ type: "move", activeSlot: "p1a", moveId: "thunderbolt", targetSlot: "p2a" }]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().suggestions).toContainEqual(expect.objectContaining({
      effect: { kind: "status-applied", slot: "p2a", status: "par" }
    }));
  });
});

function isFainted(pokemon: ActivePokemon): boolean {
  return pokemon.hp.unit === "exact" ? pokemon.hp.current === 0 : pokemon.hp.percent === 0;
}
