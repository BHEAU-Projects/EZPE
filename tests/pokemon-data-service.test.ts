import { describe, expect, it } from "vitest";

import type { PokemonSet } from "../src/domain/battle-state.js";
import { singleTurnBattleState } from "../src/fixtures/single-turn-battle-state.js";
import {
  pokemonDataService,
  validateRegulationSnapshots
} from "../src/data/pokemon-data-service.js";

const neutralPikachu: PokemonSet = {
  speciesId: "pikachu",
  displayName: "Pikachu",
  level: 50,
  itemId: "lightball",
  abilityId: "static",
  moveIds: ["thunderbolt", "protect"],
  statAlignment: "Serious",
  statPoints: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  stats: { hp: 110, atk: 75, def: 60, spa: 70, spd: 70, spe: 110 },
};

describe("PokemonDataService", () => {
  it("normalizes ids and resolves regulation-aware species and moves", () => {
    expect(pokemonDataService.canonicalId("Thunder Bolt")).toBe("thunderbolt");
    expect(pokemonDataService.getSpecies("development", "Pikachu")).toMatchObject({
      id: "pikachu",
      types: ["Electric"],
      nationalDexNumber: 25
    });
    expect(pokemonDataService.getMove("development", "Thunderbolt")).toMatchObject({
      id: "thunderbolt",
      type: "Electric",
      category: "Special",
      basePower: 90
    });
  });

  it("calculates fixed-level Champions stats from Stat Points and alignment", () => {
    expect(pokemonDataService.calculateStats(neutralPikachu, "development")).toEqual(
      neutralPikachu.stats
    );

    expect(pokemonDataService.calculateStats({
      ...neutralPikachu,
      statAlignment: "Modest",
      statPoints: { hp: 0, atk: 0, def: 0, spa: 32, spd: 0, spe: 0 }
    }, "development")).toEqual({
      hp: 110,
      atk: 67,
      def: 60,
      spa: 112,
      spd: 70,
      spe: 110
    });
  });

  it("validates known battle-state data", () => {
    expect(pokemonDataService.validateBattleState(singleTurnBattleState)).toMatchObject({
      valid: true,
      errors: []
    });
  });

  it("reports unknown entities and inconsistent supplied stats", () => {
    const unknown = { ...neutralPikachu, speciesId: "definitelynotapokemon" };
    const inconsistent = structuredClone(neutralPikachu);
    inconsistent.stats.spe = 1;

    expect(
      pokemonDataService.validateTeam([unknown], "development", {
        enforceRosterSize: false
      }).errors
    ).toContain("Pokemon 1 (Pikachu): unknown species 'definitelynotapokemon'.");
    expect(
      pokemonDataService.validateTeam([inconsistent], "development", {
        enforceRosterSize: false,
        runShowdownValidator: false
      }).errors
    ).toContain("Pokemon 1 (Pikachu): spe is 1, expected 110 from the supplied build.");
  });

  it("enforces species and item clauses before simulation", () => {
    const duplicate = structuredClone(neutralPikachu);
    duplicate.displayName = "Second Pikachu";

    const result = pokemonDataService.validateTeam(
      [neutralPikachu, duplicate],
      "champions-m-b",
      { enforceRosterSize: false, runShowdownValidator: false }
    );

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("duplicates species"))).toBe(true);
    expect(result.errors.some((error) => error.includes("item 'lightball' is duplicated"))).toBe(true);
  });
});

describe("regulation snapshot validation", () => {
  it("verifies unique ids, dates, sources, and installed Showdown formats", () => {
    expect(validateRegulationSnapshots()).toMatchObject({
      valid: true,
      checkedRegulationIds: ["development", "champions-m-a", "champions-m-b"]
    });
  });
});
