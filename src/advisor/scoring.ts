import type { ExplanationTag, ScoreBreakdown } from "../domain/advice.js";
import type { BattleState, PlayerSide } from "../domain/battle-state.js";
import type { SingleTurnSimulationResult } from "../sim/showdown-adapter.js";
import { Dex } from "../sim/showdown-runtime.js";
import { scoringConfigStore, type ScoringConfig } from "../config/scoring-config.js";

export interface ScoredOutcome {
  score: number;
  breakdown: ScoreBreakdown;
  explanationTags: ExplanationTag[];
  outcomeSummary: string;
}

export function scoreSingleTurnOutcome(
  simulation: SingleTurnSimulationResult,
  playerSide: PlayerSide,
  config: ScoringConfig = scoringConfigStore.get(),
  battleState?: BattleState
): ScoredOutcome {
  const opponentSide = playerSide === "p1" ? "p2" : "p1";
  const damageDealt = simulation.summary.damageTakenBySide[opponentSide];
  const damageTaken = simulation.summary.damageTakenBySide[playerSide];
  const damageDealtPercent = simulation.summary.damageTakenPercentBySide[opponentSide];
  const damageTakenPercent = simulation.summary.damageTakenPercentBySide[playerSide];
  const healingReceivedPercent = simulation.summary.healingPercentBySide[playerSide];
  const healingAllowedPercent = simulation.summary.healingPercentBySide[opponentSide];
  const kosDealt = simulation.summary.kosTakenBySide[opponentSide];
  const kosTaken = simulation.summary.kosTakenBySide[playerSide];
  const statusesInflicted = countNewStatuses(simulation, opponentSide);
  const statusesTaken = countNewStatuses(simulation, playerSide);
  const actionsDenied = countDeniedActions(simulation, opponentSide);
  const actionsLost = countDeniedActions(simulation, playerSide);
  const statStageAdvantage = calculateStatStageAdvantage(simulation, playerSide);
  const speedControl = calculateStatStageAdvantage(simulation, playerSide, "spe");
  const effectiveSpeedSwings = calculateEffectiveSpeedSwings(simulation, playerSide);
  const usefulBoostValue = calculateUsefulBoostValue(simulation, playerSide);
  const fieldControl = calculateFieldControl(simulation, playerSide);
  const sideConditionAdvantage = calculateSideConditionAdvantage(simulation, playerSide);
  const forcedSwitches = simulation.summary.forcedSwitches.filter(
    (forcedSwitch) => forcedSwitch.side === opponentSide
  ).length;
  const tactical = calculateTacticalValue(simulation, playerSide);
  const itemsRemoved = simulation.summary.itemChanges.filter(
    (change) => change.side === opponentSide && change.before && !change.after &&
      change.cause === "move" && change.sourceSide === playerSide
  ).length;
  const residualPressure = calculateResidualPressure(simulation, playerSide);
  const wastedActions = countWastedActions(simulation, playerSide);
  const informationConfidence = calculateInformationConfidence(battleState, playerSide);
  const riskPenalty =
    kosTaken * config.weights.koTakenPenalty +
    damageTaken * config.weights.damageTakenPenalty +
    damageTakenPercent * config.weights.normalizedDamageTakenPenalty +
    healingAllowedPercent * config.weights.healingAllowedPenalty +
    statusesTaken * config.weights.majorStatusTakenPenalty +
    actionsLost * config.weights.actionLostPenalty +
    wastedActions * config.weights.wastedActionPenalty +
    (1 - informationConfidence) * config.weights.informationUncertaintyPenalty;

  const breakdown: ScoreBreakdown = {
    damageDealt,
    damageTaken,
    damageDealtPercent,
    damageTakenPercent,
    healingReceivedPercent,
    healingAllowedPercent,
    kosDealt,
    kosTaken,
    playerRemainingHp: sumRemainingHp(simulation, playerSide),
    opponentRemainingHp: sumRemainingHp(simulation, opponentSide),
    riskPenalty,
    statusesInflicted,
    statusesTaken,
    actionsDenied,
    actionsLost,
    statStageAdvantage,
    speedControl,
    fieldControl,
    sideConditionAdvantage,
    forcedSwitches,
    effectiveSpeedSwings,
    usefulBoostValue,
    tacticalEffectValue: tactical.total,
    wastedActions,
    informationConfidence,
    itemsRemoved,
    residualPressure,
    allySynergy: tactical.allySynergy
  };

  const score =
    damageDealt * config.weights.damageDealt +
    damageDealtPercent * config.weights.normalizedDamageDealt +
    kosDealt * config.weights.koDealt +
    healingReceivedPercent * config.weights.healingReceived +
    statusesInflicted * config.weights.majorStatusInflicted +
    actionsDenied * config.weights.actionDenied +
    statStageAdvantage * config.weights.statStageAdvantage +
    speedControl * config.weights.speedControl +
    usefulBoostValue * config.weights.usefulBoost +
    effectiveSpeedSwings * config.weights.speedOrderSwing +
    fieldControl * config.weights.fieldControl +
    sideConditionAdvantage * config.weights.sideConditionAdvantage +
    (fieldControl + sideConditionAdvantage) * config.weights.fieldTurnAdvantage +
    tactical.restrictions * config.weights.actionRestriction +
    tactical.allySynergy * config.weights.allySynergy +
    itemsRemoved * config.weights.itemRemoval +
    residualPressure * config.weights.residualPressure +
    forcedSwitches * config.weights.forcedSwitch -
    riskPenalty;
  const explanationTags = buildExplanationTags(breakdown, simulation, playerSide, config);

  return {
    score,
    breakdown,
    explanationTags,
    outcomeSummary: buildOutcomeSummary(breakdown)
  };
}

