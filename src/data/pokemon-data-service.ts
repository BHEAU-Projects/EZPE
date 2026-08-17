import { Generations } from "@pkmn/data";
import { Dex as PkmnDex, toID } from "@pkmn/dex";
import PokemonShowdown from "pokemon-showdown";

import type {
  BattleState,
  PokemonGender,
  PokemonSet,
  StatTable
} from "../domain/battle-state.js";
import { getOverridesForRegulation } from "./champions-overrides.js";
import {
  getRegulationById,
  regulationSnapshots,
  type RegulationSnapshot
} from "./regulations.js";

const { Dex: ShowdownDex, TeamValidator } = PokemonShowdown;

type TeamValidatorInstance = InstanceType<typeof TeamValidator>;
type ValidatorTeam = NonNullable<Parameters<TeamValidatorInstance["validateTeam"]>[0]>;
type StatId = keyof StatTable;

const statIds: StatId[] = ["hp", "atk", "def", "spa", "spd", "spe"];
const generations = new Generations(PkmnDex);
const generationNine = generations.get(9);

export interface SpeciesData {
  id: string;
  name: string;
  types: string[];
  baseStats: StatTable;
  abilityIds: string[];
  nationalDexNumber: number;
  genderOptions: PokemonGender[];
}

export interface SetupCatalogEntry {
  id: string;
  name: string;
}

export interface SetupSpeciesEntry extends SetupCatalogEntry {
  abilityIds: string[];
  genderOptions: PokemonGender[];
}

export interface SetupCatalog {
  species: SetupSpeciesEntry[];
  moves: SetupCatalogEntry[];
  items: SetupCatalogEntry[];
  abilities: SetupCatalogEntry[];
  natures: string[];
}

export interface MoveData {
  id: string;
  name: string;
  type: string;
  category: string;
  basePower: number;
  accuracy: number | true;
  priority: number;
  pp: number;
  target: string;
}

export interface TeamValidationOptions {
  enforceRosterSize?: boolean;
  runShowdownValidator?: boolean;
}

export interface DataValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface RegulationSnapshotValidationResult extends DataValidationResult {
  checkedRegulationIds: string[];
}

export class PokemonDataService {
  canonicalId(value: string): string {
    return toID(value);
  }

  getSpecies(regulationId: string, speciesId: string): SpeciesData | undefined {
    const dex = this.getDex(regulationId);
    const species = dex.species.get(this.canonicalId(speciesId));

    if (!species.exists) return undefined;

    return {
      id: species.id,
      name: species.name,
      types: [...species.types],
      baseStats: { ...species.baseStats },
      abilityIds: Object.values(species.abilities)
        .filter((ability): ability is string => Boolean(ability))
        .map((ability) => this.canonicalId(ability)),
      nationalDexNumber: species.num,
      genderOptions: getGenderOptions(species.gender)
    };
  }

