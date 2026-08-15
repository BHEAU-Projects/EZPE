import { readFileSync } from "node:fs";

import PokemonShowdown from "pokemon-showdown";

import {
  pokemonSetSchema,
  type PokemonSet,
  type StatTable
} from "../domain/battle-state.js";
import { pokemonDataService } from "../data/pokemon-data-service.js";

const { Teams } = PokemonShowdown;

const emptyEvs: StatTable = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const perfectIvs: StatTable = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

export function importTeamFile(path: string, regulationId: string): PokemonSet[] {
  return importTeam(readFileSync(path, "utf8"), regulationId);
}

export function importTeam(input: string, regulationId: string): PokemonSet[] {
  const jsonTeam = parseJsonTeam(input);
  if (jsonTeam) return validateImportedTeam(jsonTeam, regulationId);

  const showdownTeam = Teams.import(input);
  if (!showdownTeam || showdownTeam.length === 0) {
    throw new Error("Could not parse team as domain JSON or Pokemon Showdown export format.");
  }

  const converted = showdownTeam.map((rawSet) => {
    const speciesId = pokemonDataService.canonicalId(rawSet.species);
    const species = pokemonDataService.getSpecies(regulationId, speciesId);
    if (!species) throw new Error(`Unknown species '${rawSet.species}'.`);

    const level = rawSet.level ?? 50;
    const nature = rawSet.nature || "Serious";
    const evs = { ...emptyEvs, ...rawSet.evs };
    const ivs = { ...perfectIvs, ...rawSet.ivs };
    const abilityId = pokemonDataService.canonicalId(
      rawSet.ability || species.abilityIds[0] || ""
    );
    const moveIds = rawSet.moves.map((move) => pokemonDataService.canonicalId(move));
    const stats = pokemonDataService.calculateStats(
      { speciesId, level, nature, evs, ivs },
      regulationId
    );

    return pokemonSetSchema.parse({
      speciesId,
      displayName: rawSet.name || species.name,
      level,
      itemId: rawSet.item ? pokemonDataService.canonicalId(rawSet.item) : null,
      abilityId,
      moveIds,
      nature,
      stats,
      evs,
      ivs
    });
  });

  return validateImportedTeam(converted, regulationId);
}

function parseJsonTeam(input: string): PokemonSet[] | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return undefined;
  }

  if (!Array.isArray(parsed)) return undefined;
  return parsed.map((set, index) => {
    const result = pokemonSetSchema.safeParse(set);
    if (!result.success) {
      throw new Error(`Invalid Pokemon ${index + 1} in JSON team.`);
    }
    return result.data;
  });
}

function validateImportedTeam(sets: PokemonSet[], regulationId: string): PokemonSet[] {
  const result = pokemonDataService.validateTeam(sets, regulationId, {
    enforceRosterSize: false
  });
  if (!result.valid) throw new Error(result.errors.join("\n"));
  return sets;
}
