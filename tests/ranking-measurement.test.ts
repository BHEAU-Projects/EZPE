import { describe, expect, it } from "vitest";

import {
  rankMoves,
  rankMovesWithRuntime
} from "../src/advisor/move-ranker.js";
import { singleTurnBattleState, singleTurnChoices } from "../src/fixtures/single-turn-battle-state.js";
import { createRankingRuntime } from "../src/advisor/ranking-runtime.js";

const focusedInput = {
  opponentChoice: singleTurnChoices.p2Choice,
  seed: [1, 2, 3, 4] as const
};

function runMeasured(runtime: ReturnType<typeof createRankingRuntime>) {
  const results = rankMovesWithRuntime(singleTurnBattleState, focusedInput, runtime);
  const metrics = runtime.lastMeasurement;
  if (!metrics) throw new Error("Expected ranking measurement.");
  return { results, metrics };
}

describe("ranking measurement runtime", () => {
  it("preserves complete deterministic advice results", () => {
    const ordinary = rankMoves(singleTurnBattleState, focusedInput);
    const runtime = createRankingRuntime({ measure: true });

    expect(normalizeSimulationTimestamps(runMeasured(runtime).results)).toEqual(
      normalizeSimulationTimestamps(ordinary)
    );
  });

  it("distinguishes cold, identical warm, and reset measurements", () => {
    const runtime = createRankingRuntime({ measure: true });

    const cold = runMeasured(runtime).metrics;
    const warm = runMeasured(runtime).metrics;
    runtime.resetCache();
    const resetCold = runMeasured(runtime).metrics;

    expect(cold).toMatchObject({
      playerPlanCount: 9,
      opponentPlanCount: 1,
      seedCount: 1,
      simulationRequests: 9,
      cacheHits: 0,
      cacheMisses: 9,
      showdownExecutions: 9,
      cacheHitRate: 0
    });
    expect(warm).toMatchObject({
      simulationRequests: 9,
      cacheHits: 9,
      cacheMisses: 0,
      showdownExecutions: 0,
      cacheHitRate: 1
    });
    expect(resetCold).toMatchObject(cold);
  });

  it("treats a changed battle state as a new simulation-cache workload", () => {
    const runtime = createRankingRuntime({ measure: true });
    runMeasured(runtime);

    const changedState = structuredClone(singleTurnBattleState);
    changedState.turnNumber = 2;
    changedState.teams.p2.active[0].hp = { unit: "percent", percent: 75 };
    const changedResults = rankMovesWithRuntime(changedState, focusedInput, runtime);
    const metrics = runtime.lastMeasurement;
    if (!metrics) throw new Error("Expected changed-state ranking measurement.");

    expect(normalizeSimulationTimestamps(changedResults)).toEqual(
      normalizeSimulationTimestamps(rankMoves(changedState, focusedInput))
    );
    expect(metrics).toMatchObject({
      simulationRequests: 9,
      cacheHits: 0,
      cacheMisses: 9,
      showdownExecutions: 9,
      cacheHitRate: 0
    });
    expect(metrics.simulationRequests).toBe(metrics.cacheHits + metrics.cacheMisses);
    expect(metrics.showdownExecutions).toBe(metrics.cacheMisses);
  });
});

function normalizeSimulationTimestamps(value: unknown): unknown {
  if (typeof value === "string") {
    return /^\|t:\|\d+$/.test(value) ? "|t:|<runtime-timestamp>" : value;
  }
  if (Array.isArray(value)) return value.map(normalizeSimulationTimestamps);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeSimulationTimestamps(entry)])
    );
  }
  return value;
}
