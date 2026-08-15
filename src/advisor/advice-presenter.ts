import type { ActionPlan } from "../domain/advice.js";
import type {
  BattleState,
  LegalAction,
  PlayerSide,
  PokemonSet,
  TargetSlot
} from "../domain/battle-state.js";
import { pokemonDataService } from "../data/pokemon-data-service.js";
import { createHydratedBattleFromState } from "../sim/showdown-adapter.js";
import { generateActionPlansForSide } from "./move-ranker.js";

export interface DamageEstimate {
  expectedDamage: number;
  normalMinDamage: number;
  normalMaxDamage: number;
  criticalMaxDamage: number;
  accuracyPercent: number;
  missChancePercent: number;
  criticalChancePercent: number;
}

export interface PresentedAction {
  type: "move" | "switch";
  actorSlot: string;
  actorSpecies: string;
  moveId?: string;
  moveName?: string;
  targetSlot?: TargetSlot;
  targetSpecies: string;
  switchSpecies?: string;
  damage: DamageEstimate | null;
}

export interface PresentedWorstCase {
  actions: PresentedAction[];
  totalExpectedDamage: number;
  totalCriticalMaxDamage: number;
}

export interface PresentedMovePp {
  moveId: string;
  moveName: string;
  currentPp: number;
  maxPp: number;
}

interface TargetDamageEstimate extends DamageEstimate {
  targetSpecies: string;
}

export class AdvicePresenter {
  private readonly actionCache = new Map<string, PresentedAction>();

  constructor(private readonly battleState: BattleState) {}

  presentPlan(plan: ActionPlan): PresentedAction[] {
    return plan.actions.map((action) => this.presentAction(action));
  }

  findWorstEnemyDamagePlan(): PresentedWorstCase {
    const opponentSide = this.battleState.playerSide === "p1" ? "p2" : "p1";
    const plans = generateActionPlansForSide(this.battleState, opponentSide);
    const presentedPlans = plans.map((plan) => {
      const actions = this.presentPlan(plan);
      return {
        actions,
        totalExpectedDamage: sumDamage(actions, "expectedDamage"),
        totalCriticalMaxDamage: sumDamage(actions, "criticalMaxDamage")
      };
    });

    return presentedPlans.reduce((worst, candidate) => {
      if (candidate.totalCriticalMaxDamage !== worst.totalCriticalMaxDamage) {
        return candidate.totalCriticalMaxDamage > worst.totalCriticalMaxDamage ? candidate : worst;
      }
      return candidate.totalExpectedDamage > worst.totalExpectedDamage ? candidate : worst;
    });
  }

  private presentAction(action: LegalAction): PresentedAction {
    const key = JSON.stringify(action);
    const cached = this.actionCache.get(key);
    if (cached) return cached;

    const actor = findPokemonByActiveSlot(this.battleState, action.activeSlot);
    const actorSpecies = displaySpecies(actor.set);
    let presented: PresentedAction;

    if (action.type === "switch") {
      const side = action.activeSlot.slice(0, 2) as PlayerSide;
      const incoming = this.battleState.teams[side].bench.find(
        (pokemon) => pokemon.benchSlot === action.benchSlot
      );
      const switchSpecies = incoming ? displaySpecies(incoming.set) : action.speciesId;
      presented = {
        type: "switch",
        actorSlot: action.activeSlot,
        actorSpecies,
        targetSpecies: switchSpecies,
        switchSpecies,
        damage: null
      };
    } else {
      const move = pokemonDataService.getMove(this.battleState.regulationId, action.moveId);
      const targets = resolveTargetPokemon(this.battleState, action.activeSlot, action.targetSlot);
      const targetSpecies = targets.length > 0
        ? targets.map((target) => displaySpecies(target.set)).join(" + ")
        : formatNonPokemonTarget(action.targetSlot, actorSpecies);
      const estimates = move?.category === "Status"
        ? []
        : estimateMoveDamage(this.battleState, action, targets.length > 1);

      presented = {
        type: "move",
        actorSlot: action.activeSlot,
        actorSpecies,
        moveId: action.moveId,
        moveName: move?.name ?? action.moveId,
        targetSlot: action.targetSlot,
        targetSpecies,
        damage: combineTargetEstimates(estimates)
      };
    }

    this.actionCache.set(key, presented);
    return presented;
  }
}

