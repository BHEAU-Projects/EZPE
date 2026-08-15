import { describe, expect, it } from "vitest";

import { battleEventSchema } from "../src/session/battle-events.js";

describe("battleEventSchema", () => {
  it("accepts supported observation events", () => {
    const events = [
      {
        type: "damage-observed",
        slot: "p2a",
        remainingHp: { unit: "percent", percent: 42 }
      },
      { type: "faint-observed", slot: "p2a" },
      { type: "status-applied", slot: "p1a", status: "par" },
      { type: "status-cleared", slot: "p1a" },
      { type: "item-changed", slot: "p1a", itemId: null },
      { type: "ability-changed", slot: "p1a", abilityId: "lightningrod" },
      { type: "move-observed", slot: "p2a", moveId: "watergun" },
      { type: "move-pp-changed", slot: "p1a", moveId: "thunderbolt", remainingPp: 3 },
      { type: "volatiles-changed", slot: "p1a", volatileEffectIds: ["focusenergy"] },
      { type: "field-changed", changes: { weather: "rain", weatherTurnsRemaining: 5 } },
      { type: "side-condition-changed", side: "p1", changes: { tailwindTurns: 4 } }
    ];

    expect(events.every((event) => battleEventSchema.safeParse(event).success)).toBe(true);
  });

  it("rejects a switch whose active slot belongs to the other side", () => {
    const event = {
      type: "switch-observed",
      side: "p1",
      activeSlot: "p2a",
      benchSlot: 0
    };

    expect(battleEventSchema.safeParse(event).success).toBe(false);
  });

  it("rejects empty patch events", () => {
    expect(
      battleEventSchema.safeParse({ type: "field-changed", changes: {} }).success
    ).toBe(false);
    expect(
      battleEventSchema.safeParse({
        type: "side-condition-changed",
        side: "p1",
        changes: {}
      }).success
    ).toBe(false);
  });

  it("requires status-cleared instead of applying healthy", () => {
    const event = {
      type: "status-applied",
      slot: "p1a",
      status: "healthy"
    };

    expect(battleEventSchema.safeParse(event).success).toBe(false);
  });
});
