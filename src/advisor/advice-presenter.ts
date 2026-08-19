import type { ActionPlan } from "../domain/advice.js";
import type {
  BattleState,
  LegalAction,
  PlayerSide,
  PokemonSet,
  TargetSlot
} from "../domain/battle-state.js";
import { pokemonDataService } from "../data/pokemon-data-service.js";
import {
  createHydratedBattleFromState,
  type ShowdownActionOutcome,
  type SingleTurnSimulationResult
} from "../sim/showdown-adapter.js";
import { generateActionPlansForSide } from "./move-ranker.js";

export interface DamageEstimate {
  expectedDamage: number;
  expectedDamagePercent: number;
  normalMinDamage: number;
  normalMinDamagePercent: number;
  normalMaxDamage: number;
  normalMaxDamagePercent: number;
  criticalMaxDamage: number;
  criticalMaxDamagePercent: number;
  accuracyPercent: number;
  missChancePercent: number;
  criticalChancePercent: number;
  koChancePercent: number;
}

export type PresentedMoveSource = "known" | "confirmed" | "predicted";

export interface PresentedTargetDamage {
  targetSlot: string;
  targetSpecies: string;
  damage: DamageEstimate;
}

export interface PresentedAction {
  type: "move" | "switch";
  actorSlot: string;
  actorSpecies: string;
  moveId?: string;
  moveName?: string;
  moveType?: string;
  moveSource?: PresentedMoveSource;
  specialMechanic?: string;
  targetSlot?: TargetSlot;
  targetSpecies: string;
  switchSpecies?: string;
  damage: DamageEstimate | null;
  targetDamages?: PresentedTargetDamage[];
}

export interface PresentedWorstCaseAction extends PresentedAction {
  actionChancePercent: number;
  adjustedExpectedDamage: number;
}

export interface PresentedWorstCase {
  actions: PresentedWorstCaseAction[];
  totalExpectedDamage: number;
  totalCriticalMaxDamage: number;
}

export interface PresentedMovePp {
  moveId: string;
  moveName: string;
  currentPp: number;
  maxPp: number;
}

export interface PresentedTurnStep {
  order: number;
  side: PlayerSide;
  actorSlot: string;
  actorSpecies: string;
  kind: ShowdownActionOutcome["outcome"];
  description: string;
  moveName?: string;
  targetSpecies?: string;
  reason?: string;
}

interface TargetDamageEstimate extends DamageEstimate {
  targetSlot: string;
  targetSpecies: string;
  targetCurrentHp: number;
  outcomes: DamageOutcome[];
}

interface DamageOutcome {
  damage: number;
  probability: number;
}

export class AdvicePresenter {
  private readonly actionCache = new Map<string, PresentedAction>();
  private readonly targetEstimateCache = new Map<string, TargetDamageEstimate[]>();
  private readonly orderCache = new Map<string, number>();

  constructor(private readonly battleState: BattleState) {}

  presentPlan(plan: ActionPlan): PresentedAction[] {
    return plan.actions.map((action) => this.presentAction(action));
  }

  presentTurnOrder(simulation: SingleTurnSimulationResult): PresentedTurnStep[] {
    return [...simulation.summary.actionOutcomes]
      .sort((left, right) =>
        (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER) ||
        left.slot.localeCompare(right.slot)
      )
      .map((outcome, index) => presentTurnStep(this.battleState, outcome, index + 1));
  }

