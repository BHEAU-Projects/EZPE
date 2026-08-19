import { z } from "zod";

import {
  activeSlotSchema,
  fieldStateSchema,
  lastMoveResultSchema,
  legalActionSchema,
  playerSideSchema,
  sideConditionsSchema,
  statBoostsSchema,
  statusConditionSchema
} from "../domain/battle-state.js";

const nonEmptyFieldChangesSchema = z
  .object({
    weather: fieldStateSchema.shape.weather.removeDefault().optional(),
    weatherTurnsRemaining: fieldStateSchema.shape.weatherTurnsRemaining.removeDefault().optional(),
    terrain: fieldStateSchema.shape.terrain.removeDefault().optional(),
    terrainTurnsRemaining: fieldStateSchema.shape.terrainTurnsRemaining.removeDefault().optional(),
    trickRoomTurnsRemaining: fieldStateSchema.shape.trickRoomTurnsRemaining.removeDefault().optional(),
    magicRoomTurnsRemaining: fieldStateSchema.shape.magicRoomTurnsRemaining.removeDefault().optional(),
    wonderRoomTurnsRemaining: fieldStateSchema.shape.wonderRoomTurnsRemaining.removeDefault().optional(),
    gravityTurnsRemaining: fieldStateSchema.shape.gravityTurnsRemaining.removeDefault().optional()
  })
  .strict()
  .refine((changes) => Object.keys(changes).length > 0, {
    message: "At least one field value must be updated."
  });

const nonEmptySideConditionChangesSchema = z
  .object({
    tailwindTurns: sideConditionsSchema.shape.tailwindTurns.removeDefault().optional(),
    reflectTurns: sideConditionsSchema.shape.reflectTurns.removeDefault().optional(),
    lightScreenTurns: sideConditionsSchema.shape.lightScreenTurns.removeDefault().optional(),
    auroraVeilTurns: sideConditionsSchema.shape.auroraVeilTurns.removeDefault().optional(),
    safeguardTurns: sideConditionsSchema.shape.safeguardTurns.removeDefault().optional(),
    stealthRock: sideConditionsSchema.shape.stealthRock.removeDefault().optional(),
    stickyWeb: sideConditionsSchema.shape.stickyWeb.removeDefault().optional(),
    spikesLayers: sideConditionsSchema.shape.spikesLayers.removeDefault().optional(),
    toxicSpikesLayers: sideConditionsSchema.shape.toxicSpikesLayers.removeDefault().optional()
  })
  .strict()
  .refine((changes) => Object.keys(changes).length > 0, {
    message: "At least one side condition must be updated."
  });

export const turnStartedEventSchema = z
  .object({
    type: z.literal("turn-started"),
    turnNumber: z.number().int().min(1),
    legalActions: z.array(legalActionSchema).min(1).optional()
  })
  .strict();

export const damageObservedEventSchema = z
  .object({
    type: z.literal("damage-observed"),
    slot: activeSlotSchema,
    remainingHp: z.discriminatedUnion("unit", [
      z
        .object({
          unit: z.literal("exact"),
          current: z.number().int().min(0).max(999)
        })
        .strict(),
      z
        .object({
          unit: z.literal("percent"),
          percent: z.number().min(0).max(100)
        })
        .strict()
    ])
  })
  .strict();

export const faintObservedEventSchema = z
  .object({
    type: z.literal("faint-observed"),
    slot: activeSlotSchema
  })
  .strict();

export const switchObservedEventSchema = z
  .object({
    type: z.literal("switch-observed"),
    side: playerSideSchema,
    activeSlot: activeSlotSchema,
    benchSlot: z.number().int().min(0).max(5)
  })
  .strict()
  .superRefine((event, ctx) => {
    if (!event.activeSlot.startsWith(event.side)) {
      ctx.addIssue({
        code: "custom",
        message: "The active slot must belong to the switching side.",
        path: ["activeSlot"]
      });
    }
  });

export const statusAppliedEventSchema = z
  .object({
    type: z.literal("status-applied"),
    slot: activeSlotSchema,
    status: statusConditionSchema.refine((status) => status !== "healthy", {
      message: "Use status-cleared to restore a Pokemon to healthy."
    })
  })
  .strict();

export const statusClearedEventSchema = z
  .object({
    type: z.literal("status-cleared"),
    slot: activeSlotSchema
  })
  .strict();

export const boostsChangedEventSchema = z
  .object({
    type: z.literal("boosts-changed"),
    slot: activeSlotSchema,
    boosts: statBoostsSchema
  })
  .strict();

export const itemChangedEventSchema = z
  .object({
    type: z.literal("item-changed"),
    slot: activeSlotSchema,
    itemId: z
      .string()
      .regex(/^[a-z0-9]+$/)
      .nullable()
  })
  .strict();

