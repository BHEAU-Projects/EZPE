import { describe, expect, it } from "vitest";

import type { PokemonSet } from "../src/domain/battle-state.js";
import {
  UsageMovesetStore,
  usageMovesetStore,
  type UsageMovesetSnapshot
} from "../src/data/usage-movesets.js";

const squirtle: PokemonSet = {
  speciesId: "squirtle",
  level: 50,
  itemId: null,
  abilityId: "torrent",
  moveIds: ["tackle"],
  stats: { hp: 120, atk: 70, def: 70, spa: 70, spd: 70, spe: 70 }
};

const snapshot: UsageMovesetSnapshot = {
  id: "test-regulation-usage",
  regulationId: "test-regulation",
  formatId: "test-format",
  dataPeriod: "2026-06",
  ratingCutoff: 1760,
  sourceUrl: "https://example.com/usage.json",
  retrievedOn: "2026-08-15",
  pokemon: {
    squirtle: { moveIds: ["watergun", "protect", "tackle", "icywind"] }
  }
};

describe("usage movesets", () => {
  it("loads the bundled high-ladder Regulation M-B snapshot", () => {
    expect(usageMovesetStore.getPopularMoveIds("champions-m-b", "Pikachu")).toEqual({
      moveIds: ["fakeout", "risingvoltage", "grassknot", "protect"],
      snapshotId: "smogon-gen9championsvgc2026regmb-1760-2026-06"
    });
  });

  it("applies defaults while preserving their usage-data provenance", () => {
    const store = new UsageMovesetStore([snapshot]);
    const inferred = store.applyPopularMoveset(squirtle, "test-regulation");

    expect(inferred).toMatchObject({
      moveIds: ["watergun", "protect", "tackle", "icywind"],
      moveKnowledge: {
        source: "usage-default",
        observedMoveIds: [],
        assumedMoveIds: ["watergun", "protect", "tackle", "icywind"],
        usageSnapshotId: "test-regulation-usage"
      }
    });
  });

  it("marks imported moves as fallback assumptions when no snapshot exists", () => {
    const store = new UsageMovesetStore([]);

    expect(store.applyPopularMoveset(squirtle, "missing").moveKnowledge).toEqual({
      source: "fallback",
      observedMoveIds: [],
      assumedMoveIds: ["tackle"]
    });
  });
});
