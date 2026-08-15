import { Battle } from "pokemon-showdown";

import type { BattleState, LegalAction, PlayerSide, PokemonSet, StatTable, TeamState } from "../domain/battle-state.js";
import { getRegulationById } from "../data/regulations.js";

export interface ShowdownPokemonSet {
  name: string;
  species: string;
  item: string;
  ability: string;
  moves: string[];
  nature: string;
  evs: StatTable;
  ivs: StatTable;
  level: number;
  gender: "" | "M" | "F" | "N";
}

export interface SingleTurnSideInput {
  name: string;
  team: ShowdownPokemonSet[];
  teamPreviewChoice?: string;
  turnChoice: string;
}

export interface SingleTurnSimulationInput {
  formatId: string;
  p1: SingleTurnSideInput;
  p2: SingleTurnSideInput;
  seed?: ShowdownSeed | readonly [number, number, number, number];
}

export interface BattleStateSingleTurnChoices {
  p1Choice: string;
  p2Choice: string;
  p1TeamPreviewChoice?: string;
  p2TeamPreviewChoice?: string;
}

export interface ShowdownMoveEvent {
  user: string;
  move: string;
  target?: string;
}

export interface ShowdownDamageEvent {
  target: string;
  remainingHp: number;
  maxHp: number | null;
  rawHpText: string;
}

export interface SingleTurnSimulationResult {
  formatId: string;
  inputLog: string[];
  log: string[];
  moveEvents: ShowdownMoveEvent[];
  damageEvents: ShowdownDamageEvent[];
  turn: number;
  ended: boolean;
  winner: string | null;
}

type ShowdownSeed = `${number},${string}` | `gen5,${string}` | `sodium,${string}`;

const defaultStats: StatTable = {
  hp: 0,
  atk: 0,
  def: 0,
  spa: 0,
  spd: 0,
  spe: 0
};

const defaultIvs: StatTable = {
  hp: 31,
  atk: 31,
  def: 31,
  spa: 31,
  spd: 31,
  spe: 31
};

export function getShowdownFormatIdForRegulation(regulationId: string): string {
  const regulation = getRegulationById(regulationId);

  if (!regulation) {
    throw new Error(`Unknown regulation id: ${regulationId}`);
  }

  return regulation.showdownFormatId;
}

export function toShowdownPokemonSet(set: PokemonSet): ShowdownPokemonSet {
  return {
    name: set.displayName ?? set.speciesId,
    species: set.displayName ?? set.speciesId,
    item: set.itemId ?? "",
    ability: set.abilityId,
    moves: [...set.moveIds],
    nature: set.nature ?? "Serious",
    evs: set.evs ?? defaultStats,
    ivs: set.ivs ?? defaultIvs,
    level: set.level,
    gender: ""
  };
}

export function toShowdownTeam(teamState: TeamState): ShowdownPokemonSet[] {
  const active = [...teamState.active].sort((a, b) => a.slot.localeCompare(b.slot));
  const bench = [...teamState.bench].sort((a, b) => a.benchSlot - b.benchSlot);

  return [...active.map((pokemon) => pokemon.set), ...bench.map((pokemon) => pokemon.set)].map(toShowdownPokemonSet);
}

export function createSingleTurnSimulationInputFromBattleState(
  battleState: BattleState,
  choices: BattleStateSingleTurnChoices
): SingleTurnSimulationInput {
  return {
    formatId: getShowdownFormatIdForRegulation(battleState.regulationId),
    p1: {
      name: "Player 1",
      team: toShowdownTeam(battleState.teams.p1),
      teamPreviewChoice: choices.p1TeamPreviewChoice ?? defaultTeamPreviewChoice(battleState.teams.p1.active.length),
      turnChoice: choices.p1Choice
    },
    p2: {
      name: "Player 2",
      team: toShowdownTeam(battleState.teams.p2),
      teamPreviewChoice: choices.p2TeamPreviewChoice ?? defaultTeamPreviewChoice(battleState.teams.p2.active.length),
      turnChoice: choices.p2Choice
    }
  };
}