  getSetupCatalog(regulationId: string): SetupCatalog {
    const dex = this.getDex(regulationId);
    return {
      species: dex.species.all()
        .filter((species) =>
          species.exists && species.num > 0 && !species.isMega && !species.battleOnly
        )
        .map((species) => ({
          id: species.id,
          name: species.name,
          abilityIds: Object.values(species.abilities)
            .filter((ability): ability is string => Boolean(ability))
            .map((ability) => this.canonicalId(ability)),
          genderOptions: getGenderOptions(species.gender)
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      moves: dex.moves.all()
        .filter((move) => move.exists && !move.isNonstandard)
        .map((move) => ({ id: move.id, name: move.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      items: dex.items.all()
        .filter((item) => item.exists && !item.isNonstandard)
        .map((item) => ({ id: item.id, name: item.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      abilities: dex.abilities.all()
        .filter((ability) => ability.exists && !ability.isNonstandard)
        .map((ability) => ({ id: ability.id, name: ability.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      natures: dex.natures.all().map((nature) => nature.name).sort()
    };
  }

  getFallbackMoveIds(regulationId: string, speciesId: string): string[] {
    const dex = this.getDex(regulationId);
    const species = dex.species.get(this.canonicalId(speciesId));
    if (!species.exists) return [];

    const types = new Set(species.types);
    const moves = [...dex.species.getMovePool(species.id)]
      .map((moveId) => dex.moves.get(moveId))
      .filter((move) => move.exists && !move.isNonstandard);
    const protect = moves.find((move) => move.id === "protect");
    const damaging = moves
      .filter((move) => move.category !== "Status" && move.basePower > 0)
      .sort((a, b) =>
        Number(types.has(b.type)) - Number(types.has(a.type)) ||
        effectiveMovePower(b) - effectiveMovePower(a) ||
        a.name.localeCompare(b.name)
      );
    const status = moves
      .filter((move) => move.category === "Status" && move.id !== "protect")
      .sort((a, b) => a.name.localeCompare(b.name));

    const selectedMoveIds = [...new Set([
      ...(protect ? [protect.id] : []),
      ...damaging.map((move) => move.id),
      ...status.map((move) => move.id)
    ])].slice(0, 4);

    // Some development-only species have no generation-nine learnset data.
    // Struggle keeps hidden-opponent setup usable without pretending a real set is known.
    return selectedMoveIds.length > 0 ? selectedMoveIds : ["struggle"];
  }

  getMove(regulationId: string, moveId: string): MoveData | undefined {
    const dex = this.getDex(regulationId);
    const move = dex.moves.get(this.canonicalId(moveId));

    if (!move.exists) return undefined;

    return {
      id: move.id,
      name: move.name,
      type: move.type,
      category: move.category,
      basePower: move.basePower,
      accuracy: move.accuracy,
      priority: move.priority,
      pp: move.pp,
      target: move.target
    };
  }

  calculateStats(set: Pick<PokemonSet, "speciesId" | "formId" | "level" | "nature" | "evs" | "ivs">, regulationId: string): StatTable {
    const species = this.getSpecies(regulationId, set.formId ?? set.speciesId);

    if (!species) {
      throw new Error(`Unknown species: ${set.formId ?? set.speciesId}`);
    }

    const nature = set.nature ? generationNine.natures.get(set.nature) : undefined;
    if (set.nature && !nature) {
      throw new Error(`Unknown nature: ${set.nature}`);
    }

    return Object.fromEntries(
      statIds.map((stat) => [
        stat,
        generationNine.stats.calc(
          stat,
          species.baseStats[stat],
          set.ivs?.[stat] ?? 31,
          set.evs?.[stat] ?? 0,
          set.level,
          nature
        )
      ])
    ) as unknown as StatTable;
  }

  validateTeam(
    sets: PokemonSet[],
    regulationId: string,
    options: TeamValidationOptions = {}
  ): DataValidationResult {
    const regulation = this.requireRegulation(regulationId);
    const errors: string[] = [];
    const warnings: string[] = [];
    const enforceRosterSize = options.enforceRosterSize ?? true;

    if (enforceRosterSize) {
      const minimumSize = regulation.isOfficial ? regulation.battleRules.choose : 1;
      if (sets.length < minimumSize || sets.length > regulation.battleRules.bring) {
        errors.push(
          `Team must contain ${minimumSize}-${regulation.battleRules.bring} Pokemon for ${regulation.name}.`
        );
      }
    }

    const seenSpecies = new Map<number | string, string>();
    const seenItems = new Set<string>();
    let hasUnknownData = false;

    sets.forEach((set, index) => {
      const label = `Pokemon ${index + 1} (${set.displayName ?? set.speciesId})`;
      const species = this.getSpecies(regulationId, set.formId ?? set.speciesId);

      if (!species) {
        errors.push(`${label}: unknown species '${set.formId ?? set.speciesId}'.`);
        hasUnknownData = true;
      } else if (regulation.teamRules.speciesClause) {
        const speciesKey = species.nationalDexNumber > 0 ? species.nationalDexNumber : species.id;
        const duplicate = seenSpecies.get(speciesKey);
        if (duplicate) errors.push(`${label}: duplicates species with ${duplicate}.`);
        seenSpecies.set(speciesKey, label);
      }

      if (species && set.gender && !species.genderOptions.includes(set.gender)) {
        errors.push(`${label}: gender '${set.gender}' is not valid for ${species.name}.`);
      }

      if (!this.getAbilityExists(regulationId, set.abilityId)) {
        errors.push(`${label}: unknown ability '${set.abilityId}'.`);
        hasUnknownData = true;
      }

      if (set.itemId) {
        if (!this.getItemExists(regulationId, set.itemId)) {
          errors.push(`${label}: unknown item '${set.itemId}'.`);
          hasUnknownData = true;
        } else if (regulation.teamRules.itemClause) {
          const itemId = this.canonicalId(set.itemId);
          if (seenItems.has(itemId)) errors.push(`${label}: item '${itemId}' is duplicated.`);
          seenItems.add(itemId);
        }
      }

      for (const moveId of set.moveIds) {
        if (!this.getMove(regulationId, moveId)) {
          errors.push(`${label}: unknown move '${moveId}'.`);
          hasUnknownData = true;
        }
      }

      if (set.evs && set.ivs && set.nature && species) {
        const calculatedStats = this.calculateStats(set, regulationId);
        for (const stat of statIds) {
          if (calculatedStats[stat] !== set.stats[stat]) {
            errors.push(
              `${label}: ${stat} is ${set.stats[stat]}, expected ${calculatedStats[stat]} from the supplied build.`
            );
          }
        }
      }
    });

    if ((options.runShowdownValidator ?? true) && !hasUnknownData && sets.length > 0) {
      const validator = new TeamValidator(regulation.showdownFormatId);
      const problems = validator.validateTeam(this.toValidatorTeam(sets));
      if (problems) errors.push(...problems.map((problem) => `Showdown: ${problem}`));
    }

    const overrides = getOverridesForRegulation(regulation.id);
    if (overrides.length > 0) {
      warnings.push(`${overrides.length} local Champions override(s) apply to this regulation.`);
    }

    return { valid: errors.length === 0, errors: [...new Set(errors)], warnings };
  }

  validateBattleState(state: BattleState): DataValidationResult {
    const regulation = getRegulationById(state.regulationId);
    if (!regulation) {
      return {
        valid: false,
        errors: [`Unknown regulation '${state.regulationId}'.`],
        warnings: []
      };
    }

    const teamResults = (["p1", "p2"] as const).map((side) =>
      this.validateTeam(
        [
          ...state.teams[side].active.map((pokemon) => pokemon.set),
          ...state.teams[side].bench.map((pokemon) => pokemon.set)
        ],
        regulation.id,
        { enforceRosterSize: false }
      )
    );

    const errors = teamResults.flatMap((result, index) =>
      result.errors.map((error) => `${index === 0 ? "p1" : "p2"}: ${error}`)
    );
    const warnings = teamResults.flatMap((result, index) =>
      result.warnings.map((warning) => `${index === 0 ? "p1" : "p2"}: ${warning}`)
    );

    return { valid: errors.length === 0, errors, warnings };
  }

  private getDex(regulationId: string) {
    const regulation = this.requireRegulation(regulationId);
    return ShowdownDex.forFormat(regulation.showdownFormatId);
  }

  private requireRegulation(regulationId: string): RegulationSnapshot {
    const regulation = getRegulationById(regulationId);
    if (!regulation) throw new Error(`Unknown regulation id: ${regulationId}`);
    return regulation;
  }

  private getAbilityExists(regulationId: string, abilityId: string): boolean {
    return this.getDex(regulationId).abilities.get(this.canonicalId(abilityId)).exists;
  }

  private getItemExists(regulationId: string, itemId: string): boolean {
    return this.getDex(regulationId).items.get(this.canonicalId(itemId)).exists;
  }

  private toValidatorTeam(sets: PokemonSet[]): ValidatorTeam {
    return sets.map((set) => ({
      name: set.displayName ?? set.speciesId,
      species: set.formId ?? set.speciesId,
      item: set.itemId ?? "",
      ability: set.abilityId,
      moves: [...set.moveIds],
      nature: set.nature ?? "Serious",
      evs: set.evs,
      ivs: set.ivs,
      level: set.level,
      gender: set.gender
    })) as ValidatorTeam;
  }
}

function getGenderOptions(gender: string | undefined): PokemonGender[] {
  if (gender === "M" || gender === "F" || gender === "N") return [gender];
  return ["M", "F"];
}

function effectiveMovePower(move: { basePower: number; accuracy: number | true }): number {
  return move.basePower * (move.accuracy === true ? 1 : move.accuracy / 100);
}

export function validateRegulationSnapshots(
  snapshots: RegulationSnapshot[] = regulationSnapshots
): RegulationSnapshotValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();

  for (const regulation of snapshots) {
    if (ids.has(regulation.id)) errors.push(`Duplicate regulation id '${regulation.id}'.`);
    ids.add(regulation.id);

    if (regulation.startsOn && regulation.endsOn && regulation.startsOn >= regulation.endsOn) {
      errors.push(`${regulation.id}: startsOn must be earlier than endsOn.`);
    }

    const format = ShowdownDex.formats.get(regulation.showdownFormatId);
    if (!format.exists || format.effectType !== "Format") {
      errors.push(`${regulation.id}: unknown Showdown format '${regulation.showdownFormatId}'.`);
    }

    if (regulation.isOfficial && regulation.sources.length === 0) {
      errors.push(`${regulation.id}: official regulations require at least one source.`);
    }

    if (!regulation.isOfficial && regulation.sources.length === 0) {
      warnings.push(`${regulation.id}: development regulation has no external sources.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    checkedRegulationIds: [...ids]
  };
}

export const pokemonDataService = new PokemonDataService();
