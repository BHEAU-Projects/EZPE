import type { ExplanationTag, ScoreBreakdown } from "../domain/advice.js";
import type { PlayerSide } from "../domain/battle-state.js";
import type { SingleTurnSimulationResult } from "../sim/showdown-adapter.js";

export interface ScoredOutcome {
  score: number;
  breakdown: ScoreBreakdown;
  explanationTags: ExplanationTag[];
  outcomeSummary: string;
}

export function scoreSingleTurnOutcome(
  simulation: SingleTurnSimulationResult,
  playerSide: PlayerSide
): ScoredOutcome {
  const opponentSide = playerSide === "p1" ? "p2" : "p1";
  const damageDealt = simulation.summary.damageTakenBySide[opponentSide];
  const damageTaken = simulation.summary.damageTakenBySide[playerSide];
  const kosDealt = simulation.summary.kosTakenBySide[opponentSide];
  const kosTaken = simulation.summary.kosTakenBySide[playerSide];
  const riskPenalty = kosTaken * 120 + damageTaken;

  const breakdown: ScoreBreakdown = {
    damageDealt,
    damageTaken,
    kosDealt,
    kosTaken,
    playerRemainingHp: sumRemainingHp(simulation, playerSide),
    opponentRemainingHp: sumRemainingHp(simulation, opponentSide),
    riskPenalty
  };

  const score = damageDealt + kosDealt * 100 - riskPenalty;
  const explanationTags = buildExplanationTags(breakdown);

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

function buildExplanationTags(breakdown: ScoreBreakdown): ExplanationTag[] {
  const tags: ExplanationTag[] = [];

  if (breakdown.kosDealt > 0) tags.push("confirmed-ko");
  if (breakdown.damageDealt >= 50) tags.push("heavy-damage");
  if (breakdown.damageTaken > 0) tags.push("took-damage");
  if (breakdown.kosTaken > 0) tags.push("high-risk");
  if (breakdown.damageTaken === 0 && breakdown.kosTaken === 0) tags.push("low-risk");

  return tags;
}

function buildOutcomeSummary(breakdown: ScoreBreakdown): string {
  return [
    `dealt ${breakdown.damageDealt} damage`,
    `took ${breakdown.damageTaken} damage`,
    `scored ${breakdown.kosDealt} KO(s)`,
    `lost ${breakdown.kosTaken} Pokemon`
  ].join(", ");
}
