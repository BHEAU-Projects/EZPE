import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import type { RankMovesInput, SimulationSeed } from "../domain/advice.js";
import type { BattleState, BenchPokemon, PlayerSide } from "../domain/battle-state.js";
import { singleTurnBattleState } from "../fixtures/single-turn-battle-state.js";
import { createBattleSession } from "../session/battle-session.js";
import type { TurnReport } from "../session/turn-report.js";
import {
  rankMovesWithRuntime
} from "../advisor/move-ranker.js";
import {
  createRankingRuntime,
  type RankingMeasurement
} from "../advisor/ranking-runtime.js";

export const benchmarkModes = [
  "cold",
  "identical-warm",
  "changed-next-turn"
] as const;

export type BenchmarkMode = (typeof benchmarkModes)[number];

export interface BenchmarkPosition {
  name: "simple" | "normal" | "branch-heavy";
  state: BattleState;
  input: RankMovesInput;
  createNextTurnState: () => BattleState;
}

export interface BenchmarkSample {
  position: BenchmarkPosition["name"];
  mode: BenchmarkMode;
  elapsedMs: number;
  metrics: RankingMeasurement;
}

export interface BenchmarkSummary {
  position: BenchmarkPosition["name"];
  mode: BenchmarkMode;
  runs: number;
  metrics: RankingMeasurement;
  minMs: number;
  p50Ms: number;
  maxMs: number;
  p95Ms?: number;
}

