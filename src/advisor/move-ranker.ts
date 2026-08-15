import type { ActionPlan, AdviceResult, RankMovesInput } from "../domain/advice.js";
import type { BattleState, LegalAction, PlayerSide } from "../domain/battle-state.js";
import {
  buildShowdownChoiceFromLegalActions,
  createSingleTurnSimulationInputFromBattleState,
  simulateSingleTurn
} from "../sim/showdown-adapter.js";
import { scoreSingleTurnOutcome } from "./scoring.js";

export function rankMoves(battleState: BattleState, input: RankMovesInput): AdviceResult[] {
  const actionPlans = generateActionPlans(battleState);
  const scoredResults = actionPlans.map((actionPlan) => {
    const simulation = simulateActionPlan(battleState, actionPlan, input);
    const scoredOutcome = scoreSingleTurnOutcome(simulation, battleState.playerSide);

    return {
      actionPlan,
      simulation,
      ...scoredOutcome
    };
  });

  const sortedResults = scoredResults.sort((a, b) => b.score - a.score);

  return sortedResults.map((result, index) => {
    const nextBestScore = sortedResults[index + 1]?.score ?? result.score;

    return {
      rank: index + 1,
      actionPlan: result.actionPlan,
      score: result.score,
      confidence: calculateConfidence(result.score, nextBestScore),
      explanationTags: result.explanationTags,
      outcomeSummary: result.outcomeSummary,
      debug: {
        scoreBreakdown: result.breakdown,
        simulation: result.simulation
      }
    };
  });
}

export function generateActionPlans(battleState: BattleState): ActionPlan[] {
  const playerSide = battleState.playerSide;
  const activeSlots = battleState.teams[playerSide].active.map((pokemon) => pokemon.slot).sort();
  const actionsBySlot = new Map(
    activeSlots.map((slot) => [
      slot,
      battleState.legalActions.filter((action) => action.activeSlot === slot)
    ])
  );

  for (const [slot, actions] of actionsBySlot) {
    if (actions.length === 0) {
      throw new Error(`No legal actions were provided for active slot ${slot}.`);
    }
  }

  return cartesianProduct(activeSlots.map((slot) => actionsBySlot.get(slot)!)).map((actions) => ({
    id: actions.map(formatActionId).join("|"),
    side: playerSide,
    actions,
    showdownChoice: buildShowdownChoiceFromLegalActions(actions, playerSide)
  }));
}

function simulateActionPlan(
  battleState: BattleState,
  actionPlan: ActionPlan,
  input: RankMovesInput
) {
  const choices = buildSingleTurnChoices(battleState.playerSide, actionPlan.showdownChoice, input);
  const simulationInput = createSingleTurnSimulationInputFromBattleState(battleState, choices);

  return simulateSingleTurn({
    ...simulationInput,
    seed: input.seed
  });
}

function buildSingleTurnChoices(
  playerSide: PlayerSide,
  playerChoice: string,
  input: RankMovesInput
) {
  return {
    p1Choice: playerSide === "p1" ? playerChoice : input.opponentChoice,
    p2Choice: playerSide === "p2" ? playerChoice : input.opponentChoice,
    p1TeamPreviewChoice: input.p1TeamPreviewChoice,
    p2TeamPreviewChoice: input.p2TeamPreviewChoice
  };
}

function cartesianProduct<T>(groups: T[][]): T[][] {
  return groups.reduce<T[][]>(
    (plans, group) => plans.flatMap((plan) => group.map((item) => [...plan, item])),
    [[]]
  );
}

function formatActionId(action: LegalAction): string {
  if (action.type === "switch") {
    return `${action.activeSlot}:switch:${action.speciesId}:${action.benchSlot}`;
  }

  return `${action.activeSlot}:move:${action.moveId}:${action.targetSlot}`;
}

function calculateConfidence(score: number, nextBestScore: number): number {
  return Math.min(1, Math.max(0, (score - nextBestScore) / 100));
}
