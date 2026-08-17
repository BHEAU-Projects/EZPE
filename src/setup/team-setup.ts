import { z } from "zod";

import { pokemonDataService } from "../data/pokemon-data-service.js";
import { getRegulationById } from "../data/regulations.js";
import { usageMovesetStore } from "../data/usage-movesets.js";
import {
  pokemonGenderSchema,
  pokemonSetSchema,
  statPointTableSchema,
  type BattleState,
  type PokemonSet,
  type StatPointTable
} from "../domain/battle-state.js";
import { createBattleStateFromTeams } from "../io/battle-state-file.js";

const readableIdSchema = z.string().trim().min(1).max(80);

export const playerPokemonSetupSchema = z
  .object({
    speciesId: readableIdSchema,
    gender: pokemonGenderSchema,
    abilityId: readableIdSchema,
    itemId: z.string().trim().max(80).nullable().default(null),
    moveIds: z.array(readableIdSchema).min(1).max(4),
    statAlignment: z.string().trim().min(1).max(30),
    statPoints: statPointTableSchema
  })
  .strict()
  .superRefine((pokemon, ctx) => {
    if (new Set(pokemon.moveIds.map((move) => pokemonDataService.canonicalId(move))).size !== pokemon.moveIds.length) {
      ctx.addIssue({
        code: "custom",
        message: "Moves must be unique.",
        path: ["moveIds"]
      });
    }
  });

export const playerTeamSetupSchema = z
  .object({
    regulationId: z.string().trim().min(1),
    pokemon: z.array(playerPokemonSetupSchema).min(4).max(6)
  })
  .strict();

export const opponentPokemonSetupSchema = z
  .object({
    speciesId: readableIdSchema,
    gender: pokemonGenderSchema
  })
  .strict();

export const opponentTeamSetupSchema = z
  .object({
    pokemon: z.array(opponentPokemonSetupSchema).min(4).max(6)
  })
  .strict();

export const playerSelectionSchema = z
  .object({
    battleOrder: z.array(z.number().int().min(0).max(5)).length(4)
  })
  .strict()
  .superRefine((selection, ctx) => {
    if (new Set(selection.battleOrder).size !== selection.battleOrder.length) {
      ctx.addIssue({ code: "custom", message: "Battle positions must be unique.", path: ["battleOrder"] });
    }
  });

export const battleStartSchema = z
  .object({
    opponentLeadOrder: z.array(z.number().int().min(0).max(5)).length(2)
  })
  .strict()
  .superRefine((start, ctx) => {
    if (new Set(start.opponentLeadOrder).size !== start.opponentLeadOrder.length) {
      ctx.addIssue({ code: "custom", message: "Opponent leads must be different.", path: ["opponentLeadOrder"] });
    }
  });

export type PlayerTeamSetup = z.infer<typeof playerTeamSetupSchema>;
export type OpponentTeamSetup = z.infer<typeof opponentTeamSetupSchema>;
export type PlayerSelection = z.infer<typeof playerSelectionSchema>;
export type BattleStart = z.infer<typeof battleStartSchema>;

export interface TeamSetupStatus {
  playerConfigured: boolean;
  opponentConfigured: boolean;
  selectionConfigured: boolean;
  regulationId: string | null;
  playerPokemon: Array<{ speciesId: string; displayName?: string }>;
  opponentPokemon: Array<{ speciesId: string; displayName?: string; gender?: string }>;
  battleOrder: number[] | null;
}

export class TeamSetupController {
  private playerSetup: PlayerTeamSetup | null = null;
  private playerSets: PokemonSet[] = [];
  private opponentSetup: OpponentTeamSetup | null = null;
  private opponentSets: PokemonSet[] = [];
  private battleOrder: number[] | null = null;

  getStatus(): TeamSetupStatus {
    return {
      playerConfigured: this.playerSetup !== null,
      opponentConfigured: this.opponentSetup !== null,
      selectionConfigured: this.battleOrder !== null,
      regulationId: this.playerSetup?.regulationId ?? null,
      playerPokemon: this.playerSets.map((set) => ({
        speciesId: set.speciesId,
        displayName: set.displayName
      })),
      opponentPokemon: this.opponentSets.map((set) => ({
        speciesId: set.speciesId,
        displayName: set.displayName,
        gender: set.gender
      })),
      battleOrder: this.battleOrder ? [...this.battleOrder] : null
    };
  }

