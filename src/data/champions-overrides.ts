export interface ChampionsOverride {
  regulationId: string;
  kind: "species" | "move" | "item" | "ability" | "mechanic";
  id: string;
  reason: string;
  sourceUrl?: string;
}

export const championsOverrides: ChampionsOverride[] = [];

export function getOverridesForRegulation(regulationId: string): ChampionsOverride[] {
  return championsOverrides.filter((override) => override.regulationId === regulationId);
}
