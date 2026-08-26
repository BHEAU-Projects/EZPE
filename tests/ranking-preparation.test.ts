import { describe, expect, it, vi } from "vitest";

import {
  createSingleTurnSimulationInputFactory,
  simulateSingleTurn
} from "../src/sim/showdown-adapter.js";
import type { SimulationSeed } from "../src/domain/advice.js";
import { singleTurnBattleState, singleTurnChoices } from "../src/fixtures/single-turn-battle-state.js";

describe("prepared ranking simulation input", () => {
  it("reuses normalized state across seeds without mutating either state layer", () => {
    const callerStateBefore = structuredClone(singleTurnBattleState);
    const createInput = createSingleTurnSimulationInputFactory(singleTurnBattleState);
    const firstInput = createInput(singleTurnChoices);
    const preparedState = firstInput.battleState;
    if (!preparedState) throw new Error("Expected prepared simulation state.");
    const preparedStateBefore = structuredClone(preparedState);

    const secondInput = createInput(singleTurnChoices);
    simulateSingleTurn({ ...firstInput, seed: [1, 2, 3, 4] });
    simulateSingleTurn({ ...secondInput, seed: [5, 6, 7, 8] });

    expect(secondInput.battleState).toBe(preparedState);
    expect(preparedState).toEqual(preparedStateBefore);
    expect(singleTurnBattleState).toEqual(callerStateBefore);
  });
});

const preparationProbe = vi.hoisted(() => ({ calls: 0 }));

vi.mock("../src/sim/showdown-adapter.js", async () => {
  const actual = await vi.importActual<typeof import("../src/sim/showdown-adapter.js")>(
    "../src/sim/showdown-adapter.js"
  );

  return {
    ...actual,
    createSingleTurnSimulationInputFactory: (battleState: Parameters<typeof actual.createSingleTurnSimulationInputFactory>[0]) => {
      preparationProbe.calls += 1;
      return actual.createSingleTurnSimulationInputFactory(battleState);
    }
  };
});

import { rankMovesWithRuntime } from "../src/advisor/move-ranker.js";
import { createRankingRuntime } from "../src/advisor/ranking-runtime.js";

describe("ranking preparation cache ordering", () => {
  it("prepares once for cold branches and not at all for identical warm hits", () => {
    preparationProbe.calls = 0;
    const runtime = createRankingRuntime({ measure: true });
    const input = {
      opponentChoice: singleTurnChoices.p2Choice,
      seeds: [[1, 2, 3, 4], [5, 6, 7, 8]] as SimulationSeed[]
    };

    const coldResults = rankMovesWithRuntime(singleTurnBattleState, input, runtime);
    expect(preparationProbe.calls).toBe(1);
    expect(runtime.lastMeasurement).toMatchObject({
      simulationRequests: 18,
      cacheHits: 0,
      cacheMisses: 18,
      showdownExecutions: 18
    });

    preparationProbe.calls = 0;
    const warmResults = rankMovesWithRuntime(singleTurnBattleState, input, runtime);
    expect(preparationProbe.calls).toBe(0);
    expect(warmResults).toEqual(coldResults);
    expect(runtime.lastMeasurement).toMatchObject({
      simulationRequests: 18,
      cacheHits: 18,
      cacheMisses: 0,
      showdownExecutions: 0
    });
  });

  it("still rejects malformed state before a simulation-cache hit can short-circuit preparation", () => {
    const runtime = createRankingRuntime({ measure: true });
    const input = {
      opponentChoice: singleTurnChoices.p2Choice,
      seed: [1, 2, 3, 4] as const
    };

    rankMovesWithRuntime(singleTurnBattleState, input, runtime);

    const malformedState = structuredClone(singleTurnBattleState) as typeof singleTurnBattleState & {
      toJSON: () => typeof singleTurnBattleState;
    };
    (malformedState as { battleContext: string }).battleContext = "malformed-context";
    Object.defineProperty(malformedState, "toJSON", {
      value: () => singleTurnBattleState,
      enumerable: false
    });

    expect(JSON.stringify(malformedState)).toBe(JSON.stringify(singleTurnBattleState));
    expect(() => rankMovesWithRuntime(malformedState, input, runtime)).toThrow();
  });
});
