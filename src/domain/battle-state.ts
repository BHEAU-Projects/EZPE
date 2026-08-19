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

export const battleContextSchema = z.enum(["ranked-closed", "vgc-open-sheet"]);

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

export const pokemonGenderSchema = z.enum(["M", "F", "N"]);

export const lastMoveResultSchema = z.enum([
  "hit",
  "missed",
  "failed",
  "blocked",
  "critical-hit"
]);

export const volatileEffectSchema = z
  .object({
    id: canonicalIdSchema,
    turnsRemaining: z.number().int().min(0).max(16).optional(),
    sourceSlot: activeSlotSchema.optional(),
    associatedMoveId: canonicalIdSchema.optional()
  })
  .strict();

export const statIds = ["hp", "atk", "def", "spa", "spd", "spe"] as const;
export const maxStatPointsPerStat = 32;
export const maxTotalStatPoints = 66;

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

export const statPointTableSchema = z
  .object({
    hp: z.number().int().min(0).max(maxStatPointsPerStat),
    atk: z.number().int().min(0).max(maxStatPointsPerStat),
    def: z.number().int().min(0).max(maxStatPointsPerStat),
    spa: z.number().int().min(0).max(maxStatPointsPerStat),
    spd: z.number().int().min(0).max(maxStatPointsPerStat),
    spe: z.number().int().min(0).max(maxStatPointsPerStat)
  })
  .strict()
  .superRefine((points, ctx) => {
    const total = Object.values(points).reduce((sum, value) => sum + value, 0);
    if (total > maxTotalStatPoints) {
      ctx.addIssue({
        code: "custom",
        message: `A Pokemon cannot have more than ${maxTotalStatPoints} total Stat Points.`
      });
    }
  });

export const defaultStatPoints = {
  hp: 0,
  atk: 0,
  def: 0,
  spa: 0,
  spd: 0,
  spe: 0
} as const;

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

export const moveKnowledgeSchema = z
  .object({
    source: z.enum(["known", "usage-default", "fallback"]),
    observedMoveIds: z.array(canonicalIdSchema).max(4).default([]),
    assumedMoveIds: z.array(canonicalIdSchema).max(4).default([]),
    usageSnapshotId: z.string().min(1).optional()
  })
  .strict()
  .superRefine((knowledge, ctx) => {
    const observed = new Set(knowledge.observedMoveIds);
    const assumed = new Set(knowledge.assumedMoveIds);
    if (observed.size !== knowledge.observedMoveIds.length) {
      ctx.addIssue({ code: "custom", message: "Observed moves must be unique.", path: ["observedMoveIds"] });
    }
    if (assumed.size !== knowledge.assumedMoveIds.length) {
      ctx.addIssue({ code: "custom", message: "Assumed moves must be unique.", path: ["assumedMoveIds"] });
    }
    if (knowledge.observedMoveIds.some((moveId) => assumed.has(moveId))) {
      ctx.addIssue({
        code: "custom",
        message: "A move cannot be both observed and assumed.",
        path: ["assumedMoveIds"]
      });
    }
  });

