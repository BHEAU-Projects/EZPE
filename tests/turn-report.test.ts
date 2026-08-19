import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import { buildServer } from "../src/api/server.js";
import { singleTurnBattleState } from "../src/fixtures/single-turn-battle-state.js";
import { createBattleSession } from "../src/session/battle-session.js";
import { turnReportSchema, type TurnReport } from "../src/session/turn-report.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

function validTurnReport(): TurnReport {
  return turnReportSchema.parse({
    turnNumber: 1,
    actions: [
      { type: "move", activeSlot: "p1a", moveId: "thunderbolt", targetSlot: "p2a" },
      { type: "move", activeSlot: "p1b", moveId: "tackle", targetSlot: "p2a" },
      { type: "move", activeSlot: "p2a", moveId: "tackle", targetSlot: "p1a" },
      { type: "move", activeSlot: "p2b", moveId: "scratch", targetSlot: "p1b" }
    ],
    hp: [
      { slot: "p1a", remainingHp: { unit: "exact", current: 95 } },
      { slot: "p1b", remainingHp: { unit: "exact", current: 103 } },
      { slot: "p2a", remainingHp: { unit: "percent", percent: 48 } },
      { slot: "p2b", remainingHp: { unit: "percent", percent: 91 } }
    ],
    confirmedEffects: [{ kind: "status-applied", slot: "p1a", status: "par" }],
    ranking: { top: 1, maxOpponentPlans: 1 }
  });
}

describe("turn report contract", () => {
  it("accepts one complete observed doubles turn", () => {
    expect(turnReportSchema.parse(validTurnReport())).toMatchObject({
      turnNumber: 1,
      ranking: { top: 1, maxOpponentPlans: 1 }
    });
  });

  it("rejects duplicate action and HP slots", () => {
    const report = validTurnReport();
    report.actions[1] = { ...report.actions[0] };
    report.hp[1] = { ...report.hp[0] };

    const result = turnReportSchema.safeParse(report);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining([
          "Each active slot may appear only once in actions.",
          "Each active slot may appear only once in hp."
        ])
      );
    }
  });
});

describe("atomic turn application", () => {
  it("records actions, HP, effects, PP, and the next turn in one snapshot", () => {
    const session = createBattleSession(singleTurnBattleState);
    const resolution = session.applyTurn(validTurnReport());

    expect(resolution.phase).toBe("ready");
    expect(resolution.turnNumber).toBe(2);
    expect(resolution.state.teams.p1.active[0]).toMatchObject({
      hp: { unit: "exact", current: 95, max: 110 },
      status: "par",
      movePp: { thunderbolt: 14 },
      turnsActive: 1,
      lastMoveId: "thunderbolt",
      lastMoveTurn: 1,
      lastMoveResult: "hit"
    });
    expect(resolution.state.teams.p2.active[1].set.moveKnowledge).toMatchObject({
      observedMoveIds: ["scratch"]
    });
    expect(session.getTurnHistory()).toHaveLength(1);
    expect(session.getSnapshots()).toHaveLength(2);
  });

  it("does not mutate the session when a later report entry is invalid", () => {
    const session = createBattleSession(singleTurnBattleState);
    const report = validTurnReport();
    report.hp[1] = { slot: "p1b", remainingHp: { unit: "exact", current: 999 } };

    expect(() => session.applyTurn(report)).toThrow(/exceeds/);
    expect(session.getState()).toEqual(singleTurnBattleState);
    expect(session.getHistory()).toEqual([]);
    expect(session.getTurnHistory()).toEqual([]);
    expect(session.getSnapshots()).toEqual([singleTurnBattleState]);
  });

  it("applies ending HP to the incoming Pokemon after an observed switch", () => {
    const state = structuredClone(singleTurnBattleState);
    const incomingSet = structuredClone(state.teams.p2.active[0].set);
    state.teams.p1.bench = [{
      benchSlot: 0,
      set: incomingSet,
      hp: { unit: "exact", current: 88, max: incomingSet.stats.hp },
      status: "healthy",
      fainted: false
    }];
    state.teams.p1.active[0].turnsActive = 3;
    state.teams.p1.active[0].lastMoveId = "protect";
    state.teams.p1.active[0].lastMoveTurn = 1;
    state.teams.p1.active[0].lastMoveResult = "hit";
    state.teams.p1.active[0].volatileEffectIds = ["focusenergy"];
    state.teams.p1.active[0].volatileEffects = [{ id: "focusenergy" }];
    const report = validTurnReport();
    report.actions[0] = { type: "switch", activeSlot: "p1a", benchSlot: 0 };
    report.hp[0] = { slot: "p1a", remainingHp: { unit: "exact", current: 77 } };

    const resolution = createBattleSession(state).applyTurn(report);
    expect(resolution.state.teams.p1.active[0]).toMatchObject({
      set: { speciesId: "squirtle" },
      hp: { unit: "exact", current: 77, max: incomingSet.stats.hp },
      turnsActive: 0,
      lastMoveId: null,
      volatileEffects: []
    });
    expect(resolution.state.teams.p1.bench[0]).toMatchObject({
      set: { speciesId: "pikachu" },
      hp: { unit: "exact", current: 110, max: 110 }
    });
  });

  it("records visible misses as the last move result", () => {
    const report = validTurnReport();
    report.confirmedEffects.push({ kind: "move-result", slot: "p1a", result: "missed" });

    const state = createBattleSession(singleTurnBattleState).applyTurn(report).state;
    expect(state.teams.p1.active[0].lastMoveResult).toBe("missed");
  });

  it("rejects a stale turn report without changing state", () => {
    const session = createBattleSession(singleTurnBattleState);
    const report = validTurnReport();
    report.turnNumber = 2;

    expect(() => session.applyTurn(report)).toThrow(/session is on turn 1/);
    expect(session.getState().turnNumber).toBe(1);
  });
});

describe("POST /api/turn", () => {
  it("applies the report and returns next-turn advice", async () => {
    app = buildServer(structuredClone(singleTurnBattleState));
    const response = await app.inject({ method: "POST", url: "/api/turn", payload: validTurnReport() });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      phase: "ready",
      turnNumber: 2,
      state: { turnNumber: 2 },
      advice: {
        totalPlans: expect.any(Number),
        elapsedMs: expect.any(Number),
        results: [{ rank: 1 }]
      }
    });
  });

  it("rejects an incomplete report without changing the session", async () => {
    app = buildServer(structuredClone(singleTurnBattleState));
    const report = validTurnReport();
    report.hp.pop();
    const response = await app.inject({ method: "POST", url: "/api/turn", payload: report });
    const state = await app.inject({ method: "GET", url: "/api/state" });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/missing ending HP/);
    expect(state.json().state.turnNumber).toBe(1);
  });
});