function sumRemainingHp(simulation: SingleTurnSimulationResult, side: PlayerSide): number {
  return simulation.summary.hpByPokemon
    .filter((pokemon) => pokemon.side === side)
    .reduce((totalHp, pokemon) => totalHp + pokemon.remainingHp, 0);
}

function buildExplanationTags(
  breakdown: ScoreBreakdown,
  simulation: SingleTurnSimulationResult,
  playerSide: PlayerSide,
  config: ScoringConfig
): ExplanationTag[] {
  const tags: ExplanationTag[] = [];

  if (breakdown.kosDealt > 0) tags.push("confirmed-ko");
  if (breakdown.damageDealtPercent >= config.thresholds.heavyDamage) tags.push("heavy-damage");
  if (breakdown.damageTakenPercent > 0) tags.push("took-damage");
  if (breakdown.kosTaken > 0) tags.push("high-risk");
  if (breakdown.damageTakenPercent === 0 && breakdown.kosTaken === 0) tags.push("low-risk");
  if (breakdown.statusesInflicted > 0) tags.push("inflicted-status");
  if (breakdown.actionsDenied > 0) tags.push("action-denial");
  if (breakdown.effectiveSpeedSwings > 0) tags.push("speed-control", "order-swing");
  if (breakdown.fieldControl > 0 || breakdown.sideConditionAdvantage > 0) tags.push("field-control");
  if (breakdown.forcedSwitches > 0) tags.push("forced-switch");
  if (simulation.summary.missesBySide[playerSide] > 0) tags.push("miss-risk");
  if (breakdown.healingReceivedPercent > 0) tags.push("healing");
  if (breakdown.usefulBoostValue > 0) tags.push("useful-setup");
  if (breakdown.wastedActions > 0) tags.push("wasted-action");
  if (breakdown.allySynergy > 0) tags.push("ally-synergy");
  if (breakdown.itemsRemoved > 0) tags.push("item-denial");
  if (breakdown.residualPressure > 0) tags.push("residual-pressure");

  return [...new Set(tags)];
}

function buildOutcomeSummary(breakdown: ScoreBreakdown): string {
  const parts = [
    `dealt ${round(breakdown.damageDealtPercent)}%`,
    `took ${round(breakdown.damageTakenPercent)}%`,
    `scored ${breakdown.kosDealt} KO(s)`,
    `lost ${breakdown.kosTaken} Pokemon`
  ];
  if (breakdown.healingReceivedPercent > 0) parts.push(`healed ${round(breakdown.healingReceivedPercent)}%`);
  if (breakdown.statusesInflicted > 0) parts.push(`inflicted ${breakdown.statusesInflicted} status condition(s)`);
  if (breakdown.actionsDenied > 0) parts.push(`denied ${breakdown.actionsDenied} action(s)`);
  if (breakdown.effectiveSpeedSwings !== 0) parts.push(`order swings ${formatSigned(breakdown.effectiveSpeedSwings)}`);
  if (breakdown.forcedSwitches > 0) parts.push(`forced ${breakdown.forcedSwitches} switch(es)`);
  return parts.join(", ");
}

