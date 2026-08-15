import { z } from "zod";

const canonicalIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+$/, "Use lowercase canonical ids like incineroar or fakeout.");

const displayNameSchema = z.string().min(1).optional();

const boundedTurnCountSchema = z.number().int().min(0).max(8);

const defaultStatBoosts = {
  atk: 0,
  def: 0,
  spa: 0,
  spd: 0,
  spe: 0,
  accuracy: 0,
  evasion: 0
};

const defaultSideConditions = {
  tailwindTurns: 0,
  reflectTurns: 0,
  lightScreenTurns: 0,
  auroraVeilTurns: 0,
  safeguardTurns: 0,
  stealthRock: false,
  stickyWeb: false,
  spikesLayers: 0,
  toxicSpikesLayers: 0
};

export const exactHpSchema = z
  .object({
    unit: z.literal("exact"),
    current: z.number().int().min(0).max(999),
    max: z.number().int().min(1).max(999)
  })
  .strict()
  .refine((hp) => hp.current <= hp.max, {
    message: "Exact current HP cannot be greater than max HP.",
    path: ["current"]
  });

export const percentageHpSchema = z
  .object({
    unit: z.literal("percent"),
    percent: z.number().min(0).max(100)
  })
  .strict();

export const hpMeasurementSchema = z.discriminatedUnion("unit", [
  exactHpSchema,
  percentageHpSchema
]);

export const battleFormatSchema = z.enum(["champions-vgc-doubles"]);

export const playerSideSchema = z.enum(["p1", "p2"]);

export const activeSlotSchema = z.enum(["p1a", "p1b", "p2a", "p2b"]);

export const targetSlotSchema = z.enum([
  "p1a",
  "p1b",
  "p2a",
  "p2b",
  "field",
  "self",
  "allySide",
  "opponentSide"
]);

export const statusConditionSchema = z.enum([
  "healthy",
  "brn",
  "frz",
  "par",
  "psn",
  "slp",
  "tox"
]);

export const statTableSchema = z
  .object({
    hp: z.number().int().min(1).max(999),
    atk: z.number().int().min(1).max(999),
    def: z.number().int().min(1).max(999),
    spa: z.number().int().min(1).max(999),
    spd: z.number().int().min(1).max(999),
    spe: z.number().int().min(1).max(999)
  })
  .strict();

export const evTableSchema = z
  .object({
    hp: z.number().int().min(0).max(252),
    atk: z.number().int().min(0).max(252),
    def: z.number().int().min(0).max(252),
    spa: z.number().int().min(0).max(252),
    spd: z.number().int().min(0).max(252),
    spe: z.number().int().min(0).max(252)
  })
  .strict();

export const ivTableSchema = z
  .object({
    hp: z.number().int().min(0).max(31),
    atk: z.number().int().min(0).max(31),
    def: z.number().int().min(0).max(31),
    spa: z.number().int().min(0).max(31),
    spd: z.number().int().min(0).max(31),
    spe: z.number().int().min(0).max(31)
  })
  .strict();

export const statBoostsSchema = z
  .object({
    atk: z.number().int().min(-6).max(6).default(0),
    def: z.number().int().min(-6).max(6).default(0),
    spa: z.number().int().min(-6).max(6).default(0),
    spd: z.number().int().min(-6).max(6).default(0),
    spe: z.number().int().min(-6).max(6).default(0),
    accuracy: z.number().int().min(-6).max(6).default(0),
    evasion: z.number().int().min(-6).max(6).default(0)
  })
  .strict();

export const specialMechanicSchema = z
  .object({
    kind: canonicalIdSchema,
    used: z.boolean().optional(),
    metadata: z.record(z.string(), z.unknown()).optional()
  })
  .strict();

export const pokemonSetSchema = z
  .object({
    speciesId: canonicalIdSchema,
    displayName: displayNameSchema,
    formId: canonicalIdSchema.optional(),
    level: z.number().int().min(1).max(100).default(50),
    itemId: canonicalIdSchema.nullable().default(null),
    abilityId: canonicalIdSchema,
    moveIds: z.array(canonicalIdSchema).min(1).max(4),
    nature: z.string().min(1).optional(),
    stats: statTableSchema,
    evs: evTableSchema.optional(),
    ivs: ivTableSchema.optional(),
    specialMechanic: specialMechanicSchema.optional()
  })
  .strict();

const pokemonRuntimeStateFields = {
  currentItemId: canonicalIdSchema.nullable().optional(),
  currentAbilityId: canonicalIdSchema.optional(),
  movePp: z.record(canonicalIdSchema, z.number().int().min(0).max(64)).optional()
};

export const activePokemonSchema = z
  .object({
    slot: activeSlotSchema,
    set: pokemonSetSchema,
    hp: hpMeasurementSchema,
    status: statusConditionSchema.default("healthy"),
    boosts: statBoostsSchema.default(defaultStatBoosts),
    volatileEffectIds: z.array(canonicalIdSchema).default([]),
    protectedThisTurn: z.boolean().default(false),
    ...pokemonRuntimeStateFields
  })
  .strict();

export const benchPokemonSchema = z
  .object({
    benchSlot: z.number().int().min(0).max(5),
    set: pokemonSetSchema,
    hp: hpMeasurementSchema,
    status: statusConditionSchema.default("healthy"),
    fainted: z.boolean().default(false),
    ...pokemonRuntimeStateFields
  })
  .strict();

