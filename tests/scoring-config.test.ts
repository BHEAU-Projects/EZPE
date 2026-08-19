import {
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { scoreSingleTurnOutcome } from "../src/advisor/scoring.js";
import {
  loadScoringConfig,
  parseScoringConfig,
  ScoringConfigStore
} from "../src/config/scoring-config.js";
import {
  singleTurnBattleState,
  singleTurnChoices
} from "../src/fixtures/single-turn-battle-state.js";
import {
  createSingleTurnSimulationInputFromBattleState,
  simulateSingleTurn
} from "../src/sim/showdown-adapter.js";

describe("scoring configuration", () => {
  it("loads the checked-in grading configuration", () => {
    expect(loadScoringConfig()).toMatchObject({
      version: 1,
      weights: { damageDealt: 0, normalizedDamageDealt: 1, koDealt: 100 },
      opponentAggregation: { expectedWeight: 0.7, worstCaseWeight: 0.3 }
    });
  });

  it("rejects negative weights and aggregation weights that do not sum to one", () => {
    expect(() =>
      parseScoringConfig({
        version: 1,
        weights: {
          damageDealt: -1,
          damageTakenPenalty: 1,
          koDealt: 100,
          koTakenPenalty: 120
        },
        thresholds: { heavyDamage: 50 },
        opponentAggregation: { expectedWeight: 0.8, worstCaseWeight: 0.3 },
        confidenceScoreGap: 100
      })
    ).toThrow();
  });

  it("changes outcome grades without changing simulator behavior", () => {
    const simulation = simulateSingleTurn({
      ...createSingleTurnSimulationInputFromBattleState(
        singleTurnBattleState,
        singleTurnChoices
      ),
      seed: [1, 2, 3, 4]
    });
    const baselineConfig = loadScoringConfig();
    const koFocusedConfig = parseScoringConfig({
      ...baselineConfig,
      weights: { ...baselineConfig.weights, koDealt: 500 }
    });

    const baseline = scoreSingleTurnOutcome(simulation, "p1", baselineConfig);
    const koFocused = scoreSingleTurnOutcome(simulation, "p1", koFocusedConfig);

    expect(baseline.breakdown.kosDealt).toBe(1);
    expect(koFocused.score).toBe(baseline.score + 400);
    expect(koFocused.breakdown).toEqual(baseline.breakdown);
  });

  it("reloads grading after the configuration file changes", () => {
    const directory = mkdtempSync(join(tmpdir(), "ezpe-scoring-"));
    const path = join(directory, "scoring.json");
    const initial = loadScoringConfig();

    try {
      writeFileSync(path, JSON.stringify(initial));
      const store = new ScoringConfigStore(path);
      expect(store.get().weights.koDealt).toBe(100);

      const changed = { ...initial, weights: { ...initial.weights, koDealt: 250 } };
      writeFileSync(path, JSON.stringify(changed));
      const future = new Date(Date.now() + 2_000);
      utimesSync(path, future, future);

      expect(store.get().weights.koDealt).toBe(250);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