function countNewStatuses(simulation: SingleTurnSimulationResult, side: PlayerSide): number {
  return simulation.summary.statusChanges.filter(
    (change) => change.side === side && change.before === "healthy" && change.after !== "healthy"
  ).length;
}

function countDeniedActions(simulation: SingleTurnSimulationResult, side: PlayerSide): number {
  return simulation.summary.actionOutcomes.filter(
    (outcome) => outcome.side === side && outcome.outcome === "denied"
  ).length;
}

function countWastedActions(simulation: SingleTurnSimulationResult, side: PlayerSide): number {
  const explicit = simulation.summary.actionOutcomes.filter(
    (outcome) => outcome.side === side && ["failed", "immune", "missed"].includes(outcome.outcome)
  ).length;
  const dex = Dex.forFormat(simulation.formatId);
  const noEffectStatusMoves = simulation.summary.actionOutcomes.filter((outcome) => {
    if (outcome.side !== side || outcome.outcome !== "moved" || !outcome.move) return false;
    const move = dex.moves.get(outcome.move);
    if (move.category !== "Status" || !["self", "allySide", "allies"].includes(move.target)) return false;
    const changed =
      simulation.healingEvents.some((event) => event.sourceSlot === outcome.slot) ||
      simulation.summary.boostChanges.some((change) => change.slot === outcome.slot) ||
      simulation.summary.statusChanges.some((change) => change.slot === outcome.slot) ||
      simulation.summary.volatileChanges.some(
        (change) => change.slot === outcome.slot && change.change === "started"
      ) ||
      simulation.summary.tacticalEffects.some((effect) => effect.slot === outcome.slot) ||
      simulation.summary.conditionChanges.some(
        (change) => change.sourceSide === side && change.change !== "ended"
      );
    return !changed;
  }).length;
  return explicit + noEffectStatusMoves;
}

function calculateStatStageAdvantage(
  simulation: SingleTurnSimulationResult,
  playerSide: PlayerSide,
  onlyStat?: "spe"
): number {
  return simulation.summary.boostChanges
    .filter((change) => !onlyStat || change.stat === onlyStat)
    .reduce((total, change) => total + change.delta * (change.side === playerSide ? 1 : -1), 0);
}

function calculateUsefulBoostValue(
  simulation: SingleTurnSimulationResult,
  playerSide: PlayerSide
): number {
  const finalBySlot = new Map(simulation.finalState.pokemon.map((pokemon) => [pokemon.slot, pokemon]));
  return simulation.summary.boostChanges
    .filter((change) => change.stat !== "spe")
    .reduce((total, change) => {
      const final = finalBySlot.get(change.slot);
      if (!final || final.fainted) return total;
      const signed = change.delta * (change.side === playerSide ? 1 : -1);
      return total + Math.max(0, signed);
    }, 0);
}

function calculateEffectiveSpeedSwings(
  simulation: SingleTurnSimulationResult,
  playerSide: PlayerSide
): number {
  const opponentSide = playerSide === "p1" ? "p2" : "p1";
  const finalBySlot = new Map(simulation.finalState.pokemon.map((pokemon) => [pokemon.slot, pokemon]));
  const own = simulation.initialState.pokemon.filter(
    (pokemon) => pokemon.side === playerSide && /^p[12][ab]$/.test(pokemon.slot) && !pokemon.fainted
  );
  const opponents = simulation.initialState.pokemon.filter(
    (pokemon) => pokemon.side === opponentSide && /^p[12][ab]$/.test(pokemon.slot) && !pokemon.fainted
  );
  const beforeTrickRoom = (simulation.initialState.pseudoWeather.trickroom ?? 0) > 0;
  const afterTrickRoom = (simulation.finalState.pseudoWeather.trickroom ?? 0) > 0;
  let swings = 0;

  for (const playerPokemon of own) {
    const playerAfter = finalBySlot.get(playerPokemon.slot);
    if (!playerAfter || playerAfter.pokemon !== playerPokemon.pokemon || playerAfter.fainted) continue;
    for (const opponentPokemon of opponents) {
      const opponentAfter = finalBySlot.get(opponentPokemon.slot);
      if (!opponentAfter || opponentAfter.pokemon !== opponentPokemon.pokemon || opponentAfter.fainted) continue;
      const before = actsBefore(playerPokemon.actionSpeed, opponentPokemon.actionSpeed, beforeTrickRoom);
      const after = actsBefore(playerAfter.actionSpeed, opponentAfter.actionSpeed, afterTrickRoom);
      if (!before && after) swings += 1;
      if (before && !after) swings -= 1;
    }
  }
  return swings;
}

