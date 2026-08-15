import type {
  ActionPlan,
  AdviceResult,
  RankMovesInput,
  SimulationSeed
} from "../domain/advice.js";
import type { BattleState, LegalAction, PlayerSide } from "../domain/battle-state.js";
import { pokemonDataService } from "../data/pokemon-data-service.js";
import { scoringConfigStore } from "../config/scoring-config.js";
import {
  buildShowdownChoiceFromLegalActions,
  createSingleTurnSimulationInputFromBattleState,
  simulateSingleTurn
} from "../sim/showdown-adapter.js";
import { scoreSingleTurnOutcome } from "./scoring.js";
import { generateLegalActions } from "./legal-action-generator.js";

export function rankMoves(battleState: BattleState, input: RankMovesInput): AdviceResult[] {
  const actionPlans = generateActionPlansForSide(battleState, battleState.playerSide);
  const opponentPlans = getOpponentPlans(battleState, input);
  const seeds = getSimulationSeeds(input);
  const scoringConfig = scoringConfigStore.get();
  const scoredResults = actionPlans.map((actionPlan) => {
    const branches = opponentPlans.flatMap((opponentPlan) =>
      seeds.map((seed) => {
        const simulation = simulateActionPlan(
          battleState,
          actionPlan,
          opponentPlan.showdownChoice,
          input,
          seed
        );
        return {
          opponentPlan,
          simulation,
          scoredOutcome: scoreSingleTurnOutcome(
            simulation,
            battleState.playerSide,
            scoringConfig
          )
        };
      })
    );
    const worstBranch = branches.reduce((worst, branch) =>
      branch.scoredOutcome.score < worst.scoredOutcome.score ? branch : worst
    );
    const scores = branches.map((branch) => branch.scoredOutcome.score);
    const expectedScore = average(scores);
    const worstCaseScore = Math.min(...scores);
    const bestCaseScore = Math.max(...scores);
    const aggregateScore =
      expectedScore * scoringConfig.opponentAggregation.expectedWeight +
      worstCaseScore * scoringConfig.opponentAggregation.worstCaseWeight;

    return {
      actionPlan,
      score: aggregateScore,
      simulation: worstBranch.simulation,
      breakdown: worstBranch.scoredOutcome.breakdown,
      explanationTags: worstBranch.scoredOutcome.explanationTags,
      outcomeSummary: `expected score ${roundScore(expectedScore)}, worst case ${roundScore(worstCaseScore)}; ${worstBranch.scoredOutcome.outcomeSummary}`,
      opponentEvaluation: {
        expectedScore,
        worstCaseScore,
        bestCaseScore,
        responseCount: opponentPlans.length,
        simulationCount: branches.length,
        worstOpponentChoice: worstBranch.opponentPlan.showdownChoice
      }
    };
  });

  const sortedResults = scoredResults.sort((a, b) => b.score - a.score);

  return sortedResults.map((result, index) => {
    const nextBestScore = sortedResults[index + 1]?.score ?? result.score;

    return {
      rank: index + 1,
      actionPlan: result.actionPlan,
      score: result.score,
      confidence: calculateConfidence(
        result.score,
        nextBestScore,
        scoringConfig.confidenceScoreGap
      ),
      explanationTags: result.explanationTags,
      outcomeSummary: result.outcomeSummary,
      debug: {
        scoreBreakdown: result.breakdown,
        simulation: result.simulation,
        opponentEvaluation: result.opponentEvaluation
      }
    };
  });
}

export function generateActionPlans(battleState: BattleState): ActionPlan[] {
  return generateActionPlansForSide(battleState, battleState.playerSide);
}

export function generateActionPlansForSide(
  battleState: BattleState,
  side: PlayerSide
): ActionPlan[] {
  const activeSlots = battleState.teams[side].active.map((pokemon) => pokemon.slot).sort();
  const legalActions = generateLegalActions(battleState, side);
  const actionsBySlot = new Map(
    activeSlots.map((slot) => [
      slot,
      legalActions.filter((action) => action.activeSlot === slot)
    ])
  );

  for (const [slot, actions] of actionsBySlot) {
    if (actions.length === 0) {
      throw new Error(`No legal actions were provided for active slot ${slot}.`);
    }
  }

  return cartesianProduct(activeSlots.map((slot) => actionsBySlot.get(slot)!))
    .filter(isValidCombinedPlan)
    .map((actions) => ({
      id: actions.map(formatActionId).join("|"),
      side,
      actions,
      showdownChoice: buildShowdownChoiceFromLegalActions(
        actions,
        side,
        battleState.teams[side]
      )
    }));
}

