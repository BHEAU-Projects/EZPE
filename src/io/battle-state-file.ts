import { readFileSync, writeFileSync } from "node:fs";

import {
  battleStateSchema,
  type BattleState,
  type PlayerSide,
  type PokemonSet,
  type TeamState
} from "../domain/battle-state.js";
import type { BattleSession } from "../session/battle-session.js";

export function createBattleStateFromTeams(options: {
  regulationId: string;
  playerSide: PlayerSide;
  p1Team: PokemonSet[];
  p2Team: PokemonSet[];
  p1PreviewRoster?: PokemonSet[];
  p2PreviewRoster?: PokemonSet[];
}): BattleState {
  assertBattleTeamSize(options.p1Team, "p1");
  assertBattleTeamSize(options.p2Team, "p2");

  return battleStateSchema.parse({
    format: "champions-vgc-doubles",
    regulationId: options.regulationId,
    turnNumber: 1,
    playerSide: options.playerSide,
    teams: {
      p1: createTeamState("p1", options.p1Team, options.playerSide, options.p1PreviewRoster),
      p2: createTeamState("p2", options.p2Team, options.playerSide, options.p2PreviewRoster)
    },
    field: {},
    legalActions: []
  });
}

export function loadBattleStateFile(path: string): BattleState {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const state =
    typeof parsed === "object" && parsed !== null && "state" in parsed
      ? (parsed as { state: unknown }).state
      : parsed;
  return battleStateSchema.parse(state);
}

export function saveBattleSessionFile(path: string, session: BattleSession): void {
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        version: 1,
        savedAt: new Date().toISOString(),
        state: session.getState(),
        history: session.getHistory()
      },
      null,
      2
    )}\n`
  );
}

function createTeamState(
  side: PlayerSide,
  sets: PokemonSet[],
  playerSide: PlayerSide,
  previewRoster?: PokemonSet[]
): TeamState {
  const hpFor = (set: PokemonSet) =>
    side === playerSide
      ? { unit: "exact" as const, current: set.stats.hp, max: set.stats.hp }
      : { unit: "percent" as const, percent: 100 };

  return {
    side,
    ...(previewRoster ? { previewRoster } : {}),
    active: sets.slice(0, 2).map((set, index) => ({
      slot: `${side}${index === 0 ? "a" : "b"}`,
      set,
      hp: hpFor(set),
      status: "healthy",
      boosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
      volatileEffectIds: [],
      protectedThisTurn: false,
      protectStreak: 0
    })),
    bench: sets.slice(2).map((set, index) => ({
      benchSlot: index,
      set,
      hp: hpFor(set),
      status: "healthy",
      fainted: false
    })),
    sideConditions: {
      tailwindTurns: 0,
      reflectTurns: 0,
      lightScreenTurns: 0,
      auroraVeilTurns: 0,
      safeguardTurns: 0,
      stealthRock: false,
      stickyWeb: false,
      spikesLayers: 0,
      toxicSpikesLayers: 0
    }
  };
}

function assertBattleTeamSize(team: PokemonSet[], side: PlayerSide): void {
  if (team.length < 2 || team.length > 4) {
    throw new Error(
      `${side} battle team must contain 2-4 Pokemon ordered as two leads followed by bench Pokemon.`
    );
  }
}