export function presentPlayerMovePp(state: BattleState): Record<string, PresentedMovePp[]> {
  return Object.fromEntries(
    state.teams[state.playerSide].active.map((pokemon) => [
      pokemon.slot,
      pokemon.set.moveIds.map((moveId) => {
        const move = pokemonDataService.getMove(state.regulationId, moveId);
        const maxPp = move?.pp ?? 0;
        return {
          moveId,
          moveName: move?.name ?? moveId,
          currentPp: pokemon.movePp?.[moveId] ?? maxPp,
          maxPp
        };
      })
    ])
  );
}

function estimateMoveDamage(
  state: BattleState,
  action: Extract<LegalAction, { type: "move" }>,
  spreadHit: boolean
): TargetDamageEstimate[] {
  const targets = resolveTargetPokemon(state, action.activeSlot, action.targetSlot);
  if (targets.length === 0) return [];

  const battle = createHydratedBattleFromState(state);

  try {
    const source = getShowdownPokemon(battle, action.activeSlot);
    if (!source) return [];

    return targets.flatMap((targetState) => {
      const target = getShowdownPokemon(battle, targetState.slot);
      if (!target) return [];
      const move = battle.dex.getActiveMove(action.moveId);
      move.spreadHit = spreadHit;

      const accuracyPercent = calculateEffectiveAccuracy(battle, source, target, move);
      const criticalChance = calculateCriticalChance(battle, source, target, move);
      const normalRolls = calculateDamageRolls(battle, source, target, action.moveId, spreadHit, false);
      const criticalRolls = calculateDamageRolls(battle, source, target, action.moveId, spreadHit, true);
      if (normalRolls.length === 0 || criticalRolls.length === 0) return [];

      const expectedNormal = average(normalRolls);
      const expectedCritical = average(criticalRolls);
      const hitChance = accuracyPercent / 100;
      const expectedDamage = hitChance * (
        expectedNormal * (1 - criticalChance) + expectedCritical * criticalChance
      );

      return [{
        targetSpecies: displaySpecies(targetState.set),
        expectedDamage,
        normalMinDamage: Math.min(...normalRolls),
        normalMaxDamage: Math.max(...normalRolls),
        criticalMaxDamage: Math.max(...criticalRolls),
        accuracyPercent,
        missChancePercent: 100 - accuracyPercent,
        criticalChancePercent: criticalChance * 100
      }];
    });
  } finally {
    battle.destroy();
  }
}

function calculateDamageRolls(
  battle: ReturnType<typeof createHydratedBattleFromState>,
  source: NonNullable<ReturnType<typeof getShowdownPokemon>>,
  target: NonNullable<ReturnType<typeof getShowdownPokemon>>,
  moveId: string,
  spreadHit: boolean,
  critical: boolean
): number[] {
  const originalRandomizer = battle.randomizer;

  try {
    return Array.from({ length: 16 }, (_, index) => 85 + index).flatMap((percent) => {
      battle.randomizer = (baseDamage: number) => battle.trunc(battle.trunc(baseDamage * percent) / 100);
      const move = battle.dex.getActiveMove(moveId);
      move.spreadHit = spreadHit;
      move.willCrit = critical;
      const damage = battle.actions.getDamage(source, target, move, true);
      return typeof damage === "number" && damage > 0 ? [damage] : [];
    });
  } finally {
    battle.randomizer = originalRandomizer;
  }
}

