import { describe, expect, it } from "vitest";

import { calculateDamage, calculateDamageRolls, calculateExpectedDamage } from "../src/sim/damage-calculator.js";

const simpleDamageInput = {
  attackingLevel: 50,
  movePower: 100,
  attackStat: 120,
  defenseStat: 100,
  stabMultiplier: 1.5,
  typeEffectiveness: 2
};

describe("damage calculator", () => {
  it("returns integer min and max damage rolls", () => {
    expect(calculateDamage(simpleDamageInput)).toEqual([137, 162]);
  });

  it("returns all 16 standard random damage rolls", () => {
    expect(calculateDamageRolls(simpleDamageInput)).toEqual([
      137,
      139,
      140,
      142,
      144,
      145,
      147,
      149,
      150,
      152,
      153,
      155,
      157,
      158,
      160,
      162
    ]);
  });

  it("averages either a range or a full roll table", () => {
    expect(calculateExpectedDamage([137, 162])).toBe(149.5);
    expect(calculateExpectedDamage(calculateDamageRolls(simpleDamageInput))).toBe(149.375);
  });

  it("includes move accuracy and zero-damage misses in expected damage", () => {
    expect(calculateExpectedDamage([137, 162], 90)).toBeCloseTo(134.55);
    expect(calculateExpectedDamage([137, 162], 0)).toBe(0);
    expect(calculateExpectedDamage([137, 162], true)).toBe(149.5);
  });

  it("rejects invalid accuracy values", () => {
    expect(() => calculateExpectedDamage([137, 162], -1)).toThrow(RangeError);
    expect(() => calculateExpectedDamage([137, 162], 101)).toThrow(RangeError);
  });

  it("rejects invalid core inputs before calculating damage", () => {
    expect(() =>
      calculateDamage({
        ...simpleDamageInput,
        defenseStat: 0
      })
    ).toThrow(RangeError);
  });
});