export const sideConditionsSchema = z
  .object({
    tailwindTurns: boundedTurnCountSchema.default(0),
    reflectTurns: boundedTurnCountSchema.default(0),
    lightScreenTurns: boundedTurnCountSchema.default(0),
    auroraVeilTurns: boundedTurnCountSchema.default(0),
    safeguardTurns: boundedTurnCountSchema.default(0),
    stealthRock: z.boolean().default(false),
    stickyWeb: z.boolean().default(false),
    spikesLayers: z.number().int().min(0).max(3).default(0),
    toxicSpikesLayers: z.number().int().min(0).max(2).default(0)
  })
  .strict();

export const teamStateSchema = z
  .object({
    side: playerSideSchema,
    active: z.array(activePokemonSchema).min(1).max(2),
    bench: z.array(benchPokemonSchema).max(4).default([]),
    sideConditions: sideConditionsSchema.default(defaultSideConditions)
  })
  .strict()
  .superRefine((team, ctx) => {
    for (const pokemon of team.active) {
      if (!pokemon.slot.startsWith(team.side)) {
        ctx.addIssue({
          code: "custom",
          message: "Active Pokemon slot must belong to the team's side.",
          path: ["active"]
        });
      }
    }
  });

export const fieldStateSchema = z
  .object({
    weather: z.enum(["rain", "sun", "sandstorm", "snow", "harshsunshine", "heavyrain", "strongwinds"]).nullable().default(null),
    weatherTurnsRemaining: boundedTurnCountSchema.default(0),
    terrain: z.enum(["electric", "grassy", "misty", "psychic"]).nullable().default(null),
    terrainTurnsRemaining: boundedTurnCountSchema.default(0),
    trickRoomTurnsRemaining: boundedTurnCountSchema.default(0),
    magicRoomTurnsRemaining: boundedTurnCountSchema.default(0),
    wonderRoomTurnsRemaining: boundedTurnCountSchema.default(0),
    gravityTurnsRemaining: boundedTurnCountSchema.default(0)
  })
  .strict();

export const moveLegalActionSchema = z
  .object({
    type: z.literal("move"),
    activeSlot: activeSlotSchema,
    moveId: canonicalIdSchema,
    targetSlot: targetSlotSchema,
    specialMechanic: specialMechanicSchema.optional(),
    flags: z.record(z.string(), z.boolean()).default({})
  })
  .strict();

export const switchLegalActionSchema = z
  .object({
    type: z.literal("switch"),
    activeSlot: activeSlotSchema,
    benchSlot: z.number().int().min(0).max(5),
    speciesId: canonicalIdSchema,
    specialMechanic: specialMechanicSchema.optional()
  })
  .strict();

export const legalActionSchema = z.discriminatedUnion("type", [
  moveLegalActionSchema,
  switchLegalActionSchema
]);

export const battleStateSchema = z
  .object({
    format: battleFormatSchema,
    regulationId: z.string().min(1),
    turnNumber: z.number().int().min(1),
    playerSide: playerSideSchema,
    teams: z
      .object({
        p1: teamStateSchema,
        p2: teamStateSchema
      })
      .strict(),
    field: fieldStateSchema,
    legalActions: z.array(legalActionSchema).min(1)
  })
  .strict()
  .superRefine((battleState, ctx) => {
    if (battleState.teams.p1.side !== "p1") {
      ctx.addIssue({
        code: "custom",
        message: "teams.p1.side must be p1.",
        path: ["teams", "p1", "side"]
      });
    }

    if (battleState.teams.p2.side !== "p2") {
      ctx.addIssue({
        code: "custom",
        message: "teams.p2.side must be p2.",
        path: ["teams", "p2", "side"]
      });
    }

    for (const action of battleState.legalActions) {
      if (!action.activeSlot.startsWith(battleState.playerSide)) {
        ctx.addIssue({
          code: "custom",
          message: "Legal actions must belong to the player side being analyzed.",
          path: ["legalActions"]
        });
      }
    }

    const opponentSide = battleState.playerSide === "p1" ? "p2" : "p1";

    for (const collection of ["active", "bench"] as const) {
      battleState.teams[battleState.playerSide][collection].forEach((pokemon, index) => {
        if (pokemon.hp.unit !== "exact") {
          ctx.addIssue({
            code: "custom",
            message: "The player's Pokemon must use exact HP.",
            path: ["teams", battleState.playerSide, collection, index, "hp"]
          });
        }
      });

      battleState.teams[opponentSide][collection].forEach((pokemon, index) => {
        if (pokemon.hp.unit !== "percent") {
          ctx.addIssue({
            code: "custom",
            message: "Opponent Pokemon must use percentage HP.",
            path: ["teams", opponentSide, collection, index, "hp"]
          });
        }
      });
    }
  });

export type BattleFormat = z.infer<typeof battleFormatSchema>;
export type PlayerSide = z.infer<typeof playerSideSchema>;
export type StatTable = z.infer<typeof statTableSchema>;
export type StatBoosts = z.infer<typeof statBoostsSchema>;
export type ExactHp = z.infer<typeof exactHpSchema>;
export type PercentageHp = z.infer<typeof percentageHpSchema>;
export type HpMeasurement = z.infer<typeof hpMeasurementSchema>;
export type PokemonSet = z.infer<typeof pokemonSetSchema>;
export type ActivePokemon = z.infer<typeof activePokemonSchema>;
export type BenchPokemon = z.infer<typeof benchPokemonSchema>;
export type SideConditions = z.infer<typeof sideConditionsSchema>;
export type TeamState = z.infer<typeof teamStateSchema>;
export type FieldState = z.infer<typeof fieldStateSchema>;
export type LegalAction = z.infer<typeof legalActionSchema>;
export type BattleState = z.infer<typeof battleStateSchema>;