function actsBefore(playerSpeed: number, opponentSpeed: number, trickRoom: boolean): boolean {
  if (playerSpeed === opponentSpeed) return false;
  return trickRoom ? playerSpeed < opponentSpeed : playerSpeed > opponentSpeed;
}

function calculateFieldControl(simulation: SingleTurnSimulationResult, playerSide: PlayerSide): number {
  return simulation.summary.conditionChanges
    .filter((change) => change.scope === "field" && change.change !== "ended" && change.sourceSide)
    .reduce((total, change) => total + (change.sourceSide === playerSide ? 1 : -1), 0);
}

function calculateSideConditionAdvantage(
  simulation: SingleTurnSimulationResult,
  playerSide: PlayerSide
): number {
  const hazards = new Set(["stealthrock", "spikes", "toxicspikes", "stickyweb"]);
  return simulation.summary.conditionChanges
    .filter((change) => change.scope === "side" && change.change === "started" && change.side)
    .reduce((total, change) => {
      const benefitsAffectedSide = !hazards.has(change.conditionId);
      if (benefitsAffectedSide && !screenIsRelevant(simulation, change.conditionId, change.side!)) return total;
      const benefitsPlayer = benefitsAffectedSide ? change.side === playerSide : change.side !== playerSide;
      return total + (benefitsPlayer ? 1 : -1);
    }, 0);
}

function screenIsRelevant(
  simulation: SingleTurnSimulationResult,
  conditionId: string,
  protectedSide: PlayerSide
): boolean {
  if (!["reflect", "lightscreen", "auroraveil"].includes(conditionId)) return true;
  const attackingSide = protectedSide === "p1" ? "p2" : "p1";
  const dex = Dex.forFormat(simulation.formatId);
  return simulation.summary.movesBySide[attackingSide].some((event) => {
    const category = dex.moves.get(event.move).category;
    return conditionId === "auroraveil" ||
      (conditionId === "reflect" && category === "Physical") ||
      (conditionId === "lightscreen" && category === "Special");
  });
}

function calculateTacticalValue(
  simulation: SingleTurnSimulationResult,
  playerSide: PlayerSide
): { total: number; restrictions: number; allySynergy: number } {
  let total = 0;
  let restrictions = 0;
  let allySynergy = 0;
  for (const effect of simulation.summary.tacticalEffects) {
    const value = effect.side === playerSide ? 1 : -1;
    if (effect.kind === "action-restriction") {
      const restrictionValue = -value;
      restrictions += restrictionValue;
      total += restrictionValue;
    } else {
      total += value;
      if (effect.kind === "ally-synergy") allySynergy += value;
    }
  }
  return { total, restrictions, allySynergy };
}

function calculateResidualPressure(simulation: SingleTurnSimulationResult, playerSide: PlayerSide): number {
  const opponentSide = playerSide === "p1" ? "p2" : "p1";
  const persistent = new Set(["leechseed", "saltcure", "partiallytrapped"]);
  const started = simulation.summary.volatileChanges.filter(
    (change) => change.side === opponentSide && change.change === "started" && persistent.has(change.effectId)
  ).length;
  const activeDamage = simulation.damageEvents.filter(
    (event) => event.side === opponentSide && event.cause === "residual" && event.sourceSide === playerSide
  ).length;
  return started + activeDamage;
}

function calculateInformationConfidence(
  state: BattleState | undefined,
  playerSide: PlayerSide
): number {
  if (!state || state.battleContext === "vgc-open-sheet") return 1;
  const opponentSide = playerSide === "p1" ? "p2" : "p1";
  const pokemon = [...state.teams[opponentSide].active, ...state.teams[opponentSide].bench];
  if (pokemon.length === 0) return 1;
  const observed = pokemon.reduce(
    (total, member) => total + (member.set.moveKnowledge?.observedMoveIds.length ?? 0),
    0
  );
  const possible = pokemon.reduce((total, member) => total + Math.max(1, member.set.moveIds.length), 0);
  return Math.min(1, 0.5 + 0.5 * observed / possible);
}

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