function simulateActionPlan(
  battleState: BattleState,
  actionPlan: ActionPlan,
  opponentChoice: string,
  input: RankMovesInput,
  seed: SimulationSeed
) {
  const choices = buildSingleTurnChoices(
    battleState.playerSide,
    actionPlan.showdownChoice,
    opponentChoice,
    input
  );
  const simulationInput = createSingleTurnSimulationInputFromBattleState(battleState, choices);

  return simulateSingleTurn({
    ...simulationInput,
    seed
  });
}

function buildSingleTurnChoices(
  playerSide: PlayerSide,
  playerChoice: string,
  opponentChoice: string,
  input: RankMovesInput
) {
  return {
    p1Choice: playerSide === "p1" ? playerChoice : opponentChoice,
    p2Choice: playerSide === "p2" ? playerChoice : opponentChoice,
    p1TeamPreviewChoice: input.p1TeamPreviewChoice,
    p2TeamPreviewChoice: input.p2TeamPreviewChoice
  };
}

function getOpponentPlans(battleState: BattleState, input: RankMovesInput): ActionPlan[] {
  const opponentSide = battleState.playerSide === "p1" ? "p2" : "p1";
  const suppliedChoices = input.opponentChoices ??
    (input.opponentChoice ? [input.opponentChoice] : undefined);

  if (suppliedChoices) {
    if (suppliedChoices.length === 0) throw new Error("opponentChoices cannot be empty.");
    return suppliedChoices.map((showdownChoice, index) => ({
      id: `supplied-opponent-${index + 1}`,
      side: opponentSide,
      actions: [],
      showdownChoice
    }));
  }

  const maxOpponentPlans = input.maxOpponentPlans ?? 24;
  if (!Number.isInteger(maxOpponentPlans) || maxOpponentPlans < 1) {
    throw new Error("maxOpponentPlans must be a positive integer.");
  }

  return generateActionPlansForSide(battleState, opponentSide)
    .sort((a, b) =>
      scoreOpponentPlanPriority(battleState, b) - scoreOpponentPlanPriority(battleState, a) ||
      a.id.localeCompare(b.id)
    )
    .slice(0, maxOpponentPlans);
}

function scoreOpponentPlanPriority(battleState: BattleState, plan: ActionPlan): number {
  return plan.actions.reduce((score, action) => {
    if (action.type === "switch") return score + 10;
    const move = pokemonDataService.getMove(battleState.regulationId, action.moveId);
    if (!move) return score;
    return score + move.basePower + Math.max(0, move.priority) * 20 + (move.basePower === 0 ? 5 : 0);
  }, 0);
}

function getSimulationSeeds(input: RankMovesInput): SimulationSeed[] {
  if (input.seeds) {
    if (input.seeds.length === 0) throw new Error("seeds cannot be empty.");
    return input.seeds;
  }
  if (input.seed) return [input.seed];
  return [
    [1, 2, 3, 4],
    [5, 6, 7, 8]
  ];
}

function average(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function roundScore(score: number): number {
  return Math.round(score * 100) / 100;
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

  return `${action.activeSlot}:move:${action.moveId}:${action.targetSlot}:${action.specialMechanic?.kind ?? "standard"}`;
}

function isValidCombinedPlan(actions: LegalAction[]): boolean {
  const switchSlots = actions
    .filter((action) => action.type === "switch")
    .map((action) => action.benchSlot);
  if (new Set(switchSlots).size !== switchSlots.length) return false;

  return actions.filter((action) => action.type === "move" && action.specialMechanic).length <= 1;
}

function calculateConfidence(score: number, nextBestScore: number, scoreGap: number): number {
  return Math.min(1, Math.max(0, (score - nextBestScore) / scoreGap));
}
