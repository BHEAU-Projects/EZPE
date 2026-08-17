import { z } from "zod";

import { pokemonDataService } from "../data/pokemon-data-service.js";
import { getRegulationById } from "../data/regulations.js";
import { usageMovesetStore } from "../data/usage-movesets.js";
import {
  defaultStatPoints,
  pokemonGenderSchema,
  pokemonSetSchema,
  statPointTableSchema,
  type BattleState,
  type PokemonSet
} from "../domain/battle-state.js";
import { createBattleStateFromTeams } from "../io/battle-state-file.js";

const readableIdSchema = z.string().trim().min(1).max(80);

export const playerPokemonSetupSchema = z
  .object({
    speciesId: readableIdSchema,
    nickname: z.string().trim().max(30).optional(),
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
    pokemon: z.array(playerPokemonSetupSchema).min(4).max(6),
    battleOrder: z.array(z.number().int().min(0).max(5)).length(4)
  })
  .strict()
  .superRefine((setup, ctx) => {
    if (new Set(setup.battleOrder).size !== setup.battleOrder.length) {
      ctx.addIssue({ code: "custom", message: "Battle positions must be unique.", path: ["battleOrder"] });
    }
    if (setup.battleOrder.some((index) => index >= setup.pokemon.length)) {
      ctx.addIssue({ code: "custom", message: "Battle order references an empty team slot.", path: ["battleOrder"] });
    }
  });

export const opponentPokemonSetupSchema = z
  .object({
    speciesId: readableIdSchema,
    gender: pokemonGenderSchema
  })
  .strict();

export const opponentTeamSetupSchema = z
  .object({
    pokemon: z.array(opponentPokemonSetupSchema).min(4).max(6),
    leadOrder: z.array(z.number().int().min(0).max(5)).length(2)
  })
  .strict()
  .superRefine((setup, ctx) => {
    if (new Set(setup.leadOrder).size !== setup.leadOrder.length) {
      ctx.addIssue({ code: "custom", message: "Opponent leads must be different.", path: ["leadOrder"] });
    }
    if (setup.leadOrder.some((index) => index >= setup.pokemon.length)) {
      ctx.addIssue({ code: "custom", message: "Opponent lead references an empty team slot.", path: ["leadOrder"] });
    }
  });

export type PlayerTeamSetup = z.infer<typeof playerTeamSetupSchema>;
export type OpponentTeamSetup = z.infer<typeof opponentTeamSetupSchema>;

export interface TeamSetupStatus {
  playerConfigured: boolean;
  regulationId: string | null;
  playerPokemon: Array<{ speciesId: string; displayName?: string }>;
}

export class TeamSetupController {
  private playerSetup: PlayerTeamSetup | null = null;
  private playerSets: PokemonSet[] = [];

  getStatus(): TeamSetupStatus {
    return {
      playerConfigured: this.playerSetup !== null,
      regulationId: this.playerSetup?.regulationId ?? null,
      playerPokemon: this.playerSets.map((set) => ({
        speciesId: set.speciesId,
        displayName: set.displayName
      }))
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
    return this.getStatus();
  }

  createBattle(input: unknown): BattleState {
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

    const playerBattleTeam = this.playerSetup.battleOrder.map((index) => this.playerSets[index]);
    const opponentOrder = [
      ...opponentSetup.leadOrder,
      ...opponentSets.map((_, index) => index).filter((index) => !opponentSetup.leadOrder.includes(index))
    ];

    return createBattleStateFromTeams({
      regulationId,
      playerSide: "p1",
      p1Team: playerBattleTeam,
      p2Team: opponentOrder.slice(0, 4).map((index) => opponentSets[index]),
      p1PreviewRoster: this.playerSets,
      p2PreviewRoster: opponentSets
    });
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
    displayName: input.nickname || species.name,
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

  const baseSet = {
    speciesId: species.id,
    displayName: species.name,
    gender,
    level: 50,
    itemId: null,
    abilityId: species.abilityIds[0],
    moveIds,
    statAlignment: "Serious",
    statPoints: defaultStatPoints
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
