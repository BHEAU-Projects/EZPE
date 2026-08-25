import { describe, expect, it } from "vitest";

import {
  createBenchmarkPositions,
  runBenchmarkSample,
  summarizeBenchmarkPosition
} from "../src/benchmark/ranking.js";

describe("ranking benchmark positions and modes", () => {
  it("builds the three positions with one constant opponent-plan budget", () => {
    const positions = createBenchmarkPositions();

    expect(positions.map((position) => position.name)).toEqual([
      "simple",
      "normal",
      "branch-heavy"
    ]);
    expect(new Set(positions.map((position) => position.input.maxOpponentPlans))).toEqual(new Set([4]));

    const simple = positions[0].state;
    expect(simple.teams.p1.active.filter((pokemon) => pokemon.hp.unit === "exact" && pokemon.hp.current > 0)).toHaveLength(1);
    expect(simple.teams.p2.active.filter((pokemon) => pokemon.hp.unit === "percent" && pokemon.hp.percent > 0)).toHaveLength(1);

    const branchHeavy = positions[2].state;
    expect(branchHeavy.teams.p1.bench).toHaveLength(1);
    expect(branchHeavy.teams.p2.bench).toHaveLength(1);
  });

  it("isolates cold, identical-warm, and changed-next-turn samples", () => {
    const position = createBenchmarkPositions()[1];

    const cold = runBenchmarkSample(position, "cold");
    const warm = runBenchmarkSample(position, "identical-warm");
    const changed = runBenchmarkSample(position, "changed-next-turn");

    expect(cold.metrics).toMatchObject({
      simulationRequests: 288,
      cacheHits: 0,
      cacheMisses: 288,
      showdownExecutions: 288,
      cacheHitRate: 0
    });
    expect(warm.metrics).toMatchObject({
      simulationRequests: 288,
      cacheHits: 288,
      cacheMisses: 0,
      showdownExecutions: 0,
      cacheHitRate: 1
    });
    expect(changed.metrics).toMatchObject({
      simulationRequests: 288,
      cacheHits: 0,
      cacheMisses: 288,
      showdownExecutions: 288,
      cacheHitRate: 0
    });
    expect(cold.mode).toBe("cold");
    expect(warm.mode).toBe("identical-warm");
    expect(changed.mode).toBe("changed-next-turn");

    const summary = summarizeBenchmarkPosition(position, "identical-warm", 1);
    expect(summary.p50Ms).toBeGreaterThanOrEqual(summary.minMs);
    expect(summary.p50Ms).toBeLessThanOrEqual(summary.maxMs);
    expect(summary).not.toHaveProperty("p95Ms");
  });
});
