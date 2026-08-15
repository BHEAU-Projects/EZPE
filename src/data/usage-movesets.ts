import { existsSync, readFileSync } from "node:fs";

import { z } from "zod";

import { pokemonSetSchema, type PokemonSet } from "../domain/battle-state.js";
import { pokemonDataService } from "./pokemon-data-service.js";

const canonicalIdSchema = z.string().min(1).regex(/^[a-z0-9]+$/);

export const usageMovesetSnapshotSchema = z
  .object({
    id: z.string().min(1),
    regulationId: z.string().min(1),
    formatId: z.string().min(1),
    dataPeriod: z.string().regex(/^\d{4}-\d{2}$/),
    ratingCutoff: z.number().int().min(0),
    sourceUrl: z.string().url(),
    retrievedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    pokemon: z.record(
      canonicalIdSchema,
      z.object({ moveIds: z.array(canonicalIdSchema).min(1).max(4) }).strict()
    )
  })
  .strict();

export type UsageMovesetSnapshot = z.infer<typeof usageMovesetSnapshotSchema>;

const bundledSnapshotUrls = [
  new URL("../../data/usage/champions-m-b-2026-06-1760.json", import.meta.url)
];

export class UsageMovesetStore {
  readonly snapshots: UsageMovesetSnapshot[];

  constructor(snapshots: UsageMovesetSnapshot[]) {
    this.snapshots = snapshots.map((snapshot) => usageMovesetSnapshotSchema.parse(snapshot));
  }

  getPopularMoveIds(regulationId: string, speciesId: string): {
    moveIds: string[];
    snapshotId: string;
  } | undefined {
    const snapshot = this.snapshots.find((candidate) => candidate.regulationId === regulationId);
    const entry = snapshot?.pokemon[pokemonDataService.canonicalId(speciesId)];
    if (!snapshot || !entry) return undefined;

    return { moveIds: [...entry.moveIds], snapshotId: snapshot.id };
  }

  applyPopularMoveset(set: PokemonSet, regulationId: string): PokemonSet {
    const speciesCandidates = [set.formId, set.speciesId].filter(
      (speciesId): speciesId is string => Boolean(speciesId)
    );
    const popular = speciesCandidates
      .map((speciesId) => this.getPopularMoveIds(regulationId, speciesId))
      .find((entry) => entry !== undefined);

    if (!popular) {
      return pokemonSetSchema.parse({
        ...set,
        moveKnowledge: {
          source: "fallback",
          observedMoveIds: [],
          assumedMoveIds: [...set.moveIds]
        }
      });
    }

    return pokemonSetSchema.parse({
      ...set,
      moveIds: popular.moveIds,
      moveKnowledge: {
        source: "usage-default",
        observedMoveIds: [],
        assumedMoveIds: popular.moveIds,
        usageSnapshotId: popular.snapshotId
      }
    });
  }
}

function loadBundledSnapshots(): UsageMovesetSnapshot[] {
  return bundledSnapshotUrls
    .filter((url) => existsSync(url))
    .map((url) => usageMovesetSnapshotSchema.parse(JSON.parse(readFileSync(url, "utf8"))));
}

export const usageMovesetStore = new UsageMovesetStore(loadBundledSnapshots());