  setPlayerTeam(input: unknown): TeamSetupStatus {
    const setup = playerTeamSetupSchema.parse(input);
    const sets = setup.pokemon.map((pokemon) => createPlayerSet(pokemon, setup.regulationId));
    assertOfficialRosterSize(sets, setup.regulationId);
    const validation = pokemonDataService.validateTeam(sets, setup.regulationId, {
      enforceRosterSize: true,
      runShowdownValidator: sets.length === getRegulationById(setup.regulationId)?.battleRules.bring
    });
    if (!validation.valid) throw new Error(validation.errors.join("\n"));

    this.playerSetup = setup;
    this.playerSets = sets;
    this.opponentSetup = null;
    this.opponentSets = [];
    this.battleOrder = null;
    return this.getStatus();
  }

  setOpponentTeam(input: unknown): TeamSetupStatus {
    if (!this.playerSetup) throw new Error("Save your team before entering the opponent team.");
    const opponentSetup = opponentTeamSetupSchema.parse(input);
    const regulationId = this.playerSetup.regulationId;
    const opponentSets = opponentSetup.pokemon.map((pokemon) =>
      createOpponentSet(pokemon.speciesId, pokemon.gender, regulationId)
    );
    assertOfficialRosterSize(opponentSets, regulationId);
    const validation = pokemonDataService.validateTeam(opponentSets, regulationId, {
      enforceRosterSize: true,
      runShowdownValidator: opponentSets.length === getRegulationById(regulationId)?.battleRules.bring
    });
    if (!validation.valid) throw new Error(validation.errors.join("\n"));

    this.opponentSetup = opponentSetup;
    this.opponentSets = opponentSets;
    this.battleOrder = null;
    return this.getStatus();
  }

  setPlayerSelection(input: unknown): TeamSetupStatus {
    if (!this.opponentSetup) throw new Error("Save the opponent roster before choosing your four Pokemon.");
    const selection = playerSelectionSchema.parse(input);
    assertOrderWithinRoster(selection.battleOrder, this.playerSets.length, "Player battle order");
    this.battleOrder = [...selection.battleOrder];
    return this.getStatus();
  }

  createBattle(input: unknown): BattleState {
    if (!this.playerSetup) throw new Error("Save your team before starting a battle.");
    if (!this.opponentSetup) throw new Error("Save the opponent roster before starting a battle.");
    if (!this.battleOrder) throw new Error("Choose your four Pokemon before starting a battle.");
    const start = battleStartSchema.parse(input);
    assertOrderWithinRoster(start.opponentLeadOrder, this.opponentSets.length, "Opponent lead order");
    const regulationId = this.playerSetup.regulationId;

    const playerBattleTeam = this.battleOrder.map((index) => this.playerSets[index]);
    const opponentOrder = [
      ...start.opponentLeadOrder,
      ...this.opponentSets.map((_, index) => index).filter((index) => !start.opponentLeadOrder.includes(index))
    ];

    return createBattleStateFromTeams({
      regulationId,
      playerSide: "p1",
      p1Team: playerBattleTeam,
      p2Team: opponentOrder.slice(0, 4).map((index) => this.opponentSets[index]),
      p1PreviewRoster: this.playerSets,
      p2PreviewRoster: this.opponentSets
    });
  }
}

function assertOrderWithinRoster(order: number[], rosterSize: number, label: string): void {
  if (order.some((index) => index >= rosterSize)) {
    throw new Error(`${label} references an empty roster slot.`);
  }
}

function assertOfficialRosterSize(sets: PokemonSet[], regulationId: string): void {
  const regulation = getRegulationById(regulationId);
  if (regulation?.isOfficial && sets.length !== regulation.battleRules.bring) {
    throw new Error(`${regulation.name} requires a ${regulation.battleRules.bring}-Pokemon preview team.`);
  }
}

