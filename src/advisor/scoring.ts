import type { ExplanationTag, ScoreBreakdown } from "../domain/advice.js";
import type { PlayerSide } from "../domain/battle-state.js";
import type { SingleTurnSimulationResult } from "../sim/showdown-adapter.js";
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
  config: ScoringConfig = scoringConfigStore.get()
): ScoredOutcome {
  const opponentSide = playerSide === "p1" ? "p2" : "p1";
  const damageDealt = simulation.summary.damageTakenBySide[opponentSide];
  const damageTaken = simulation.summary.damageTakenBySide[playerSide];
  const kosDealt = simulation.summary.kosTakenBySide[opponentSide];
  const kosTaken = simulation.summary.kosTakenBySide[playerSide];
  const statusesInflicted = countNewStatuses(simulation, opponentSide);
  const statusesTaken = countNewStatuses(simulation, playerSide);
  const actionsDenied = countDeniedActions(simulation, opponentSide);
  const actionsLost = countDeniedActions(simulation, playerSide);
  const statStageAdvantage = calculateStatStageAdvantage(simulation, playerSide);
  const speedControl = calculateStatStageAdvantage(simulation, playerSide, "spe");
  const fieldControl = calculateFieldControl(simulation, playerSide);
  const sideConditionAdvantage = calculateSideConditionAdvantage(simulation, playerSide);
  const forcedSwitches = simulation.summary.forcedSwitches.filter(
    (forcedSwitch) => forcedSwitch.side === opponentSide
  ).length;
  const riskPenalty =
    kosTaken * config.weights.koTakenPenalty +
    damageTaken * config.weights.damageTakenPenalty +
    statusesTaken * config.weights.majorStatusTakenPenalty +
    actionsLost * config.weights.actionLostPenalty;

  const breakdown: ScoreBreakdown = {
    damageDealt,
    damageTaken,
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
    forcedSwitches
  };

  const score =
    damageDealt * config.weights.damageDealt +
    kosDealt * config.weights.koDealt +
    statusesInflicted * config.weights.majorStatusInflicted +
    actionsDenied * config.weights.actionDenied +
    statStageAdvantage * config.weights.statStageAdvantage +
    speedControl * config.weights.speedControl +
    fieldControl * config.weights.fieldControl +
    sideConditionAdvantage * config.weights.sideConditionAdvantage +
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
  if (breakdown.damageDealt >= config.thresholds.heavyDamage) tags.push("heavy-damage");
  if (breakdown.damageTaken > 0) tags.push("took-damage");
  if (breakdown.kosTaken > 0) tags.push("high-risk");
  if (breakdown.damageTaken === 0 && breakdown.kosTaken === 0) tags.push("low-risk");
  if (breakdown.statusesInflicted > 0) tags.push("inflicted-status");
  if (breakdown.actionsDenied > 0) tags.push("action-denial");
  if (breakdown.speedControl > 0) tags.push("speed-control");
  if (breakdown.fieldControl > 0 || breakdown.sideConditionAdvantage > 0) tags.push("field-control");
  if (breakdown.forcedSwitches > 0) tags.push("forced-switch");
  if (simulation.summary.missesBySide[playerSide] > 0) tags.push("miss-risk");

  return tags;
}

function buildOutcomeSummary(breakdown: ScoreBreakdown): string {
  const parts = [
    `dealt ${breakdown.damageDealt} damage`,
    `took ${breakdown.damageTaken} damage`,
    `scored ${breakdown.kosDealt} KO(s)`,
    `lost ${breakdown.kosTaken} Pokemon`
  ];
  if (breakdown.statusesInflicted > 0) parts.push(`inflicted ${breakdown.statusesInflicted} status condition(s)`);
  if (breakdown.actionsDenied > 0) parts.push(`denied ${breakdown.actionsDenied} action(s)`);
  if (breakdown.speedControl !== 0) parts.push(`speed control ${formatSigned(breakdown.speedControl)}`);
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

function calculateStatStageAdvantage(
  simulation: SingleTurnSimulationResult,
  playerSide: PlayerSide,
  onlyStat?: "spe"
): number {
  return simulation.summary.boostChanges
    .filter((change) => !onlyStat || change.stat === onlyStat)
    .reduce(
      (total, change) => total + change.delta * (change.side === playerSide ? 1 : -1),
      0
    );
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
      const benefitsPlayer = benefitsAffectedSide
        ? change.side === playerSide
        : change.side !== playerSide;
      return total + (benefitsPlayer ? 1 : -1);
    }, 0);
}

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}