export const abilityChangedEventSchema = z
  .object({
    type: z.literal("ability-changed"),
    slot: activeSlotSchema,
    abilityId: z.string().min(1).regex(/^[a-z0-9]+$/)
  })
  .strict();

export const movePpChangedEventSchema = z
  .object({
    type: z.literal("move-pp-changed"),
    slot: activeSlotSchema,
    moveId: z.string().min(1).regex(/^[a-z0-9]+$/),
    remainingPp: z.number().int().min(0).max(64)
  })
  .strict();

export const moveObservedEventSchema = z
  .object({
    type: z.literal("move-observed"),
    slot: activeSlotSchema,
    moveId: z.string().min(1).regex(/^[a-z0-9]+$/)
  })
  .strict();

export const moveMemoryUpdatedEventSchema = z
  .object({
    type: z.literal("move-memory-updated"),
    slot: activeSlotSchema,
    moveId: z.string().min(1).regex(/^[a-z0-9]+$/),
    turnNumber: z.number().int().min(1),
    result: lastMoveResultSchema
  })
  .strict();

export const activeTurnAdvancedEventSchema = z
  .object({
    type: z.literal("active-turn-advanced"),
    slot: activeSlotSchema
  })
  .strict();

export const volatilesChangedEventSchema = z
  .object({
    type: z.literal("volatiles-changed"),
    slot: activeSlotSchema,
    volatileEffectIds: z.array(z.string().min(1).regex(/^[a-z0-9]+$/))
  })
  .strict();

export const specialMechanicUsedEventSchema = z
  .object({
    type: z.literal("special-mechanic-used"),
    slot: activeSlotSchema,
    kind: z.string().min(1).regex(/^[a-z0-9]+$/)
  })
  .strict();

export const fieldChangedEventSchema = z
  .object({
    type: z.literal("field-changed"),
    changes: nonEmptyFieldChangesSchema
  })
  .strict();

export const sideConditionChangedEventSchema = z
  .object({
    type: z.literal("side-condition-changed"),
    side: playerSideSchema,
    changes: nonEmptySideConditionChangesSchema
  })
  .strict();

export const legalActionsUpdatedEventSchema = z
  .object({
    type: z.literal("legal-actions-updated"),
    legalActions: z.array(legalActionSchema).min(1)
  })
  .strict();

export const battleEventSchema = z.discriminatedUnion("type", [
  turnStartedEventSchema,
  damageObservedEventSchema,
  faintObservedEventSchema,
  switchObservedEventSchema,
  statusAppliedEventSchema,
  statusClearedEventSchema,
  boostsChangedEventSchema,
  itemChangedEventSchema,
  abilityChangedEventSchema,
  moveObservedEventSchema,
  moveMemoryUpdatedEventSchema,
  activeTurnAdvancedEventSchema,
  movePpChangedEventSchema,
  volatilesChangedEventSchema,
  specialMechanicUsedEventSchema,
  fieldChangedEventSchema,
  sideConditionChangedEventSchema,
  legalActionsUpdatedEventSchema
]);

export type TurnStartedEvent = z.infer<typeof turnStartedEventSchema>;
export type DamageObservedEvent = z.infer<typeof damageObservedEventSchema>;
export type FaintObservedEvent = z.infer<typeof faintObservedEventSchema>;
export type SwitchObservedEvent = z.infer<typeof switchObservedEventSchema>;
export type StatusAppliedEvent = z.infer<typeof statusAppliedEventSchema>;
export type StatusClearedEvent = z.infer<typeof statusClearedEventSchema>;
export type BoostsChangedEvent = z.infer<typeof boostsChangedEventSchema>;
export type ItemChangedEvent = z.infer<typeof itemChangedEventSchema>;
export type AbilityChangedEvent = z.infer<typeof abilityChangedEventSchema>;
export type MoveObservedEvent = z.infer<typeof moveObservedEventSchema>;
export type MoveMemoryUpdatedEvent = z.infer<typeof moveMemoryUpdatedEventSchema>;
export type ActiveTurnAdvancedEvent = z.infer<typeof activeTurnAdvancedEventSchema>;
export type MovePpChangedEvent = z.infer<typeof movePpChangedEventSchema>;
export type VolatilesChangedEvent = z.infer<typeof volatilesChangedEventSchema>;
export type SpecialMechanicUsedEvent = z.infer<typeof specialMechanicUsedEventSchema>;
export type FieldChangedEvent = z.infer<typeof fieldChangedEventSchema>;
export type SideConditionChangedEvent = z.infer<typeof sideConditionChangedEventSchema>;
export type LegalActionsUpdatedEvent = z.infer<typeof legalActionsUpdatedEventSchema>;
export type BattleEvent = z.infer<typeof battleEventSchema>;
