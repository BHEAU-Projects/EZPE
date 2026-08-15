import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { toID } from "@pkmn/dex";
import { z } from "zod";

import { usageMovesetSnapshotSchema } from "../src/data/usage-movesets.js";

const sourceUrl =
  "https://www.smogon.com/stats/2026-06/chaos/gen9championsvgc2026regmb-1760.json";
const outputPath = "data/usage/champions-m-b-2026-06-1760.json";

const chaosPokemonSchema = z.object({
  Moves: z.record(z.string(), z.number())
}).passthrough();

const chaosSchema = z.object({
  data: z.record(z.string(), chaosPokemonSchema)
}).passthrough();

async function refresh(): Promise<void> {
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Usage download failed: ${response.status} ${response.statusText}`);
  const chaos = chaosSchema.parse(await response.json());

  const pokemon = Object.fromEntries(
    Object.entries(chaos.data)
      .map(([speciesName, stats]) => {
        const moveIds = Object.entries(stats.Moves)
          .filter(([moveName]) => moveName !== "Other")
          .sort((left, right) => right[1] - left[1])
          .map(([moveName]) => toID(moveName))
          .filter(Boolean)
          .slice(0, 4);
        return [toID(speciesName), { moveIds }] as const;
      })
      .filter(([speciesId, entry]) => speciesId && entry.moveIds.length > 0)
      .sort(([left], [right]) => left.localeCompare(right))
  );

  const snapshot = usageMovesetSnapshotSchema.parse({
    id: "smogon-gen9championsvgc2026regmb-1760-2026-06",
    regulationId: "champions-m-b",
    formatId: "gen9championsvgc2026regmb",
    dataPeriod: "2026-06",
    ratingCutoff: 1760,
    sourceUrl,
    retrievedOn: new Date().toISOString().slice(0, 10),
    pokemon
  });

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  process.stdout.write(`Wrote ${Object.keys(snapshot.pokemon).length} movesets to ${outputPath}.\n`);
}

refresh().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