const benchmarkSeeds: SimulationSeed[] = [
  [1, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
  [21, 22, 23, 24],
  [25, 26, 27, 28],
  [29, 30, 31, 32]
];

const benchmarkInput: RankMovesInput = {
  maxOpponentPlans: 4,
  seeds: benchmarkSeeds
};

export function createBenchmarkPositions(): BenchmarkPosition[] {
  const simple = structuredClone(singleTurnBattleState);
  markFainted(simple, "p1b");
  markFainted(simple, "p2b");

  const normal = structuredClone(singleTurnBattleState);

  const branchHeavy = structuredClone(singleTurnBattleState);
  branchHeavy.teams.p1.bench.push(createBenchPokemon("exact"));
  branchHeavy.teams.p2.bench.push(createBenchPokemon("percent"));

  return [
    createPosition("simple", simple),
    createPosition("normal", normal),
    createPosition("branch-heavy", branchHeavy)
  ];
}

export function runBenchmarkSample(
  position: BenchmarkPosition,
  mode: BenchmarkMode
): BenchmarkSample {
  const runtime = createRankingRuntime({ measure: true });
  let state = position.state;

  if (mode !== "cold") {
    rankMovesWithRuntime(position.state, position.input, runtime);
  }
  if (mode === "changed-next-turn") {
    state = position.createNextTurnState();
  }

  const startedAt = performance.now();
  rankMovesWithRuntime(state, position.input, runtime);
  const elapsedMs = performance.now() - startedAt;
  const metrics = runtime.lastMeasurement;
  if (!metrics) throw new Error("Expected ranking measurement output.");
  assertMeasurementInvariants(metrics);

  return {
    position: position.name,
    mode,
    elapsedMs,
    metrics
  };
}

export function summarizeBenchmarkPosition(
  position: BenchmarkPosition,
  mode: BenchmarkMode,
  runs: number
): BenchmarkSummary {
  if (!Number.isInteger(runs) || runs < 1) {
    throw new Error("Benchmark runs must be a positive integer.");
  }

  const samples = Array.from({ length: runs }, () => runBenchmarkSample(position, mode));
  const firstMetrics = samples[0].metrics;
  for (const sample of samples) {
    if (!sameMeasurement(sample.metrics, firstMetrics)) {
      throw new Error(`Non-deterministic workload metrics for ${position.name}/${mode}.`);
    }
  }

  const timings = samples.map((sample) => sample.elapsedMs).sort((a, b) => a - b);
  return {
    position: position.name,
    mode,
    runs,
    metrics: firstMetrics,
    minMs: timings[0],
    p50Ms: percentile(timings, 0.5),
    maxMs: timings[timings.length - 1],
    ...(runs >= 20 ? { p95Ms: percentile(timings, 0.95) } : {})
  };
}

export function formatBenchmarkOutput(
  summaries: BenchmarkSummary[],
  environment: {
    node: string;
    platform: string;
    architecture: string;
  } = {
    node: process.versions.node,
    platform: process.platform,
    architecture: process.arch
  }
): string {
  const lines = [
    "EZPE ranking benchmark",
    `environment node=${environment.node} platform=${environment.platform} arch=${environment.architecture}`,
    "position mode runs player_plans opponent_plans seeds requests/sample hits/sample misses/sample executions/sample hit_rate min_ms p50_ms max_ms p95_ms"
  ];

  for (const summary of summaries) {
    const { metrics } = summary;
    lines.push([
      summary.position,
      summary.mode,
      summary.runs,
      metrics.playerPlanCount,
      metrics.opponentPlanCount,
      metrics.seedCount,
      metrics.simulationRequests,
      metrics.cacheHits,
      metrics.cacheMisses,
      metrics.showdownExecutions,
      formatNumber(metrics.cacheHitRate),
      formatNumber(summary.minMs),
      formatNumber(summary.p50Ms),
      formatNumber(summary.maxMs),
      summary.p95Ms === undefined ? "-" : formatNumber(summary.p95Ms)
    ].join(" "));
  }

  return lines.join("\n");
}

function createPosition(
  name: BenchmarkPosition["name"],
  state: BattleState
): BenchmarkPosition {
  return {
    name,
    state,
    input: {
      maxOpponentPlans: benchmarkInput.maxOpponentPlans,
      seeds: benchmarkSeeds.map((seed) => [...seed] as SimulationSeed)
    },
    createNextTurnState() {
      const session = createBattleSession(state);
      return session.applyTurn(createNextTurnReport(state)).state;
    }
  };
}

function createNextTurnReport(state: BattleState): TurnReport {
  const actions: TurnReport["actions"] = [];
  const hp: TurnReport["hp"] = [];

  for (const pokemon of state.teams.p1.active) {
    if (isLiving(pokemon.hp)) {
      actions.push({
        type: "move",
        activeSlot: pokemon.slot,
        moveId: pokemon.slot === "p1a" ? "thunderbolt" : "tackle",
        targetSlot: "p2a"
      });
    }
    hp.push({
      slot: pokemon.slot,
      remainingHp: pokemon.hp.unit === "exact"
        ? { unit: "exact", current: pokemon.slot === "p1a" ? 95 : isLiving(pokemon.hp) ? 103 : 0 }
        : { unit: "percent", percent: 0 }
    });
  }

  for (const pokemon of state.teams.p2.active) {
    if (isLiving(pokemon.hp)) {
      actions.push({
        type: "move",
        activeSlot: pokemon.slot,
        moveId: pokemon.slot === "p2a" ? "tackle" : "scratch",
        targetSlot: pokemon.slot === "p2a" ? "p1a" : "p1b"
      });
    }
    hp.push({
      slot: pokemon.slot,
      remainingHp: pokemon.hp.unit === "percent"
        ? { unit: "percent", percent: pokemon.slot === "p2a" ? 48 : isLiving(pokemon.hp) ? 91 : 0 }
        : { unit: "exact", current: 0 }
    });
  }

  return {
    turnNumber: state.turnNumber,
    actions,
    hp,
    confirmedEffects: [{ kind: "status-applied", slot: "p1a", status: "par" }],
    ranking: { top: 1, maxOpponentPlans: 4 }
  };
}

function createBenchPokemon(unit: "exact" | "percent"): BenchPokemon {
  return {
    benchSlot: 0,
    set: {
      speciesId: "eevee",
      displayName: "Eevee",
      level: 50,
      itemId: null,
      abilityId: "runaway",
      moveIds: ["tackle", "protect"],
      statAlignment: "Serious",
      statPoints: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      stats: { hp: 100, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }
    },
    hp: unit === "exact"
      ? { unit: "exact", current: 100, max: 100 }
      : { unit: "percent", percent: 100 },
    status: "healthy",
    fainted: false
  };
}

function markFainted(state: BattleState, slot: "p1a" | "p1b" | "p2a" | "p2b"): void {
  const side = slot.slice(0, 2) as PlayerSide;
  const pokemon = state.teams[side].active.find((candidate) => candidate.slot === slot);
  if (!pokemon) throw new Error(`Missing benchmark slot ${slot}.`);
  pokemon.hp = pokemon.hp.unit === "exact"
    ? { ...pokemon.hp, current: 0 }
    : { unit: "percent", percent: 0 };
}

function isLiving(hp: BattleState["teams"]["p1"]["active"][number]["hp"]): boolean {
  return hp.unit === "exact" ? hp.current > 0 : hp.percent > 0;
}

function assertMeasurementInvariants(metrics: RankingMeasurement): void {
  if (metrics.simulationRequests !== metrics.cacheHits + metrics.cacheMisses) {
    throw new Error("Ranking measurement invariant failed: requests must equal hits plus misses.");
  }
  if (metrics.showdownExecutions !== metrics.cacheMisses) {
    throw new Error("Ranking measurement invariant failed: Showdown executions must equal misses.");
  }
}

function sameMeasurement(left: RankingMeasurement, right: RankingMeasurement): boolean {
  return left.playerPlanCount === right.playerPlanCount &&
    left.opponentPlanCount === right.opponentPlanCount &&
    left.seedCount === right.seedCount &&
    left.simulationRequests === right.simulationRequests &&
    left.cacheHits === right.cacheHits &&
    left.cacheMisses === right.cacheMisses &&
    left.showdownExecutions === right.showdownExecutions &&
    left.cacheHitRate === right.cacheHitRate;
}

function percentile(sortedValues: number[], percentileValue: number): number {
  const index = Math.min(sortedValues.length - 1, Math.ceil(percentileValue * sortedValues.length) - 1);
  return sortedValues[index];
}

function formatNumber(value: number): string {
  return value.toFixed(2);
}

function parseRuns(args: string[]): number {
  if (args.length === 0) return 5;
  if (args.length !== 2 || args[0] !== "--runs") {
    throw new Error("Usage: npm run benchmark:ranking -- [--runs <positive integer>]");
  }

  const runs = Number(args[1]);
  if (!Number.isInteger(runs) || runs < 1) {
    throw new Error("--runs must be a positive integer.");
  }
  return runs;
}

function runCli(): void {
  const runs = parseRuns(process.argv.slice(2));
  const summaries = createBenchmarkPositions().flatMap((position) =>
    benchmarkModes.map((mode) => summarizeBenchmarkPosition(position, mode, runs))
  );
  process.stdout.write(`${formatBenchmarkOutput(summaries)}\n`);
}

const launchedFile = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === launchedFile) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