function calculateEffectiveAccuracy(
  battle: ReturnType<typeof createHydratedBattleFromState>,
  source: NonNullable<ReturnType<typeof getShowdownPokemon>>,
  target: NonNullable<ReturnType<typeof getShowdownPokemon>>,
  move: ReturnType<ReturnType<typeof createHydratedBattleFromState>["dex"]["getActiveMove"]>
): number {
  if (move.alwaysHit || move.accuracy === true) return 100;

  let accuracy = battle.runEvent("ModifyAccuracy", target, source, move, move.accuracy);
  if (accuracy === true) return 100;

  if (!move.ignoreAccuracy || !move.ignoreEvasion) {
    const sourceBoosts = battle.runEvent("ModifyBoost", source, null, null, { ...source.boosts });
    const targetBoosts = battle.runEvent("ModifyBoost", target, null, null, { ...target.boosts });
    const accuracyBoost = move.ignoreAccuracy ? 0 : sourceBoosts.accuracy;
    const evasionBoost = move.ignoreEvasion ? 0 : targetBoosts.evasion;
    const stage = battle.clampIntRange(accuracyBoost - evasionBoost, -6, 6);
    accuracy = stage > 0
      ? battle.trunc(accuracy * (3 + stage) / 3)
      : stage < 0
        ? battle.trunc(accuracy * 3 / (3 - stage))
        : accuracy;
  }

  accuracy = battle.runEvent("Accuracy", target, source, move, accuracy);
  return accuracy === true ? 100 : Math.min(100, Math.max(0, accuracy));
}

function calculateCriticalChance(
  battle: ReturnType<typeof createHydratedBattleFromState>,
  source: NonNullable<ReturnType<typeof getShowdownPokemon>>,
  target: NonNullable<ReturnType<typeof getShowdownPokemon>>,
  move: ReturnType<ReturnType<typeof createHydratedBattleFromState>["dex"]["getActiveMove"]>
): number {
  if (move.willCrit) return 1;
  const ratio = battle.clampIntRange(
    battle.runEvent("ModifyCritRatio", source, target, move, move.critRatio || 0),
    0,
    4
  );
  const denominators = [Infinity, 24, 8, 2, 1];
  return ratio === 0 ? 0 : 1 / denominators[ratio];
}

function combineTargetEstimates(estimates: TargetDamageEstimate[]): DamageEstimate | null {
  if (estimates.length === 0) return null;
  return {
    expectedDamage: estimates.reduce((sum, estimate) => sum + estimate.expectedDamage, 0),
    normalMinDamage: estimates.reduce((sum, estimate) => sum + estimate.normalMinDamage, 0),
    normalMaxDamage: estimates.reduce((sum, estimate) => sum + estimate.normalMaxDamage, 0),
    criticalMaxDamage: estimates.reduce((sum, estimate) => sum + estimate.criticalMaxDamage, 0),
    accuracyPercent: Math.min(...estimates.map((estimate) => estimate.accuracyPercent)),
    missChancePercent: Math.max(...estimates.map((estimate) => estimate.missChancePercent)),
    criticalChancePercent: Math.max(...estimates.map((estimate) => estimate.criticalChancePercent))
  };
}

function resolveTargetPokemon(
  state: BattleState,
  activeSlot: string,
  targetSlot: TargetSlot
) {
  if (targetSlot === "self") return [findPokemonByActiveSlot(state, activeSlot)];
  if (targetSlot === "opponentSide") {
    const side = activeSlot.startsWith("p1") ? "p2" : "p1";
    return state.teams[side].active;
  }
  if (targetSlot === "allySide" || targetSlot === "field") return [];
  return [findPokemonByActiveSlot(state, targetSlot)];
}

function getShowdownPokemon(
  battle: ReturnType<typeof createHydratedBattleFromState>,
  slot: string
) {
  const side = slot.startsWith("p1") ? battle.p1 : battle.p2;
  return side.active[slot.endsWith("a") ? 0 : 1] ?? null;
}

function findPokemonByActiveSlot(state: BattleState, slot: string) {
  const side = slot.slice(0, 2) as PlayerSide;
  const pokemon = state.teams[side].active.find((candidate) => candidate.slot === slot);
  if (!pokemon) throw new Error(`No active Pokemon exists in ${slot}.`);
  return pokemon;
}

function displaySpecies(set: PokemonSet): string {
  return set.displayName ?? set.speciesId;
}

function formatNonPokemonTarget(targetSlot: TargetSlot, actorSpecies: string): string {
  switch (targetSlot) {
    case "self":
      return actorSpecies;
    case "allySide":
      return "ally side";
    case "opponentSide":
      return "opponent side";
    default:
      return "field";
  }
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sumDamage(actions: PresentedAction[], key: keyof DamageEstimate): number {
  return actions.reduce((sum, action) => {
    const value = action.damage?.[key];
    return sum + (typeof value === "number" ? value : 0);
  }, 0);
}
