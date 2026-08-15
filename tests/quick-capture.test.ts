import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import { buildServer } from "../src/api/server.js";
import { singleTurnBattleState } from "../src/fixtures/single-turn-battle-state.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

function createApp(): FastifyInstance {
  app = buildServer(structuredClone(singleTurnBattleState));
  return app;
}

describe("Quick Capture server", () => {
  it("serves the operational capture screen and health endpoint", async () => {
    const server = createApp();
    const [page, health] = await Promise.all([
      server.inject({ method: "GET", url: "/" }),
      server.inject({ method: "GET", url: "/health" })
    ]);

    expect(page.statusCode).toBe(200);
    expect(page.headers["content-type"]).toContain("text/html");
    expect(page.body).toContain("EZPE Quick Capture");
    expect(page.body).toContain("Analyze turn");
    expect(health.json()).toEqual({ status: "ok", version: "0.1.0" });
  });

  it("returns state and applies a fast HP update", async () => {
    const server = createApp();
    const response = await server.inject({
      method: "POST",
      url: "/api/event",
      payload: {
        type: "damage-observed",
        slot: "p2a",
        remainingHp: { unit: "percent", percent: 58 }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().state.teams.p2.active[0].hp).toEqual({
      unit: "percent",
      percent: 58
    });

    const state = await server.inject({ method: "GET", url: "/api/state" });
    expect(state.json().state.teams.p2.active[0].hp.percent).toBe(58);
  });

  it("records a revealed opponent move", async () => {
    const server = createApp();
    const response = await server.inject({
      method: "POST",
      url: "/api/event",
      payload: { type: "move-observed", slot: "p2a", moveId: "watergun" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().state.teams.p2.active[0].set.moveKnowledge).toMatchObject({
      observedMoveIds: ["watergun"]
    });
  });

  it("returns compact ranked advice", async () => {
    const server = createApp();
    const response = await server.inject({
      method: "POST",
      url: "/api/rank",
      payload: { top: 1, maxOpponentPlans: 1 }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      totalPlans: expect.any(Number),
      elapsedMs: expect.any(Number),
      results: [
        {
          rank: 1,
          actions: [
            {
              actorSpecies: "Pikachu",
              moveName: expect.any(String),
              targetSpecies: expect.any(String),
              damage: {
                expectedDamagePercent: expect.any(Number),
                koChancePercent: expect.any(Number)
              }
            },
            {
              actorSpecies: "Bulbasaur",
              moveName: expect.any(String),
              targetSpecies: expect.any(String)
            }
          ],
          worstCase: {
            actions: expect.arrayContaining([
              expect.objectContaining({
                actorSpecies: expect.any(String),
                targetSpecies: expect.any(String),
                actionChancePercent: expect.any(Number),
                adjustedExpectedDamage: expect.any(Number)
              })
            ]),
            totalExpectedDamage: expect.any(Number),
            totalCriticalMaxDamage: expect.any(Number)
          },
          expectedScore: expect.any(Number),
          worstCaseScore: expect.any(Number)
        }
      ]
    });
  });

  it("rejects malformed updates without changing the session", async () => {
    const server = createApp();
    const response = await server.inject({
      method: "POST",
      url: "/api/event",
      payload: {
        type: "damage-observed",
        slot: "p2a",
        remainingHp: { unit: "percent", percent: 120 }
      }
    });

    expect(response.statusCode).toBe(400);
    const state = await server.inject({ method: "GET", url: "/api/state" });
    expect(state.json().state.teams.p2.active[0].hp.percent).toBe(100);
  });

  it("includes the player's current and maximum move PP", async () => {
    const server = createApp();
    await server.inject({
      method: "POST",
      url: "/api/event",
      payload: {
        type: "move-pp-changed",
        slot: "p1a",
        moveId: "thunderbolt",
        remainingPp: 7
      }
    });

    const response = await server.inject({ method: "GET", url: "/api/state" });
    expect(response.json().playerMovePp.p1a).toContainEqual({
      moveId: "thunderbolt",
      moveName: "Thunderbolt",
      currentPp: 7,
      maxPp: 15
    });
  });
});