export function buildShowdownChoiceFromLegalActions(actions: LegalAction[], side: PlayerSide): string {
  const sideActions = actions
    .filter((action) => action.activeSlot.startsWith(side))
    .sort((a, b) => a.activeSlot.localeCompare(b.activeSlot));

  if (sideActions.length === 0) {
    throw new Error(`No actions were provided for ${side}.`);
  }

  return sideActions
    .map((action) => {
      if (action.type === "switch") {
        return `switch ${action.benchSlot + 1}`;
      }

      const targetLoc = toShowdownTargetLocation(action.activeSlot, action.targetSlot);

      return targetLoc === null ? `move ${action.moveId}` : `move ${action.moveId} ${targetLoc}`;
    })
    .join(", ");
}

export function simulateSingleTurn(input: SingleTurnSimulationInput): SingleTurnSimulationResult {
  const battle = new Battle({
    formatid: input.formatId as never,
    seed: toShowdownSeed(input.seed),
    strictChoices: true
  });

  try {
    battle.setPlayer("p1", {
      name: input.p1.name,
      team: input.p1.team
    });
    battle.setPlayer("p2", {
      name: input.p2.name,
      team: input.p2.team
    });

    if (battle.requestState === "teampreview") {
      battle.makeChoices(
        input.p1.teamPreviewChoice ?? defaultTeamPreviewChoice(input.p1.team.length),
        input.p2.teamPreviewChoice ?? defaultTeamPreviewChoice(input.p2.team.length)
      );
    }

    if (battle.requestState !== "move") {
      throw new Error(`Expected move request before simulating a turn, received ${battle.requestState || "none"}.`);
    }

    battle.makeChoices(input.p1.turnChoice, input.p2.turnChoice);

    const log = [...battle.log];

    return {
      formatId: input.formatId,
      inputLog: [...battle.inputLog],
      log,
      moveEvents: parseMoveEvents(log),
      damageEvents: parseDamageEvents(log),
      turn: battle.turn,
      ended: battle.ended,
      winner: battle.winner ?? null
    };
  } finally {
    battle.destroy();
  }
}

function defaultTeamPreviewChoice(activeCount: number): string {
  const selectedSlots = Array.from({ length: activeCount }, (_, index) => index + 1).join("");

  return `team ${selectedSlots}`;
}

function toShowdownSeed(seed: SingleTurnSimulationInput["seed"]): ShowdownSeed | undefined {
  if (!seed) return undefined;
  if (typeof seed === "string") return seed;

  return `${seed[0]},${seed[1]},${seed[2]},${seed[3]}`;
}

function toShowdownTargetLocation(activeSlot: string, targetSlot: string): number | null {
  if (targetSlot === "field" || targetSlot === "self" || targetSlot === "allySide" || targetSlot === "opponentSide") {
    return null;
  }

  const activeSide = activeSlot.slice(0, 2);
  const targetSide = targetSlot.slice(0, 2);
  const targetPosition = targetSlot.endsWith("a") ? 1 : 2;

  return activeSide === targetSide ? -targetPosition : targetPosition;
}

function parseMoveEvents(log: string[]): ShowdownMoveEvent[] {
  return log.flatMap((line) => {
    if (!line.startsWith("|move|")) return [];

    const [, , user, move, target] = line.split("|");

    return [
      {
        user,
        move,
        target
      }
    ];
  });
}

function parseDamageEvents(log: string[]): ShowdownDamageEvent[] {
  const events: ShowdownDamageEvent[] = [];
  let previousDamageLine = "";

  for (const line of log) {
    if (!line.startsWith("|-damage|")) continue;
    if (line === previousDamageLine) continue;

    previousDamageLine = line;

    const [, , target, rawHpText] = line.split("|");
    const hpToken = rawHpText.split(" ")[0];
    const [remainingText, maxText] = hpToken.split("/");

    events.push({
      target,
      remainingHp: Number.parseInt(remainingText, 10),
      maxHp: maxText ? Number.parseInt(maxText, 10) : null,
      rawHpText
    });
  }

  return events;
}
