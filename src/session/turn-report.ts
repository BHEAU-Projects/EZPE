import { z } from "zod";

import {
  activeSlotSchema,
  battleStateSchema,
  specialMechanicSchema,
  statBoostsSchema,
  statusConditionSchema,
  targetSlotSchema,
  type ActivePokemon,
  type BattleState,
  type LastMoveResult,
  type PlayerSide
} from "../domain/battle-state.js";
import { pokemonDataService } from "../data/pokemon-data-service.js";
import type { BattleEvent } from "./battle-events.js";
import { applyBattleEvent } from "./state-reducer.js";
import { applyAutomaticTurnEffects } from "./turn-effects.js";

const canonicalIdSchema = z.string().min(1).regex(/^[a-z0-9]+$/);

export const observedMoveActionSchema = z
  .object({
    type: z.literal("move"),
    activeSlot: activeSlotSchema,
    moveId: canonicalIdSchema,
    targetSlot: targetSlotSchema,
    specialMechanic: specialMechanicSchema.optional()
  })
  .strict();

export const observedSwitchActionSchema = z
  .object({
    type: z.literal("switch"),
    activeSlot: activeSlotSchema,
    benchSlot: z.number().int().min(0).max(5)
  })
  .strict();

export const observedNoActionSchema = z
  .object({
    type: z.literal("no-action"),
    activeSlot: activeSlotSchema,
    reason: z.enum(["fainted", "flinched", "asleep", "frozen", "paralyzed", "recharging", "failed", "other"])
  })
  .strict();

export const observedActionSchema = z.discriminatedUnion("type", [
  observedMoveActionSchema,
  observedSwitchActionSchema,
  observedNoActionSchema
]);

export const observedHpSchema = z
  .object({
    slot: activeSlotSchema,
    remainingHp: z.discriminatedUnion("unit", [
      z.object({ unit: z.literal("exact"), current: z.number().int().min(0).max(999) }).strict(),
      z.object({ unit: z.literal("percent"), percent: z.number().min(0).max(100) }).strict()
    ])
  })
  .strict();

export const confirmedEffectSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("status-applied"), slot: activeSlotSchema, status: statusConditionSchema.exclude(["healthy"]) }).strict(),
  z.object({ kind: z.literal("status-cleared"), slot: activeSlotSchema }).strict(),
  z.object({ kind: z.literal("boosts-changed"), slot: activeSlotSchema, boosts: statBoostsSchema }).strict(),
  z.object({ kind: z.literal("volatiles-changed"), slot: activeSlotSchema, volatileEffectIds: z.array(canonicalIdSchema) }).strict(),
  z.object({ kind: z.literal("action-denied"), slot: activeSlotSchema, reason: canonicalIdSchema }).strict(),
  z.object({ kind: z.literal("move-result"), slot: activeSlotSchema, result: z.enum(["missed", "failed", "blocked", "critical-hit"]) }).strict()
]);

export const turnReportSchema = z
  .object({
    turnNumber: z.number().int().min(1),
    actions: z.array(observedActionSchema).min(1).max(4),
    hp: z.array(observedHpSchema).min(1).max(4),
    confirmedEffects: z.array(confirmedEffectSchema).default([]),
    ranking: z
      .object({
        top: z.number().int().min(1).max(10).default(3),
        maxOpponentPlans: z.number().int().min(1).max(24).default(4)
      })
      .strict()
      .default({ top: 3, maxOpponentPlans: 4 })
  })
  .strict()
  .superRefine((report, ctx) => {
    addDuplicateSlotIssue(report.actions.map((action) => action.activeSlot), "actions", ctx);
    addDuplicateSlotIssue(report.hp.map((observation) => observation.slot), "hp", ctx);
  });

export const replacementSelectionSchema = z
  .object({
    side: z.enum(["p1", "p2"]),
    activeSlot: activeSlotSchema,
    speciesId: canonicalIdSchema
  })
  .strict()
  .superRefine((selection, ctx) => {
    if (!selection.activeSlot.startsWith(selection.side)) {
      ctx.addIssue({ code: "custom", message: "Replacement slot must belong to its side.", path: ["activeSlot"] });
    }
  });

