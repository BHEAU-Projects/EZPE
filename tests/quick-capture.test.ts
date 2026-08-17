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
  it("serves team setup before the operational capture screen", async () => {
    const server = createApp();
    const [setup, battle, health] = await Promise.all([
      server.inject({ method: "GET", url: "/" }),
      server.inject({ method: "GET", url: "/battle" }),
      server.inject({ method: "GET", url: "/health" })
    ]);

    expect(setup.statusCode).toBe(200);
    expect(setup.headers["content-type"]).toContain("text/html");
    expect(setup.body).toContain("EZPE Team Setup");
    expect(setup.body).toContain("Your Champions team");
    expect(setup.body).toContain("Stat Points");
    expect(setup.body).not.toContain("IVs and EVs");
    expect(battle.body).toContain("EZPE Quick Capture");
    expect(battle.body).toContain("Analyze turn");
    expect(health.json()).toEqual({ status: "ok", version: "0.1.0" });
  });

  it("builds a live battle from player and opponent setup submissions", async () => {
    const server = createApp();
    const team = [
      ...singleTurnBattleState.teams.p1.active,
      ...singleTurnBattleState.teams.p2.active
    ].map((pokemon) => ({
      speciesId: pokemon.set.speciesId,
      nickname: pokemon.set.displayName,
      gender: "M",
      abilityId: pokemon.set.abilityId,
      itemId: pokemon.set.itemId,
      moveIds: pokemon.set.moveIds,
      statAlignment: pokemon.set.statAlignment,
      statPoints: pokemon.set.statPoints
    }));

    const player = await server.inject({
      method: "POST",
      url: "/api/setup/player",
      payload: { regulationId: "development", pokemon: team, battleOrder: [0, 1, 2, 3] }
    });
    const opponent = await server.inject({
      method: "POST",
      url: "/api/setup/opponent",
      payload: {
        pokemon: [
          { speciesId: "squirtle", gender: "M" },
          { speciesId: "charmander", gender: "F" },
          { speciesId: "bulbasaur", gender: "M" },
          { speciesId: "pikachu", gender: "F" }
        ],
        leadOrder: [1, 0]
      }
    });

    expect(player.statusCode).toBe(200);
    expect(opponent.statusCode).toBe(200);
    expect(opponent.json()).toMatchObject({ next: "/battle" });
    const state = await server.inject({ method: "GET", url: "/api/state" });
    expect(state.json().state.teams.p2.active).toMatchObject([
      { set: { speciesId: "charmander", gender: "F" } },
      { set: { speciesId: "squirtle", gender: "M" } }
    ]);
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