function createPlayerSet(
  input: z.infer<typeof playerPokemonSetupSchema>,
  regulationId: string
): PokemonSet {
  const speciesId = pokemonDataService.canonicalId(input.speciesId);
  const species = pokemonDataService.getSpecies(regulationId, speciesId);
  if (!species) throw new Error(`Unknown Pokemon '${input.speciesId}'.`);
  const regulation = getRegulationById(regulationId);
  if (!regulation) throw new Error(`Unknown regulation '${regulationId}'.`);

  const itemId = input.itemId ? pokemonDataService.canonicalId(input.itemId) : null;
  const baseSet = {
    speciesId: species.id,
    displayName: species.name,
    gender: input.gender,
    level: regulation.battleRules.level,
    itemId,
    abilityId: pokemonDataService.canonicalId(input.abilityId),
    moveIds: input.moveIds.map((move) => pokemonDataService.canonicalId(move)),
    statAlignment: input.statAlignment,
    statPoints: input.statPoints
  };

  return pokemonSetSchema.parse({
    ...baseSet,
    stats: pokemonDataService.calculateStats(baseSet, regulationId)
  });
}

function createOpponentSet(
  inputSpeciesId: string,
  gender: z.infer<typeof pokemonGenderSchema>,
  regulationId: string
): PokemonSet {
  const speciesId = pokemonDataService.canonicalId(inputSpeciesId);
  const species = pokemonDataService.getSpecies(regulationId, speciesId);
  if (!species) throw new Error(`Unknown opponent Pokemon '${inputSpeciesId}'.`);

  const popular = usageMovesetStore.getPopularMoveIds(regulationId, species.id);
  const moveIds = popular?.moveIds ?? pokemonDataService.getFallbackMoveIds(regulationId, species.id);
  if (moveIds.length === 0) throw new Error(`No default moves are available for ${species.name}.`);
  const regulation = getRegulationById(regulationId);
  if (!regulation) throw new Error(`Unknown regulation '${regulationId}'.`);
  const statAssumption = inferOpponentStatAssumption(moveIds, regulationId);

  const baseSet = {
    speciesId: species.id,
    displayName: species.name,
    gender,
    level: regulation.battleRules.level,
    itemId: null,
    abilityId: species.abilityIds[0],
    moveIds,
    statAlignment: statAssumption.statAlignment,
    statPoints: statAssumption.statPoints
  };

  return pokemonSetSchema.parse({
    ...baseSet,
    stats: pokemonDataService.calculateStats(baseSet, regulationId),
    moveKnowledge: popular
      ? {
          source: "usage-default",
          observedMoveIds: [],
          assumedMoveIds: moveIds,
          usageSnapshotId: popular.snapshotId
        }
      : {
          source: "fallback",
          observedMoveIds: [],
          assumedMoveIds: moveIds
        }
  });
}

function inferOpponentStatAssumption(
  moveIds: string[],
  regulationId: string
): { statAlignment: string; statPoints: StatPointTable } {
  // Hidden spreads need one legal simulation proxy until usage-spread data is available.
  // Bias offense toward the assumed moves while keeping the full 66-point budget.
  const power = moveIds.reduce(
    (scores, moveId) => {
      const move = pokemonDataService.getMove(regulationId, moveId);
      if (!move || move.basePower === 0) return scores;
      const expectedPower = move.basePower * (move.accuracy === true ? 1 : move.accuracy / 100);
      if (move.category === "Physical") scores.physical += expectedPower;
      if (move.category === "Special") scores.special += expectedPower;
      return scores;
    },
    { physical: 0, special: 0 }
  );

  if (power.physical > power.special) {
    return {
      statAlignment: "Adamant",
      statPoints: statPointTableSchema.parse({ hp: 32, atk: 32, def: 0, spa: 0, spd: 0, spe: 2 })
    };
  }
  if (power.special > power.physical) {
    return {
      statAlignment: "Modest",
      statPoints: statPointTableSchema.parse({ hp: 32, atk: 0, def: 0, spa: 32, spd: 0, spe: 2 })
    };
  }
  if (power.physical > 0) {
    return {
      statAlignment: "Bashful",
      statPoints: statPointTableSchema.parse({ hp: 2, atk: 32, def: 0, spa: 32, spd: 0, spe: 0 })
    };
  }
  return {
    statAlignment: "Bashful",
    statPoints: statPointTableSchema.parse({ hp: 32, atk: 0, def: 17, spa: 0, spd: 17, spe: 0 })
  };
}
