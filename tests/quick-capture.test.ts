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
    expect(setup.body).toContain("Choose your four");
    expect(setup.body).toContain("Stat Points");
    expect(setup.body).not.toContain("IVs and EVs");
    expect(setup.body).not.toContain("Nickname");
    expect(battle.body).toContain("Live Battle");
    expect(battle.body).toContain("Turn Report");
    expect(battle.body).toContain("End Turn");
    expect(battle.body).toContain("Recommendations");
    expect(battle.body).toContain("Opponent scenarios");
    expect(battle.body).toContain("scenario mean");
    expect(battle.body).toContain("Branch floor");
    expect(battle.body).toContain("Expected turn order vs worst response");
    expect(battle.body).toContain("Highest-damage enemy line");
    expect(battle.body).toContain("Manual corrections");
    expect(battle.body).toContain("Observed Effects");
    expect(battle.body).toContain('localStorage.getItem("ezpe-ranking-settings")');
    expect(battle.body).toContain("source-confirmed");
    expect(battle.body).toContain("source-predicted");
    expect(battle.body).toContain("type-electric");
    expect(battle.body).toContain("targetDamages");
    expect(battle.body).toContain("selectSwitch(option, choice)");
    expect(health.json()).toEqual({ status: "ok", version: "0.1.0" });
  });

  it("returns compact move, target, switch, and metadata options for the turn screen", async () => {
    const server = createApp();
    const state = await server.inject({ method: "GET", url: "/api/state" });
    const move = await server.inject({ method: "GET", url: "/api/move/thunderbolt" });

    expect(state.statusCode).toBe(200);
    expect(state.json().turnOptions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        side: "p1",
        slot: "p1a",
        speciesId: "pikachu",
        moves: expect.arrayContaining([
          expect.objectContaining({
            moveId: "thunderbolt",
            moveName: "Thunderbolt",
            moveType: "electric",
            moveSource: "known",
            successChancePercent: 100,
            targets: expect.arrayContaining(["p2a", "p2b"])
          })
        ])
      }),
      expect.objectContaining({ side: "p2", slot: "p2a", moves: expect.any(Array) })
    ]));
    expect(move.statusCode).toBe(200);
    expect(move.json()).toMatchObject({
      id: "thunderbolt",
      name: "Thunderbolt",
      basePower: 90,
      accuracy: 100,
      pp: 15,
      target: "normal"
    });
  });

  it("prefills switch choices with the incoming Pokemon's HP", async () => {
    const state = structuredClone(singleTurnBattleState);
    const incomingSet = structuredClone(state.teams.p2.active[0].set);
    state.teams.p1.bench = [{
      benchSlot: 0,
      set: incomingSet,
      hp: { unit: "exact", current: 73, max: incomingSet.stats.hp },
      status: "healthy",
      fainted: false
    }];
    app = buildServer(state);

    const response = await app.inject({ method: "GET", url: "/api/state" });
    const pikachu = response.json().turnOptions.find((option: { slot: string }) => option.slot === "p1a");
    expect(pikachu.switches).toContainEqual(expect.objectContaining({
      speciesId: "squirtle",
      hp: { unit: "exact", current: 73, max: incomingSet.stats.hp }
    }));
  });

  it("builds a live battle from player and opponent setup submissions", async () => {
    const server = createApp();
    const team = [
      ...singleTurnBattleState.teams.p1.active,
      ...singleTurnBattleState.teams.p2.active
    ].map((pokemon) => ({
      speciesId: pokemon.set.speciesId,
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
      payload: { regulationId: "development", pokemon: team }
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
        ]
      }
    });
    const selection = await server.inject({
      method: "POST",
      url: "/api/setup/selection",
      payload: { battleOrder: [0, 1, 2, 3] }
    });
    const start = await server.inject({
      method: "POST",
      url: "/api/setup/start",
      payload: { opponentLeadOrder: [1, 0] }
    });

    expect(player.statusCode).toBe(200);
    expect(opponent.statusCode).toBe(200);
    expect(opponent.json()).toMatchObject({ opponentConfigured: true, selectionConfigured: false });
    expect(selection.statusCode).toBe(200);
    expect(start.statusCode).toBe(200);
    expect(start.json()).toMatchObject({ next: "/battle" });
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
    const squirtle = response.json().turnOptions.find((option: { slot: string }) => option.slot === "p2a");
    expect(squirtle.moves.find((move: { moveId: string }) => move.moveId === "watergun")).toMatchObject({
      moveType: "water",
      moveSource: "confirmed"
    });
    expect(squirtle.moves.find((move: { moveId: string }) => move.moveId === "tackle")).toMatchObject({
      moveSource: "predicted"
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
          turnOrder: expect.arrayContaining([
            expect.objectContaining({
              order: expect.any(Number),
              actorSpecies: expect.any(String),
              description: expect.any(String)
            })
          ]),
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
          worstCaseScore: expect.any(Number),
          mechanicsExpectedScore: expect.any(Number),
          scenarioMeanScore: expect.any(Number),
          worstResponseScore: expect.any(Number),
          branchAgreement: expect.any(Number),
          informationConfidence: expect.any(Number),
          opponentScenarioCount: 1,
          worstOpponentChoice: expect.any(String)
        }
      ]
    });
  });

  it("keeps a representative warm recommendation below two seconds", async () => {
    const server = createApp();
    const payload = { top: 3, maxOpponentPlans: 4 };
    await server.inject({ method: "POST", url: "/api/rank", payload });
    const warm = await server.inject({ method: "POST", url: "/api/rank", payload });

    expect(warm.statusCode).toBe(200);
    expect(warm.json().elapsedMs).toBeLessThan(2_000);
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