export const pokemonSetSchema = z
  .object({
    speciesId: canonicalIdSchema,
    displayName: displayNameSchema,
    formId: canonicalIdSchema.optional(),
    gender: pokemonGenderSchema.optional(),
    level: z.number().int().min(1).max(100).default(50),
    itemId: canonicalIdSchema.nullable().default(null),
    abilityId: canonicalIdSchema,
    moveIds: z.array(canonicalIdSchema).min(1).max(4),
    statAlignment: z.string().min(1).default("Serious"),
    stats: statTableSchema,
    statPoints: statPointTableSchema.default(defaultStatPoints),
    specialMechanic: specialMechanicSchema.optional(),
    moveKnowledge: moveKnowledgeSchema.optional()
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
    volatileEffects: z.array(volatileEffectSchema).default([]),
    turnsActive: z.number().int().min(0).max(999).default(0),
    lastMoveId: canonicalIdSchema.nullable().default(null),
    lastMoveTurn: z.number().int().min(1).nullable().default(null),
    lastMoveResult: lastMoveResultSchema.nullable().default(null),
    protectedThisTurn: z.boolean().default(false),
    protectStreak: z.number().int().min(0).max(6).default(0),
    ...pokemonRuntimeStateFields
  })
  .strict()
  .superRefine((pokemon, ctx) => {
    const ids = pokemon.volatileEffects.map((effect) => effect.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: "custom",
        message: "Structured volatile effects must have unique ids.",
        path: ["volatileEffects"]
      });
    }
    if ((pokemon.lastMoveId === null) !== (pokemon.lastMoveTurn === null)) {
      ctx.addIssue({
        code: "custom",
        message: "Last move id and turn must either both be present or both be null.",
        path: ["lastMoveId"]
      });
    }
  });

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
    previewRoster: z.array(pokemonSetSchema).min(2).max(6).optional(),
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
    battleContext: battleContextSchema.default("ranked-closed"),
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
    legalActions: z.array(legalActionSchema).default([])
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
export type BattleContext = z.infer<typeof battleContextSchema>;
export type PlayerSide = z.infer<typeof playerSideSchema>;
export type TargetSlot = z.infer<typeof targetSlotSchema>;
export type StatusCondition = z.infer<typeof statusConditionSchema>;
export type PokemonGender = z.infer<typeof pokemonGenderSchema>;
export type LastMoveResult = z.infer<typeof lastMoveResultSchema>;
export type VolatileEffect = z.infer<typeof volatileEffectSchema>;
export type StatTable = z.infer<typeof statTableSchema>;
export type StatPointTable = z.infer<typeof statPointTableSchema>;
export type StatBoosts = z.infer<typeof statBoostsSchema>;
export type ExactHp = z.infer<typeof exactHpSchema>;
export type PercentageHp = z.infer<typeof percentageHpSchema>;
export type HpMeasurement = z.infer<typeof hpMeasurementSchema>;
export type PokemonSet = z.infer<typeof pokemonSetSchema>;
export type MoveKnowledge = z.infer<typeof moveKnowledgeSchema>;
export type ActivePokemon = z.infer<typeof activePokemonSchema>;
export type BenchPokemon = z.infer<typeof benchPokemonSchema>;
export type SideConditions = z.infer<typeof sideConditionsSchema>;
export type TeamState = z.infer<typeof teamStateSchema>;
export type FieldState = z.infer<typeof fieldStateSchema>;
export type LegalAction = z.infer<typeof legalActionSchema>;
export type BattleState = z.infer<typeof battleStateSchema>;

export function mergeVolatileEffects(
  pokemon: Pick<ActivePokemon, "volatileEffectIds" | "volatileEffects">
): VolatileEffect[] {
  const merged = new Map(pokemon.volatileEffects.map((effect) => [effect.id, effect]));
  for (const id of pokemon.volatileEffectIds) {
    if (!merged.has(id)) merged.set(id, { id });
  }
  return [...merged.values()];
}

export const fixedChampionsIvs: StatTable = {
  hp: 31,
  atk: 31,
  def: 31,
  spa: 31,
  spd: 31,
  spe: 31
};

// Standard stat libraries still accept legacy EV values. Champions gives the
// first Stat Point at 4 EVs and each additional point for another 8 EVs.
export function statPointsToLegacyEvs(points: StatPointTable): StatTable {
  return Object.fromEntries(
    statIds.map((stat) => [stat, points[stat] === 0 ? 0 : points[stat] * 8 - 4])
  ) as StatTable;
}

// Team exports from standard formats can be imported without exposing EVs in
// the domain model. The Stat Point schema enforces Champions' 32/66 limits.
export function legacyEvsToStatPoints(evs: Partial<Record<(typeof statIds)[number], number>>): StatPointTable {
  return statPointTableSchema.parse(Object.fromEntries(
    statIds.map((stat) => {
      const ev = Math.max(0, Math.min(252, evs[stat] ?? 0));
      return [stat, ev < 4 ? 0 : Math.floor((ev + 4) / 8)];
    })
  ));
}
