import type { SingleTurnSimulationResult } from "../sim/showdown-adapter.js";

export interface RankingMeasurement {
  playerPlanCount: number;
  opponentPlanCount: number;
  seedCount: number;
  simulationRequests: number;
  cacheHits: number;
  cacheMisses: number;
  showdownExecutions: number;
  cacheHitRate: number;
}

export interface RankingRuntime {
  readonly cache: Map<string, SingleTurnSimulationResult>;
  readonly measure: boolean;
  lastMeasurement: RankingMeasurement | undefined;
  resetCache(): void;
  beginMeasurement(): void;
  recordPlanCounts(playerPlanCount: number, opponentPlanCount: number, seedCount: number): void;
  recordSimulationRequest(cacheHit: boolean): void;
  finishMeasurement(): void;
}

export function createRankingRuntime(options: { measure?: boolean } = {}): RankingRuntime {
  const runtime: RankingRuntime = {
    cache: new Map(),
    measure: options.measure ?? false,
    lastMeasurement: undefined,

    resetCache() {
      runtime.cache.clear();
    },

    beginMeasurement() {
      runtime.lastMeasurement = runtime.measure
        ? {
            playerPlanCount: 0,
            opponentPlanCount: 0,
            seedCount: 0,
            simulationRequests: 0,
            cacheHits: 0,
            cacheMisses: 0,
            showdownExecutions: 0,
            cacheHitRate: 0
          }
        : undefined;
    },

    recordPlanCounts(playerPlanCount, opponentPlanCount, seedCount) {
      if (!runtime.lastMeasurement) return;
      runtime.lastMeasurement.playerPlanCount = playerPlanCount;
      runtime.lastMeasurement.opponentPlanCount = opponentPlanCount;
      runtime.lastMeasurement.seedCount = seedCount;
    },

    recordSimulationRequest(cacheHit) {
      if (!runtime.lastMeasurement) return;
      runtime.lastMeasurement.simulationRequests += 1;
      if (cacheHit) {
        runtime.lastMeasurement.cacheHits += 1;
      } else {
        runtime.lastMeasurement.cacheMisses += 1;
        runtime.lastMeasurement.showdownExecutions += 1;
      }
    },

    finishMeasurement() {
      if (!runtime.lastMeasurement) return;
      const { simulationRequests, cacheHits } = runtime.lastMeasurement;
      runtime.lastMeasurement.cacheHitRate = simulationRequests === 0
        ? 0
        : cacheHits / simulationRequests;
    }
  };

  return runtime;
}