export const replacementSubmissionSchema = z
  .object({
    replacements: z.array(replacementSelectionSchema).min(1).max(4),
    ranking: z
      .object({
        top: z.number().int().min(1).max(10).default(3),
        maxOpponentPlans: z.number().int().min(1).max(24).default(4)
      })
      .strict()
      .default({ top: 3, maxOpponentPlans: 4 })
  })
  .strict()
  .superRefine((submission, ctx) => {
    addDuplicateSlotIssue(submission.replacements.map((replacement) => replacement.activeSlot), "replacements", ctx);
    const species = submission.replacements.map((replacement) => `${replacement.side}:${replacement.speciesId}`);
    if (new Set(species).size !== species.length) {
      ctx.addIssue({ code: "custom", message: "The same Pokemon cannot fill two active slots.", path: ["replacements"] });
    }
  });

export type ObservedAction = z.infer<typeof observedActionSchema>;
export type ObservedHp = z.infer<typeof observedHpSchema>;
export type ConfirmedEffect = z.infer<typeof confirmedEffectSchema>;
export type TurnReport = z.infer<typeof turnReportSchema>;
export type ReplacementSelection = z.infer<typeof replacementSelectionSchema>;
export type ReplacementSubmission = z.infer<typeof replacementSubmissionSchema>;

export interface TurnResolution {
  phase: "ready" | "replacement-required" | "battle-over";
  turnNumber: number;
  state: BattleState;
  report?: TurnReport;
  replacementRequests: ReplacementRequest[];
  winner?: PlayerSide | null;
}

export interface ReplacementRequest {
  side: PlayerSide;
  activeSlot: ActivePokemon["slot"];
  choices: ReplacementChoice[];
}

export interface ReplacementChoice {
  id: string;
  source: "bench" | "preview";
  benchSlot?: number;
  previewIndex?: number;
  speciesId: string;
  displayName: string;
}

export interface AppliedTurnReport {
  state: BattleState;
  report: TurnReport;
  events: BattleEvent[];
}

export function applyTurnReport(state: BattleState, report: TurnReport): AppliedTurnReport {
  const currentState = battleStateSchema.parse(structuredClone(state));
  const parsedReport = turnReportSchema.parse(report);
  if (parsedReport.turnNumber !== currentState.turnNumber) {
    throw new Error(`Turn report is for turn ${parsedReport.turnNumber}, but the session is on turn ${currentState.turnNumber}.`);
  }

  assertRequiredSlots(currentState, parsedReport);
  let nextState = structuredClone(currentState);
  const events: BattleEvent[] = [];
  const apply = (event: BattleEvent) => {
    nextState = applyBattleEvent(nextState, event);
    events.push(event);
  };

  for (const action of parsedReport.actions) {
    if (action.type !== "move") continue;
    recordObservedMove(
      nextState,
      action,
      currentState.turnNumber,
      observedMoveResult(parsedReport, action.activeSlot),
      apply
    );
  }

  for (const action of parsedReport.actions) {
    if (action.type !== "switch") continue;
    apply({
      type: "switch-observed",
      side: action.activeSlot.slice(0, 2) as PlayerSide,
      activeSlot: action.activeSlot,
      benchSlot: action.benchSlot
    });
  }

  for (const observation of parsedReport.hp) {
    apply({ type: "damage-observed", slot: observation.slot, remainingHp: observation.remainingHp });
  }

  for (const action of parsedReport.actions) {
    if (action.type === "switch") continue;
    apply({ type: "active-turn-advanced", slot: action.activeSlot });
  }

  nextState = applyAutomaticTurnEffects(currentState, nextState, parsedReport);

  for (const effect of parsedReport.confirmedEffects) {
    const event = confirmedEffectToEvent(effect);
    if (event) apply(event);
  }

  apply({ type: "turn-started", turnNumber: currentState.turnNumber + 1 });

  return {
    state: battleStateSchema.parse(nextState),
    report: parsedReport,
    events
  };
}

