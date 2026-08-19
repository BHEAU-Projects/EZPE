import type { BattleFormat } from "../domain/battle-state.js";

export type LegalitySource = "manual-development" | "pokemon-showdown-format";

export interface RegulationSource {
  label: string;
  url: string;
  retrievedOn: string;
}

export interface RegulationSnapshot {
  id: string;
  name: string;
  format: BattleFormat;
  showdownFormatId: string;
  startsOn: string | null;
  endsOn: string | null;
  isOfficial: boolean;
  legalitySource: LegalitySource;
  battleRules: {
    battleType: "doubles";
    bring: number;
    choose: number;
    level: 50;
    gameTimerMinutes: number;
    playerTimerMinutes: number;
    turnTimerSeconds: number;
    teamPreviewSeconds: number;
  };
  teamRules: {
    speciesClause: boolean;
    itemClause: boolean;
    openTeamSheets: boolean;
    megaEvolution: boolean;
  };
  notes: string[];
  sources: RegulationSource[];
}

export const defaultBattleRules = {
  battleType: "doubles",
  bring: 6,
  choose: 4,
  level: 50,
  gameTimerMinutes: 20,
  playerTimerMinutes: 7,
  turnTimerSeconds: 45,
  teamPreviewSeconds: 90
} as const;

export const regulationSnapshots: RegulationSnapshot[] = [
  {
    id: "development",
    name: "Development Doubles Custom Game",
    format: "champions-vgc-doubles",
    showdownFormatId: "gen9championsdoublescustomgame",
    startsOn: null,
    endsOn: null,
    isOfficial: false,
    legalitySource: "manual-development",
    battleRules: defaultBattleRules,
    teamRules: {
      speciesClause: false,
      itemClause: false,
      openTeamSheets: false,
      megaEvolution: true
    },
    notes: [
      "Use this local regulation for early mechanics tests that should not fail because of team legality.",
      "This regulation is intentionally not an official Pokemon Champions format."
    ],
    sources: []
  },
  {
    id: "champions-m-a",
    name: "Pokemon Champions Regulation Set M-A",
    format: "champions-vgc-doubles",
    showdownFormatId: "gen9championsvgc2026regma",
    startsOn: "2026-04-08",
    endsOn: "2026-06-17",
    isOfficial: true,
    legalitySource: "pokemon-showdown-format",
    battleRules: defaultBattleRules,
    teamRules: {
      speciesClause: true,
      itemClause: true,
      openTeamSheets: false,
      megaEvolution: true
    },
    notes: [
      "First Pokemon Champions VGC regulation used for the launch era.",
      "Ranked Battle analysis defaults to closed information; use the vgc-open-sheet battle context for open-sheet events.",
      "Detailed Pokemon, item, move, and Mega legality should be delegated to the pinned Pokemon Showdown format."
    ],
    sources: [
      {
        label: "Play! Pokemon transition announcement",
        url: "https://www.pokemon.com/us/pokemon-news/play-pokemon-competitions-transition-to-pokemon-champions-on-april-and-may-2026",
        retrievedOn: "2026-08-15"
      },
      {
        label: "Victory Road Pokemon Champions regulations",
        url: "https://victoryroad.pro/champions-regulations/",
        retrievedOn: "2026-08-15"
      }
    ]
  },
  {
    id: "champions-m-b",
    name: "Pokemon Champions Regulation Set M-B",
    format: "champions-vgc-doubles",
    showdownFormatId: "gen9championsvgc2026regmb",
    startsOn: "2026-06-17",
    endsOn: "2026-09-09",
    isOfficial: true,
    legalitySource: "pokemon-showdown-format",
    battleRules: defaultBattleRules,
    teamRules: {
      speciesClause: true,
      itemClause: true,
      openTeamSheets: false,
      megaEvolution: true
    },
    notes: [
      "Current regulation as of 2026-08-15.",
      "Ranked Battle analysis defaults to closed information; use the vgc-open-sheet battle context for open-sheet events.",
      "Victory Road notes this end date changed from 2026-09-02 to 2026-09-09 during August updates.",
      "Detailed Pokemon, item, move, and Mega legality should be delegated to the pinned Pokemon Showdown format."
    ],
    sources: [
      {
        label: "Official Pokemon Champions Regulation Set M-B",
        url: "https://champions-news.pokemon-home.com/en/page/776.html",
        retrievedOn: "2026-08-19"
      },
      {
        label: "Victory Road Pokemon Champions regulations",
        url: "https://victoryroad.pro/champions-regulations/",
        retrievedOn: "2026-08-15"
      }
    ]
  }
];

const regulationAliases = new Map(
  regulationSnapshots.flatMap((regulation) => [
    [regulation.id, regulation.id],
    [regulation.id.replace("champions-", ""), regulation.id],
    [regulation.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), regulation.id]
  ])
);

export function getRegulationById(id: string): RegulationSnapshot | undefined {
  const canonicalId = regulationAliases.get(id.toLowerCase()) ?? id.toLowerCase();

  return regulationSnapshots.find((regulation) => regulation.id === canonicalId);
}

export function getCurrentRegulation(asOf = new Date()): RegulationSnapshot {
  const date = asOf.toISOString().slice(0, 10);
  const currentRegulation = regulationSnapshots.find((regulation) => {
    if (!regulation.startsOn || !regulation.endsOn) return false;

    return regulation.startsOn <= date && date < regulation.endsOn;
  });

  return currentRegulation ?? getRegulationById("development")!;
}