  findWorstEnemyDamagePlan(playerPlan: ActionPlan): PresentedWorstCase {
    const opponentSide = this.battleState.playerSide === "p1" ? "p2" : "p1";
    const plans = generateActionPlansForSide(this.battleState, opponentSide);
    const presentedPlans = plans.map((plan) => {
      const actions = plan.actions.map((action) => {
        const presented = this.presentAction(action);
        const actionChance = this.calculateEnemyActionChance(playerPlan, action);

        return {
          ...presented,
          actionChancePercent: actionChance * 100,
          adjustedExpectedDamage: (presented.damage?.expectedDamage ?? 0) * actionChance
        };
      });
      return {
        actions,
        totalExpectedDamage: actions.reduce(
          (sum, action) => sum + action.adjustedExpectedDamage,
          0
        ),
        totalCriticalMaxDamage: actions.reduce(
          (sum, action) => sum + (action.actionChancePercent > 0
            ? action.damage?.criticalMaxDamage ?? 0
            : 0),
          0
        )
      };
    });

    return presentedPlans.reduce((worst, candidate) => {
      if (candidate.totalExpectedDamage !== worst.totalExpectedDamage) {
        return candidate.totalExpectedDamage > worst.totalExpectedDamage ? candidate : worst;
      }
      return candidate.totalCriticalMaxDamage > worst.totalCriticalMaxDamage ? candidate : worst;
    });
  }

  private calculateEnemyActionChance(playerPlan: ActionPlan, enemyAction: LegalAction): number {
    if (enemyAction.type !== "move") return 1;

    const damagingActions = playerPlan.actions.flatMap((playerAction) => {
      if (playerAction.type !== "move") return [];
      const estimate = this.getTargetEstimates(playerAction).find(
        (target) => target.targetSlot === enemyAction.activeSlot
      );
      if (!estimate) return [];

      const beforeChance = this.getMoveBeforeChance(playerAction, enemyAction);
      if (beforeChance === 0) return [];
      return [{ estimate, beforeChance }];
    });

    if (damagingActions.length === 0) return 1;

    let combined: DamageOutcome[] = [{ damage: 0, probability: 1 }];
    for (const { estimate, beforeChance } of damagingActions) {
      const timedOutcomes = addMoveOrderChance(estimate.outcomes, beforeChance);
      combined = combineDamageOutcomes(combined, timedOutcomes);
    }

    const koChance = combined
      .filter((outcome) => outcome.damage >= damagingActions[0].estimate.targetCurrentHp)
      .reduce((sum, outcome) => sum + outcome.probability, 0);
    const actionChance = Math.max(0, Math.min(1, 1 - koChance));
    return actionChance < 1e-12 ? 0 : actionChance;
  }

  private getMoveBeforeChance(
    playerAction: Extract<LegalAction, { type: "move" }>,
    enemyAction: Extract<LegalAction, { type: "move" }>
  ): number {
    const key = `${JSON.stringify(playerAction)}::${JSON.stringify(enemyAction)}`;
    const cached = this.orderCache.get(key);
    if (cached !== undefined) return cached;

    const battle = createHydratedBattleFromState(this.battleState);
    try {
      const playerOrder = resolveMoveOrder(battle, playerAction);
      const enemyOrder = resolveMoveOrder(battle, enemyAction);
      const comparison = battle.comparePriority(playerOrder, enemyOrder);
      const chance = comparison < 0 ? 1 : comparison > 0 ? 0 : 0.5;
      this.orderCache.set(key, chance);
      return chance;
    } finally {
      battle.destroy();
    }
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
      const targets = resolveTargetPokemon(
        this.battleState,
        action.activeSlot,
        action.targetSlot,
        move?.target
      );
      const targetSpecies = targets.length > 0
        ? targets.map((target) => displaySpecies(target.set)).join(" + ")
        : formatNonPokemonTarget(action.targetSlot, actorSpecies);
      const estimates = move?.category === "Status" ? [] : this.getTargetEstimates(action);

      presented = {
        type: "move",
        actorSlot: action.activeSlot,
        actorSpecies,
        moveId: action.moveId,
        moveName: move?.name ?? action.moveId,
        moveType: move?.type.toLowerCase() ?? "normal",
        moveSource: resolveMoveSource(this.battleState, actor, action.moveId),
        ...(action.specialMechanic ? { specialMechanic: action.specialMechanic.kind } : {}),
        targetSlot: action.targetSlot,
        targetSpecies,
        damage: combineTargetEstimates(estimates),
        targetDamages: estimates.map(({ targetSlot, targetSpecies, outcomes: _outcomes, targetCurrentHp: _targetCurrentHp, ...damage }) => ({
          targetSlot,
          targetSpecies,
          damage
        }))
      };
    }

