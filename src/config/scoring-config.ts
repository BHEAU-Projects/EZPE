import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { z } from "zod";

export const scoringConfigSchema = z
  .object({
    version: z.literal(1),
    weights: z
      .object({
        damageDealt: z.number().min(0),
        damageTakenPenalty: z.number().min(0),
        koDealt: z.number().min(0),
        koTakenPenalty: z.number().min(0),
        majorStatusInflicted: z.number().min(0).default(30),
        majorStatusTakenPenalty: z.number().min(0).default(35),
        actionDenied: z.number().min(0).default(45),
        actionLostPenalty: z.number().min(0).default(50),
        statStageAdvantage: z.number().min(0).default(8),
        speedControl: z.number().min(0).default(12),
        fieldControl: z.number().min(0).default(10),
        sideConditionAdvantage: z.number().min(0).default(15),
        forcedSwitch: z.number().min(0).default(20),
        normalizedDamageDealt: z.number().min(0).default(1),
        normalizedDamageTakenPenalty: z.number().min(0).default(1),
        healingReceived: z.number().min(0).default(0.8),
        healingAllowedPenalty: z.number().min(0).default(0.8),
        usefulBoost: z.number().min(0).default(8),
        speedOrderSwing: z.number().min(0).default(20),
        fieldTurnAdvantage: z.number().min(0).default(10),
        actionRestriction: z.number().min(0).default(25),
        itemRemoval: z.number().min(0).default(20),
        residualPressure: z.number().min(0).default(8),
        wastedActionPenalty: z.number().min(0).default(25),
        informationUncertaintyPenalty: z.number().min(0).default(5),
        allySynergy: z.number().min(0).default(15)
      })
      .strict(),
    thresholds: z
      .object({
        heavyDamage: z.number().min(0)
      })
      .strict(),
    opponentAggregation: z
      .object({
        expectedWeight: z.number().min(0).max(1),
        worstCaseWeight: z.number().min(0).max(1)
      })
      .strict()
      .refine(
        (weights) => Math.abs(weights.expectedWeight + weights.worstCaseWeight - 1) < 1e-9,
        { message: "Opponent aggregation weights must add up to 1." }
      ),
    confidenceScoreGap: z.number().positive()
  })
  .strict();

export type ScoringConfig = z.infer<typeof scoringConfigSchema>;

export const defaultScoringConfigPath = resolve(process.cwd(), "config", "scoring.json");

export function parseScoringConfig(value: unknown): ScoringConfig {
  return scoringConfigSchema.parse(value);
}

export function loadScoringConfig(path = defaultScoringConfigPath): ScoringConfig {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Could not read scoring config at ${path}: ${formatError(error)}`);
  }

  const result = scoringConfigSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new Error(`Invalid scoring config at ${path}: ${z.prettifyError(result.error)}`);
  }

  return result.data;
}

export class ScoringConfigStore {
  private cachedConfig: ScoringConfig | undefined;
  private cachedModifiedAt = -1;

  constructor(readonly path = defaultScoringConfigPath) {}

  get(): ScoringConfig {
    const modifiedAt = statSync(this.path).mtimeMs;

    if (!this.cachedConfig || modifiedAt !== this.cachedModifiedAt) {
      this.cachedConfig = loadScoringConfig(this.path);
      this.cachedModifiedAt = modifiedAt;
    }

    return this.cachedConfig;
  }

  invalidate(): void {
    this.cachedConfig = undefined;
    this.cachedModifiedAt = -1;
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const scoringConfigStore = new ScoringConfigStore();
