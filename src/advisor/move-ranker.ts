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

const simulationCache = new Map<string, ReturnType<typeof simulateSingleTurn>>();
const maxSimulationCacheEntries = 2_000;

export function rankMoves(battleState: BattleState, input: RankMovesInput): AdviceResult[] {
  const opponentSide = battleState.playerSide === "p1" ? "p2" : "p1";
  if (!hasLivingActive(battleState, battleState.playerSide) || !hasLivingActive(battleState, opponentSide)) {
    return [];
  }

  const actionPlans = generateActionPlansForSide(battleState, battleState.playerSide);
  const opponentPlans = getOpponentPlans(battleState, input);
  const seeds = getSimulationSeeds(input);
  const scoringConfig = scoringConfigStore.get();
  const stateCacheKey = JSON.stringify(battleState);
  const scoredResults = actionPlans.map((actionPlan) => {
    const scenarios = opponentPlans.map((opponentPlan) => {
      const branches = seeds.map((seed) => {
        const simulation = simulateActionPlan(
          battleState,
          actionPlan,
          opponentPlan.showdownChoice,
          input,
          seed,
          stateCacheKey
        );
        return {
          opponentPlan,
          simulation,
          scoredOutcome: scoreSingleTurnOutcome(
            simulation,
            battleState.playerSide,
            scoringConfig,
            battleState
          )
        };
      });
      return {
        opponentPlan,
        branches,
        mechanicsExpectedScore: average(branches.map((branch) => branch.scoredOutcome.score)),
        mechanicsWorstScore: Math.min(...branches.map((branch) => branch.scoredOutcome.score))
      };
    });
    const allBranches = scenarios.flatMap((scenario) => scenario.branches);
    const worstScenario = scenarios.reduce((worst, scenario) =>
      scenario.mechanicsExpectedScore < worst.mechanicsExpectedScore ? scenario : worst
    );
    const worstBranch = worstScenario.branches.reduce((worst, branch) =>
      branch.scoredOutcome.score < worst.scoredOutcome.score ? branch : worst
    );
    const representativeBranch = worstScenario.branches.reduce((nearest, branch) =>
      Math.abs(branch.scoredOutcome.score - worstScenario.mechanicsExpectedScore) <
      Math.abs(nearest.scoredOutcome.score - worstScenario.mechanicsExpectedScore)
        ? branch
        : nearest
    );
    const scores = allBranches.map((branch) => branch.scoredOutcome.score);
    const scenarioMeanScore = average(scenarios.map((scenario) => scenario.mechanicsExpectedScore));
    const mechanicsExpectedScore = worstScenario.mechanicsExpectedScore;
    const worstResponseScore = worstScenario.mechanicsExpectedScore;
    const worstCaseScore = Math.min(...scores);
    const bestCaseScore = Math.max(...scores);
    const aggregateScore =
      scenarioMeanScore * scoringConfig.opponentAggregation.expectedWeight +
      worstResponseScore * scoringConfig.opponentAggregation.worstCaseWeight;

    return {
      actionPlan,
      score: aggregateScore,
      simulation: worstBranch.simulation,
      turnOrderSimulation: representativeBranch.simulation,
      breakdown: worstBranch.scoredOutcome.breakdown,
      explanationTags: worstBranch.scoredOutcome.explanationTags,
      outcomeSummary: `mechanics expectation ${roundScore(mechanicsExpectedScore)}, scenario mean ${roundScore(scenarioMeanScore)}, worst response ${roundScore(worstResponseScore)}; ${worstBranch.scoredOutcome.outcomeSummary}`,
      branchScores: scenarios.flatMap((scenario) =>
        scenario.branches.map((branch) => branch.scoredOutcome.score)
      ),
      opponentEvaluation: {
        expectedScore: scenarioMeanScore,
        worstCaseScore,
        bestCaseScore,
        mechanicsExpectedScore,
        scenarioMeanScore,
        worstResponseScore,
        branchAgreement: 0,
        responseCount: opponentPlans.length,
        simulationCount: allBranches.length,
        worstOpponentChoice: worstScenario.opponentPlan.showdownChoice
      }
    };
  });

  const bestResultByPlan = new Map<string, (typeof scoredResults)[number]>();
  for (const result of scoredResults) {
    const key = semanticPlanKey(result.actionPlan);
    const existing = bestResultByPlan.get(key);
    if (!existing || result.score > existing.score || (
      result.score === existing.score && specialMechanicCount(result.actionPlan) < specialMechanicCount(existing.actionPlan)
    )) {
      bestResultByPlan.set(key, result);
    }
  }
  const sortedResults = [...bestResultByPlan.values()].sort((a, b) => b.score - a.score);

  return sortedResults.map((result, index) => {
    const nextBestScore = sortedResults[index + 1]?.score ?? result.score;
    const branchAgreement = calculateBranchAgreement(result, sortedResults);
    result.opponentEvaluation.branchAgreement = branchAgreement;

    return {
      rank: index + 1,
      actionPlan: result.actionPlan,
      score: result.score,
      confidence: calculateConfidence(
        result.score,
        nextBestScore,
        scoringConfig.confidenceScoreGap,
        branchAgreement,
        result.breakdown.informationConfidence
      ),
      explanationTags: result.explanationTags,
      outcomeSummary: result.outcomeSummary,
      debug: {
        scoreBreakdown: result.breakdown,
        simulation: result.simulation,
        turnOrderSimulation: result.turnOrderSimulation,
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
  const activeSlots = battleState.teams[side].active
    .filter((pokemon) => !isFainted(pokemon.hp))
    .map((pokemon) => pokemon.slot)
    .sort();
  if (activeSlots.length === 0) return [];
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
  seed: SimulationSeed,
  stateCacheKey: string
) {
  const choices = buildSingleTurnChoices(
    battleState.playerSide,
    actionPlan.showdownChoice,
    opponentChoice,
    input
  );
  const simulationInput = createSingleTurnSimulationInputFromBattleState(battleState, choices);

  const cacheKey = `${stateCacheKey}|${actionPlan.showdownChoice}|${opponentChoice}|${seed.join(",")}`;
  const cached = simulationCache.get(cacheKey);
  if (cached) return cached;
  const simulation = simulateSingleTurn({ ...simulationInput, seed });
  simulationCache.set(cacheKey, simulation);
  if (simulationCache.size > maxSimulationCacheEntries) {
    simulationCache.delete(simulationCache.keys().next().value!);
  }
  return simulation;
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
    return score + move.basePower + move.effectScore + Math.max(0, move.priority) * 20 + (move.basePower === 0 ? 5 : 0);
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
    [5, 6, 7, 8],
    [9, 10, 11, 12],
    [13, 14, 15, 16],
    [17, 18, 19, 20],
    [21, 22, 23, 24],
    [25, 26, 27, 28],
    [29, 30, 31, 32]
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

function semanticPlanKey(plan: ActionPlan): string {
  return plan.actions.map((action) => action.type === "switch"
    ? `${action.activeSlot}:switch:${action.speciesId}:${action.benchSlot}`
    : `${action.activeSlot}:move:${action.moveId}:${action.targetSlot}`
  ).join("|");
}

function specialMechanicCount(plan: ActionPlan): number {
  return plan.actions.filter((action) => action.type === "move" && action.specialMechanic).length;
}

function isValidCombinedPlan(actions: LegalAction[]): boolean {
  const switchSlots = actions
    .filter((action) => action.type === "switch")
    .map((action) => action.benchSlot);
  if (new Set(switchSlots).size !== switchSlots.length) return false;

  return actions.filter((action) => action.type === "move" && action.specialMechanic).length <= 1;
}

function calculateConfidence(
  score: number,
  nextBestScore: number,
  scoreGap: number,
  branchAgreement: number,
  informationConfidence: number
): number {
  const gapConfidence = Math.min(1, Math.max(0, (score - nextBestScore) / scoreGap));
  return (gapConfidence + branchAgreement + informationConfidence) / 3;
}

function calculateBranchAgreement<T extends { branchScores: number[] }>(
  result: T,
  allResults: T[]
): number {
  if (result.branchScores.length === 0) return 0;
  const wins = result.branchScores.filter((score, index) =>
    score >= Math.max(...allResults.map((candidate) => candidate.branchScores[index] ?? -Infinity))
  ).length;
  return wins / result.branchScores.length;
}

function hasLivingActive(battleState: BattleState, side: PlayerSide): boolean {
  return battleState.teams[side].active.some((pokemon) => !isFainted(pokemon.hp));
}

function isFainted(hp: BattleState["teams"][PlayerSide]["active"][number]["hp"]): boolean {
  return hp.unit === "exact" ? hp.current === 0 : hp.percent === 0;
}
