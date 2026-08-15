export interface DamageCalculationInput {
  attackingLevel: number;
  movePower: number;
  attackStat: number;
  defenseStat: number;
  moreThanOneTarget?: boolean;
  isCriticalHit?: boolean;
  isParentalBond?: boolean;
  weatherModifier?: number;
  isGlaiveRush?: boolean;
  stabMultiplier?: number;
  typeEffectiveness?: number;
  isBurned?: boolean;
  otherModifier?: number;
}

export type DamageRange = readonly [minDamage: number, maxDamage: number];
export type MoveAccuracy = number | true;

export const damageRandomMultipliers = [
  0.85,
  0.86,
  0.87,
  0.88,
  0.89,
  0.9,
  0.91,
  0.92,
  0.93,
  0.94,
  0.95,
  0.96,
  0.97,
  0.98,
  0.99,
  1
] as const;

function assertPositiveNumber(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number.`);
  }
}

export function calculateBaseDamage(input: DamageCalculationInput): number {
  assertPositiveNumber("attackingLevel", input.attackingLevel);
  assertPositiveNumber("movePower", input.movePower);
  assertPositiveNumber("attackStat", input.attackStat);
  assertPositiveNumber("defenseStat", input.defenseStat);

  const levelFactor = Math.floor((2 * input.attackingLevel) / 5 + 2);
  const scaledPower = Math.floor(levelFactor * input.movePower * (input.attackStat / input.defenseStat));

  return Math.floor(scaledPower / 50) + 2;
}

export function calculateDamageModifier(input: DamageCalculationInput): number {
  const modifier =
    (input.moreThanOneTarget ? 0.75 : 1) *
    (input.isCriticalHit ? 1.5 : 1) *
    (input.isParentalBond ? 0.25 : 1) *
    (input.weatherModifier ?? 1) *
    (input.isGlaiveRush ? 2 : 1) *
    (input.stabMultiplier ?? 1) *
    (input.typeEffectiveness ?? 1) *
    (input.isBurned ? 0.5 : 1) *
    (input.otherModifier ?? 1);

  assertPositiveNumber("damage modifier", modifier);

  return modifier;
}

export function calculateDamageRolls(input: DamageCalculationInput): number[] {
  const baseDamage = calculateBaseDamage(input);
  const modifier = calculateDamageModifier(input);

  return damageRandomMultipliers.map((randomMultiplier) =>
    Math.max(1, Math.floor(baseDamage * modifier * randomMultiplier))
  );
}

export function calculateDamage(input: DamageCalculationInput): DamageRange {
  const rolls = calculateDamageRolls(input);

  return [rolls[0], rolls[rolls.length - 1]];
}

export function calculateExpectedDamage(
  damageValues: DamageRange | readonly number[],
  accuracy: MoveAccuracy = true
): number {
  if (damageValues.length === 0) {
    throw new RangeError("damageValues must contain at least one damage value.");
  }

  const hitChance = accuracy === true ? 1 : accuracy / 100;
  if (!Number.isFinite(hitChance) || hitChance < 0 || hitChance > 1) {
    throw new RangeError("accuracy must be true or a number from 0 to 100.");
  }

  const expectedDamageOnHit =
    damageValues.reduce((sum, damage) => sum + damage, 0) / damageValues.length;

  return expectedDamageOnHit * hitChance;
}