    this.actionCache.set(key, presented);
    return presented;
  }

  private getTargetEstimates(
    action: Extract<LegalAction, { type: "move" }>
  ): TargetDamageEstimate[] {
    const key = JSON.stringify(action);
    const cached = this.targetEstimateCache.get(key);
    if (cached) return cached;

    const move = pokemonDataService.getMove(this.battleState.regulationId, action.moveId);
    const targets = resolveTargetPokemon(
      this.battleState,
      action.activeSlot,
      action.targetSlot,
      move?.target
    );
    const estimates = move?.category === "Status"
      ? []
      : estimateMoveDamage(this.battleState, action, targets, targets.length > 1);
    this.targetEstimateCache.set(key, estimates);
    return estimates;
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
  targets: ReturnType<typeof resolveTargetPokemon>,
  spreadHit: boolean
): TargetDamageEstimate[] {
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
      const outcomes = buildDamageOutcomes(
        normalRolls,
        criticalRolls,
        hitChance,
        criticalChance
      );
      const toPercent = (damage: number) => damage / target.maxhp * 100;

      return [{
        targetSlot: targetState.slot,
        targetSpecies: displaySpecies(targetState.set),
        targetCurrentHp: target.hp,
        outcomes,
        expectedDamage,
        expectedDamagePercent: toPercent(expectedDamage),
        normalMinDamage: Math.min(...normalRolls),
        normalMinDamagePercent: toPercent(Math.min(...normalRolls)),
        normalMaxDamage: Math.max(...normalRolls),
        normalMaxDamagePercent: toPercent(Math.max(...normalRolls)),
        criticalMaxDamage: Math.max(...criticalRolls),
        criticalMaxDamagePercent: toPercent(Math.max(...criticalRolls)),
        accuracyPercent,
        missChancePercent: 100 - accuracyPercent,
        criticalChancePercent: criticalChance * 100,
        koChancePercent: outcomes
          .filter((outcome) => outcome.damage >= target.hp)
          .reduce((sum, outcome) => sum + outcome.probability * 100, 0)
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
    expectedDamagePercent: estimates.reduce(
      (sum, estimate) => sum + estimate.expectedDamagePercent,
      0
    ),
    normalMinDamage: estimates.reduce((sum, estimate) => sum + estimate.normalMinDamage, 0),
    normalMinDamagePercent: estimates.reduce(
      (sum, estimate) => sum + estimate.normalMinDamagePercent,
      0
    ),
    normalMaxDamage: estimates.reduce((sum, estimate) => sum + estimate.normalMaxDamage, 0),
    normalMaxDamagePercent: estimates.reduce(
      (sum, estimate) => sum + estimate.normalMaxDamagePercent,
      0
    ),
    criticalMaxDamage: estimates.reduce((sum, estimate) => sum + estimate.criticalMaxDamage, 0),
    criticalMaxDamagePercent: estimates.reduce(
      (sum, estimate) => sum + estimate.criticalMaxDamagePercent,
      0
    ),
    accuracyPercent: Math.min(...estimates.map((estimate) => estimate.accuracyPercent)),
    missChancePercent: Math.max(...estimates.map((estimate) => estimate.missChancePercent)),
    criticalChancePercent: Math.max(...estimates.map((estimate) => estimate.criticalChancePercent)),
    koChancePercent: (
      1 - estimates.reduce(
        (noneKoChance, estimate) => noneKoChance * (1 - estimate.koChancePercent / 100),
        1
      )
    ) * 100
  };
}

function buildDamageOutcomes(
  normalRolls: number[],
  criticalRolls: number[],
  hitChance: number,
  criticalChance: number
): DamageOutcome[] {
  const outcomes: DamageOutcome[] = [];
  if (hitChance < 1) outcomes.push({ damage: 0, probability: 1 - hitChance });

  const normalProbability = hitChance * (1 - criticalChance) / normalRolls.length;
  outcomes.push(...normalRolls.map((damage) => ({ damage, probability: normalProbability })));

  const criticalProbability = hitChance * criticalChance / criticalRolls.length;
  outcomes.push(...criticalRolls.map((damage) => ({ damage, probability: criticalProbability })));
  return mergeDamageOutcomes(outcomes);
}

function addMoveOrderChance(outcomes: DamageOutcome[], beforeChance: number): DamageOutcome[] {
  if (beforeChance === 1) return outcomes;
  return mergeDamageOutcomes([
    { damage: 0, probability: 1 - beforeChance },
    ...outcomes.map((outcome) => ({
      damage: outcome.damage,
      probability: outcome.probability * beforeChance
    }))
  ]);
}

function combineDamageOutcomes(
  first: DamageOutcome[],
  second: DamageOutcome[]
): DamageOutcome[] {
  return mergeDamageOutcomes(first.flatMap((left) =>
    second.map((right) => ({
      damage: left.damage + right.damage,
      probability: left.probability * right.probability
    }))
  ));
}

function mergeDamageOutcomes(outcomes: DamageOutcome[]): DamageOutcome[] {
  const probabilities = new Map<number, number>();
  for (const outcome of outcomes) {
    probabilities.set(
      outcome.damage,
      (probabilities.get(outcome.damage) ?? 0) + outcome.probability
    );
  }
  return [...probabilities].map(([damage, probability]) => ({ damage, probability }));
}

function resolveMoveOrder(
  battle: ReturnType<typeof createHydratedBattleFromState>,
  action: Extract<LegalAction, { type: "move" }>
) {
  const pokemon = getShowdownPokemon(battle, action.activeSlot);
  if (!pokemon) throw new Error(`No Showdown Pokemon exists in ${action.activeSlot}.`);

  const targetLoc = toShowdownTargetLocation(action.activeSlot, action.targetSlot);
  const resolved = battle.queue.resolveAction({
    choice: "move",
    pokemon,
    moveid: action.moveId,
    ...(targetLoc === null ? {} : { targetLoc }),
    ...(action.specialMechanic?.kind === "megaevolution" ? { mega: true } : {}),
    ...(action.specialMechanic?.kind === "megaevolutionx" ? { megax: true } : {}),
    ...(action.specialMechanic?.kind === "megaevolutiony" ? { megay: true } : {}),
    ...(action.specialMechanic?.kind === "terastallization" ? { terastallize: true } : {})
  } as never).find((candidate) => candidate.choice === "move");

  if (!resolved) throw new Error(`Could not resolve move order for ${action.moveId}.`);
  return resolved;
}

function toShowdownTargetLocation(activeSlot: string, targetSlot: TargetSlot): number | null {
  if (["field", "self", "allySide", "opponentSide"].includes(targetSlot)) return null;
  const targetPosition = targetSlot.endsWith("a") ? 1 : 2;
  return activeSlot.slice(0, 2) === targetSlot.slice(0, 2)
    ? -targetPosition
    : targetPosition;
}

function resolveTargetPokemon(
  state: BattleState,
  activeSlot: string,
  targetSlot: TargetSlot,
  moveTarget?: string
) {
  if (targetSlot === "self") return [findPokemonByActiveSlot(state, activeSlot)];
  if (targetSlot === "opponentSide") {
    const side = activeSlot.startsWith("p1") ? "p2" : "p1";
    return state.teams[side].active.filter((pokemon) => !isFainted(pokemon));
  }
  if (targetSlot === "field" && moveTarget === "allAdjacent") {
    return [...state.teams.p1.active, ...state.teams.p2.active].filter(
      (pokemon) => pokemon.slot !== activeSlot && !isFainted(pokemon)
    );
  }
  if (targetSlot === "allySide" || targetSlot === "field") return [];
  return [findPokemonByActiveSlot(state, targetSlot)];
}

function resolveMoveSource(
  state: BattleState,
  actor: ReturnType<typeof findPokemonByActiveSlot>,
  moveId: string
): PresentedMoveSource {
  if (actor.slot.startsWith(state.playerSide)) return "known";
  return actor.set.moveKnowledge?.observedMoveIds.includes(moveId) ? "confirmed" : "predicted";
}

function isFainted(pokemon: ReturnType<typeof findPokemonByActiveSlot>): boolean {
  return pokemon.hp.unit === "exact" ? pokemon.hp.current === 0 : pokemon.hp.percent === 0;
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

function presentTurnStep(
  state: BattleState,
  outcome: ShowdownActionOutcome,
  order: number
): PresentedTurnStep {
  const actorSpecies = displayLoggedPokemon(state, outcome.slot, outcome.pokemon);
  const target = outcome.target ? parseLoggedPokemon(outcome.target) : null;
  const targetSpecies = target
    ? displayLoggedPokemon(state, target.slot, target.pokemon)
    : undefined;
  const targetText = targetSpecies
    ? ` on ${target?.slot === outcome.slot ? "itself" : targetSpecies}`
    : "";
  const moveText = outcome.move
    ? `${actorSpecies} used ${outcome.move}${targetText}`
    : actorSpecies;

  let description: string;
  switch (outcome.outcome) {
    case "moved":
      description = moveText;
      break;
    case "missed":
      description = `${moveText} but missed`;
      break;
    case "failed":
      description = `${moveText} but failed`;
      break;
    case "immune":
      description = targetSpecies
        ? `${moveText}, but ${targetSpecies} was immune`
        : `${moveText} but had no effect`;
      break;
    case "switched":
      description = `${actorSpecies} switched in`;
      break;
    case "denied":
      description = formatDeniedAction(actorSpecies, outcome.reason);
      break;
    case "fainted-before-action":
      description = `${actorSpecies} fainted before it could act`;
      break;
    default:
      description = `${actorSpecies} did not act`;
  }

  return {
    order,
    side: outcome.side,
    actorSlot: outcome.slot,
    actorSpecies,
    kind: outcome.outcome,
    description,
    ...(outcome.move ? { moveName: outcome.move } : {}),
    ...(targetSpecies ? { targetSpecies } : {}),
    ...(outcome.reason ? { reason: outcome.reason } : {})
  };
}

function formatDeniedAction(actorSpecies: string, reason?: string): string {
  switch (reason) {
    case "flinch":
      return `${actorSpecies} flinched`;
    case "par":
      return `${actorSpecies} was fully paralyzed`;
    case "slp":
      return `${actorSpecies} was asleep`;
    case "frz":
      return `${actorSpecies} was frozen solid`;
    case "recharge":
      return `${actorSpecies} had to recharge`;
    case "truant":
      return `${actorSpecies} could not act because of Truant`;
    default:
      return `${actorSpecies} could not act${reason ? ` (${reason})` : ""}`;
  }
}

function parseLoggedPokemon(label: string): { slot: string; pokemon: string } | null {
  const match = /^(p[12][ab]):\s*(.+)$/.exec(label);
  return match ? { slot: match[1], pokemon: match[2] } : null;
}

function displayLoggedPokemon(state: BattleState, slot: string, fallback: string): string {
  const side = slot.slice(0, 2) as PlayerSide;
  return state.teams[side]?.active.find((pokemon) => pokemon.slot === slot)?.set.displayName ??
    state.teams[side]?.active.find((pokemon) => pokemon.slot === slot)?.set.speciesId ??
    fallback;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
