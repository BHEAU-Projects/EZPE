import { describe, expect, it } from "vitest";

import type { PokemonSet } from "../src/domain/battle-state.js";
import { singleTurnBattleState } from "../src/fixtures/single-turn-battle-state.js";
import {
  playerPokemonSetupSchema,
  playerSelectionSchema,
  playerTeamSetupSchema,
  TeamSetupController,
  type PlayerTeamSetup
} from "../src/setup/team-setup.js";

function playerPokemon(set: PokemonSet) {
  return {
    speciesId: set.speciesId,
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
    ].map((pokemon) => playerPokemon(pokemon.set))
  };
}

describe("team setup", () => {
  it("validates Stat Point totals and selection positions separately", () => {
    const tooManyStatPoints = validPlayerSetup();
    tooManyStatPoints.pokemon[0].statPoints = { hp: 32, atk: 32, def: 3, spa: 0, spd: 0, spe: 0 };

    expect(playerTeamSetupSchema.safeParse(tooManyStatPoints).success).toBe(false);
    expect(playerSelectionSchema.safeParse({ battleOrder: [0, 0, 1, 2] }).success).toBe(false);
  });

  it("does not accept or require player nicknames", () => {
    expect(playerPokemonSetupSchema.safeParse({
      ...validPlayerSetup().pokemon[0],
      nickname: "Not battle data"
    }).success).toBe(false);
  });

  it("stores rosters before selection and infers hidden opponent information", () => {
    const setup = new TeamSetupController();
    const playerSetup = validPlayerSetup();
    playerSetup.pokemon.push(
      structuredClone(playerSetup.pokemon[0]),
      structuredClone(playerSetup.pokemon[1])
    );
    expect(setup.setPlayerTeam(playerSetup)).toMatchObject({
      playerConfigured: true,
      opponentConfigured: false,
      selectionConfigured: false
    });

    expect(setup.setOpponentTeam({
      pokemon: [
        { speciesId: "squirtle", gender: "M" },
        { speciesId: "charmander", gender: "F" },
        { speciesId: "bulbasaur", gender: "M" },
        { speciesId: "pikachu", gender: "F" },
        { speciesId: "squirtle", gender: "F" },
        { speciesId: "charmander", gender: "M" }
      ]
    })).toMatchObject({ opponentConfigured: true, selectionConfigured: false });
    expect(setup.setPlayerSelection({ battleOrder: [0, 1, 2, 3] })).toMatchObject({
      selectionConfigured: true,
      battleOrder: [0, 1, 2, 3]
    });

    const state = setup.createBattle({ opponentLeadOrder: [1, 3] });

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
      statAlignment: expect.any(String),
      statPoints: expect.any(Object),
      moveKnowledge: {
        source: "fallback",
        observedMoveIds: [],
        assumedMoveIds: expect.any(Array)
      }
    });
    expect(Object.values(state.teams.p2.active[0].set.statPoints).reduce((sum, value) => sum + value, 0)).toBe(66);
    expect(state.teams.p2.active[0].set.moveIds.length).toBeGreaterThan(0);
    expect(state.teams.p1.previewRoster).toHaveLength(6);
    expect(state.teams.p2.previewRoster).toHaveLength(6);
    expect(state.teams.p2.previewRoster?.every((set) =>
      Object.values(set.statPoints).reduce((sum, value) => sum + value, 0) === 66
    )).toBe(true);
  });

  it("keeps development setup usable when Showdown has no current learnset", () => {
    const setup = new TeamSetupController();
    setup.setPlayerTeam(validPlayerSetup());

    setup.setOpponentTeam({
      pokemon: [
        { speciesId: "abra", gender: "F" },
        { speciesId: "machop", gender: "M" },
        { speciesId: "eevee", gender: "F" },
        { speciesId: "geodude", gender: "M" }
      ]
    });
    setup.setPlayerSelection({ battleOrder: [0, 1, 2, 3] });
    const state = setup.createBattle({ opponentLeadOrder: [0, 1] });

    expect(state.teams.p2.active[0].set.moveIds).toEqual(["struggle"]);
    expect(state.teams.p2.active[0].set.moveKnowledge?.source).toBe("fallback");
  });

  it("enforces the setup sequence", () => {
    const setup = new TeamSetupController();

    expect(() => setup.setOpponentTeam({ pokemon: [] })).toThrow(
      /Save your team/
    );
    setup.setPlayerTeam(validPlayerSetup());
    expect(() => setup.setPlayerSelection({ battleOrder: [0, 1, 2, 3] })).toThrow(
      /opponent roster/
    );
  });

  it("requires all six preview Pokemon for an official regulation", () => {
    const setup = new TeamSetupController();
    const officialSetup = validPlayerSetup();
    officialSetup.regulationId = "champions-m-b";

    expect(() => setup.setPlayerTeam(officialSetup)).toThrow(/requires a 6-Pokemon preview team/);
  });
});
