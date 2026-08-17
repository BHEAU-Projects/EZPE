import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import { buildServer } from "../src/api/server.js";
import { pokemonDataService } from "../src/data/pokemon-data-service.js";
import {
  pokemonSetSchema,
  type ActivePokemon,
  type BattleState,
  type PlayerSide,
  type PokemonSet
} from "../src/domain/battle-state.js";
import { singleTurnBattleState } from "../src/fixtures/single-turn-battle-state.js";
import { createBattleStateFromTeams } from "../src/io/battle-state-file.js";
import { createBattleSession } from "../src/session/battle-session.js";
import {
  replacementSubmissionSchema,
  turnReportSchema,
  type TurnReport
} from "../src/session/turn-report.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

function fourPokemonState(): BattleState {
  const p1Team = [
    singleTurnBattleState.teams.p1.active[0].set,
    singleTurnBattleState.teams.p1.active[1].set,
    singleTurnBattleState.teams.p2.active[0].set,
    singleTurnBattleState.teams.p2.active[1].set
  ];
  const p2Team = [p1Team[2], p1Team[3], p1Team[0], p1Team[1]];
  return createBattleStateFromTeams({
    regulationId: "development",
    playerSide: "p1",
    p1Team,
    p2Team,
    p1PreviewRoster: p1Team,
    p2PreviewRoster: p2Team
  });
}

function stateWithSixOpponentPreview(): BattleState {
  const state = fourPokemonState();
  state.teams.p2.previewRoster = [
    ...state.teams.p2.active.map((pokemon) => pokemon.set),
    ...state.teams.p2.bench.map((pokemon) => pokemon.set),
    createSet("eevee"),
    createSet("jigglypuff")
  ];
  return state;
}

function endingTurnReport(
  state: BattleState,
  hpOverrides: Partial<Record<ActivePokemon["slot"], number>>
): TurnReport {
  return turnReportSchema.parse({
    turnNumber: state.turnNumber,
    actions: [...state.teams.p1.active, ...state.teams.p2.active]
      .filter((pokemon) => !isFainted(pokemon))
      .map((pokemon) => ({ type: "no-action", activeSlot: pokemon.slot, reason: "other" })),
    hp: [...state.teams.p1.active, ...state.teams.p2.active].map((pokemon) => {
      const value = hpOverrides[pokemon.slot];
      return {
        slot: pokemon.slot,
        remainingHp: pokemon.hp.unit === "exact"
          ? { unit: "exact", current: value ?? pokemon.hp.current }
          : { unit: "percent", percent: value ?? pokemon.hp.percent }
      };
    })
  });
}