function assertRequiredSlots(state: BattleState, report: TurnReport): void {
  const active = [...state.teams.p1.active, ...state.teams.p2.active];
  const livingSlots = active.filter((pokemon) => !isFainted(pokemon)).map((pokemon) => pokemon.slot);
  const actionSlots = new Set(report.actions.map((action) => action.activeSlot));
  const hpSlots = new Set(report.hp.map((observation) => observation.slot));

  for (const slot of livingSlots) {
    if (!actionSlots.has(slot)) throw new Error(`Turn report is missing an action for ${slot}.`);
  }
  for (const action of report.actions) {
    if (!livingSlots.includes(action.activeSlot)) {
      throw new Error(`No living active Pokemon can act in slot ${action.activeSlot}.`);
    }
  }
  for (const pokemon of active) {
    if (!hpSlots.has(pokemon.slot)) throw new Error(`Turn report is missing ending HP for ${pokemon.slot}.`);
  }
}

function recordObservedMove(
  state: BattleState,
  action: Extract<ObservedAction, { type: "move" }>,
  turnNumber: number,
  result: LastMoveResult,
  apply: (event: BattleEvent) => void
): void {
  const side = action.activeSlot.slice(0, 2) as PlayerSide;
  const pokemon = state.teams[side].active.find((candidate) => candidate.slot === action.activeSlot);
  if (!pokemon) throw new Error(`No active Pokemon exists in slot ${action.activeSlot}.`);

  if (side === state.playerSide) {
    if (!pokemon.set.moveIds.includes(action.moveId)) {
      throw new Error(`${pokemon.set.speciesId} does not know ${action.moveId}.`);
    }
    const move = pokemonDataService.getMove(state.regulationId, action.moveId);
    if (!move) throw new Error(`Unknown move ${action.moveId}.`);
    const currentPp = pokemon.movePp?.[action.moveId] ?? move.pp;
    if (currentPp < 1) throw new Error(`${action.moveId} has no PP remaining.`);
    apply({ type: "move-pp-changed", slot: action.activeSlot, moveId: action.moveId, remainingPp: currentPp - 1 });
  } else {
    apply({ type: "move-observed", slot: action.activeSlot, moveId: action.moveId });
  }

  apply({
    type: "move-memory-updated",
    slot: action.activeSlot,
    moveId: action.moveId,
    turnNumber,
    result
  });

  if (action.specialMechanic) {
    apply({ type: "special-mechanic-used", slot: action.activeSlot, kind: action.specialMechanic.kind });
  }
}

function observedMoveResult(
  report: TurnReport,
  slot: ActivePokemon["slot"]
): LastMoveResult {
  const result = report.confirmedEffects.find(
    (effect) => effect.kind === "move-result" && effect.slot === slot
  );
  return result?.kind === "move-result" ? result.result : "hit";
}

function confirmedEffectToEvent(effect: ConfirmedEffect): BattleEvent | null {
  switch (effect.kind) {
    case "status-applied":
      return { type: "status-applied", slot: effect.slot, status: effect.status };
    case "status-cleared":
      return { type: "status-cleared", slot: effect.slot };
    case "boosts-changed":
      return { type: "boosts-changed", slot: effect.slot, boosts: effect.boosts };
    case "volatiles-changed":
      return { type: "volatiles-changed", slot: effect.slot, volatileEffectIds: effect.volatileEffectIds };
    case "action-denied":
    case "move-result":
      return null;
  }
}

function addDuplicateSlotIssue(
  slots: string[],
  path: string,
  ctx: z.RefinementCtx
): void {
  if (new Set(slots).size !== slots.length) {
    ctx.addIssue({ code: "custom", message: `Each active slot may appear only once in ${path}.`, path: [path] });
  }
}

function isFainted(pokemon: ActivePokemon): boolean {
  return pokemon.hp.unit === "exact" ? pokemon.hp.current === 0 : pokemon.hp.percent === 0;
}
