import { describe, expect, it } from "vitest";

import type { PokemonSet } from "../src/domain/battle-state.js";
import { singleTurnBattleState } from "../src/fixtures/single-turn-battle-state.js";
import {
  playerTeamSetupSchema,
  TeamSetupController,
  type PlayerTeamSetup
} from "../src/setup/team-setup.js";

function playerPokemon(set: PokemonSet) {
  return {
    speciesId: set.speciesId,
    nickname: set.displayName,
    gender: "M" as const,
    abilityId: set.abilityId,
    itemId: set.itemId,
    moveIds: [...set.moveIds],
    statAlignment: set.statAlignment,
    statPoints: set.statPoints
  };
}

function validPlayerSetup(): PlayerTeamSetup {
  return {
    regulationId: "development",
    pokemon: [
      ...singleTurnBattleState.teams.p1.active,
      ...singleTurnBattleState.teams.p2.active
    ].map((pokemon) => playerPokemon(pokemon.set)),
    battleOrder: [0, 1, 2, 3]
  };
}

describe("team setup", () => {
  it("validates Stat Point totals and four unique battle positions", () => {
    const tooManyStatPoints = validPlayerSetup();
    tooManyStatPoints.pokemon[0].statPoints = { hp: 32, atk: 32, def: 3, spa: 0, spd: 0, spe: 0 };
    const duplicatePositions = validPlayerSetup();
    duplicatePositions.battleOrder = [0, 0, 1, 2];

    expect(playerTeamSetupSchema.safeParse(tooManyStatPoints).success).toBe(false);
    expect(playerTeamSetupSchema.safeParse(duplicatePositions).success).toBe(false);
  });

  it("calculates the player team and infers hidden opponent information", () => {
    const setup = new TeamSetupController();
    const playerSetup = validPlayerSetup();
    playerSetup.pokemon.push(
      { ...structuredClone(playerSetup.pokemon[0]), nickname: "Reserve one" },
      { ...structuredClone(playerSetup.pokemon[1]), nickname: "Reserve two" }
    );
    setup.setPlayerTeam(playerSetup);

    const state = setup.createBattle({
      pokemon: [
        { speciesId: "squirtle", gender: "M" },
        { speciesId: "charmander", gender: "F" },
        { speciesId: "bulbasaur", gender: "M" },
        { speciesId: "pikachu", gender: "F" },
        { speciesId: "squirtle", gender: "F" },
        { speciesId: "charmander", gender: "M" }
      ],
      leadOrder: [1, 3]
    });

    expect(state.teams.p1.active.map((pokemon) => pokemon.set.speciesId)).toEqual([
      "pikachu",
      "bulbasaur"
    ]);
    expect(state.teams.p1.active[0].hp).toEqual({ unit: "exact", current: 110, max: 110 });
    expect(state.teams.p2.active.map((pokemon) => pokemon.set.speciesId)).toEqual([
      "charmander",
      "pikachu"
    ]);
    expect(state.teams.p2.active[0].set).toMatchObject({
      gender: "F",
      statAlignment: "Serious",
      statPoints: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      moveKnowledge: {
        source: "fallback",
        observedMoveIds: [],
        assumedMoveIds: expect.any(Array)
      }
    });
    expect(state.teams.p2.active[0].set.moveIds.length).toBeGreaterThan(0);
    expect(state.teams.p1.previewRoster).toHaveLength(6);
    expect(state.teams.p2.previewRoster).toHaveLength(6);
  });

  it("keeps development setup usable when Showdown has no current learnset", () => {
    const setup = new TeamSetupController();
    setup.setPlayerTeam(validPlayerSetup());

    const state = setup.createBattle({
      pokemon: [
        { speciesId: "abra", gender: "F" },
        { speciesId: "machop", gender: "M" },
        { speciesId: "eevee", gender: "F" },
        { speciesId: "geodude", gender: "M" }
      ],
      leadOrder: [0, 1]
    });

    expect(state.teams.p2.active[0].set.moveIds).toEqual(["struggle"]);
    expect(state.teams.p2.active[0].set.moveKnowledge?.source).toBe("fallback");
  });

  it("requires the player team before starting an opponent setup", () => {
    const setup = new TeamSetupController();

    expect(() => setup.createBattle({ pokemon: [], leadOrder: [] })).toThrow(
      /Save your team/
    );
  });

  it("requires all six preview Pokemon for an official regulation", () => {
    const setup = new TeamSetupController();
    const officialSetup = validPlayerSetup();
    officialSetup.regulationId = "champions-m-b";

    expect(() => setup.setPlayerTeam(officialSetup)).toThrow(/requires a 6-Pokemon preview team/);
  });
});