describe("replacement workflow", () => {
  it("requests a player replacement and applies it without consuming another turn", () => {
    const state = fourPokemonState();
    const session = createBattleSession(state);
    const turn = session.applyTurn(endingTurnReport(state, { p1a: 0 }));

    expect(turn.phase).toBe("replacement-required");
    expect(turn.replacementRequests).toEqual([
      expect.objectContaining({
        side: "p1",
        activeSlot: "p1a",
        choices: expect.arrayContaining([
          expect.objectContaining({ speciesId: "squirtle" }),
          expect.objectContaining({ speciesId: "charmander" })
        ])
      })
    ]);

    const replacement = session.applyReplacements(replacementSubmissionSchema.parse({
      replacements: [{ side: "p1", activeSlot: "p1a", speciesId: "squirtle" }]
    }));
    expect(replacement.phase).toBe("ready");
    expect(replacement.turnNumber).toBe(2);
    expect(replacement.state.teams.p1.active.find((pokemon) => pokemon.slot === "p1a")?.set.speciesId).toBe("squirtle");
  });

  it("offers unrevealed preview Pokemon and materializes the selected opponent reserve", () => {
    const state = stateWithSixOpponentPreview();
    const session = createBattleSession(state);
    const turn = session.applyTurn(endingTurnReport(state, { p2a: 0 }));
    const request = turn.replacementRequests[0];

    expect(request.side).toBe("p2");
    expect(request.choices.map((choice) => choice.speciesId)).toEqual(
      expect.arrayContaining(["pikachu", "bulbasaur", "eevee", "jigglypuff"])
    );

    const replacement = session.applyReplacements(replacementSubmissionSchema.parse({
      replacements: [{ side: "p2", activeSlot: "p2a", speciesId: "eevee" }]
    }));
    expect(replacement.state.teams.p2.active.find((pokemon) => pokemon.slot === "p2a")?.set.speciesId).toBe("eevee");
    expect(replacement.state.teams.p2.active.find((pokemon) => pokemon.slot === "p2a")?.hp).toEqual({
      unit: "percent",
      percent: 100
    });
  });

  it("supports simultaneous replacements and rejects selecting the same Pokemon twice", () => {
    const state = fourPokemonState();
    const session = createBattleSession(state);
    const turn = session.applyTurn(endingTurnReport(state, { p1a: 0, p1b: 0 }));

    expect(turn.replacementRequests).toHaveLength(2);
    expect(() => replacementSubmissionSchema.parse({
      replacements: [
        { side: "p1", activeSlot: "p1a", speciesId: "squirtle" },
        { side: "p1", activeSlot: "p1b", speciesId: "squirtle" }
      ]
    })).toThrow(/same Pokemon/);

    const replacement = session.applyReplacements(replacementSubmissionSchema.parse({
      replacements: [
        { side: "p1", activeSlot: "p1a", speciesId: "squirtle" },
        { side: "p1", activeSlot: "p1b", speciesId: "charmander" }
      ]
    }));
    expect(replacement.phase).toBe("ready");
  });

  it("continues with one Pokemon when no reserve exists and reports battle over at zero", () => {
    const oneFaintState = structuredClone(singleTurnBattleState);
    const oneFaint = createBattleSession(oneFaintState).applyTurn(
      endingTurnReport(oneFaintState, { p2a: 0 })
    );
    const bothFaintState = structuredClone(singleTurnBattleState);
    const bothFaint = createBattleSession(bothFaintState).applyTurn(
      endingTurnReport(bothFaintState, { p2a: 0, p2b: 0 })
    );

    expect(oneFaint).toMatchObject({ phase: "ready", replacementRequests: [] });
    expect(bothFaint).toMatchObject({ phase: "battle-over", winner: "p1", replacementRequests: [] });
  });

  it("pauses advice for replacement and refreshes it after the API selection", async () => {
    const state = fourPokemonState();
    app = buildServer(state);
    const turn = await app.inject({
      method: "POST",
      url: "/api/turn",
      payload: endingTurnReport(state, { p1a: 0 })
    });

    expect(turn.statusCode).toBe(200);
    expect(turn.json()).toMatchObject({ phase: "replacement-required", advice: null });

    const replacement = await app.inject({
      method: "POST",
      url: "/api/replacements",
      payload: {
        replacements: [{ side: "p1", activeSlot: "p1a", speciesId: "squirtle" }],
        ranking: { top: 1, maxOpponentPlans: 1 }
      }
    });
    expect(replacement.statusCode).toBe(200);
    expect(replacement.json()).toMatchObject({
      phase: "ready",
      turnNumber: 2,
      advice: { results: [{ rank: 1 }] }
    });
  });
});

function createSet(speciesId: string): PokemonSet {
  const species = pokemonDataService.getSpecies("development", speciesId);
  if (!species) throw new Error(`Unknown test species ${speciesId}.`);
  const base = {
    speciesId: species.id,
    displayName: species.name,
    level: 50,
    itemId: null,
    abilityId: species.abilityIds[0],
    moveIds: pokemonDataService.getFallbackMoveIds("development", species.id),
    statAlignment: "Bashful",
    statPoints: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
  };
  return pokemonSetSchema.parse({
    ...base,
    stats: pokemonDataService.calculateStats(base, "development")
  });
}

function isFainted(pokemon: { hp: ActivePokemon["hp"] }): boolean {
  return pokemon.hp.unit === "exact" ? pokemon.hp.current === 0 : pokemon.hp.percent === 0;
}
