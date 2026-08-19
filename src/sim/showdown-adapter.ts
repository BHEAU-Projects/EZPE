import PokemonShowdown from "pokemon-showdown";

import type {
  BattleState,
  HpMeasurement,
  LegalAction,
  PlayerSide,
  PokemonSet,
  StatTable,
  TeamState
} from "../domain/battle-state.js";
import { battleStateSchema, fixedChampionsIvs } from "../domain/battle-state.js";
import { getRegulationById } from "../data/regulations.js";
import {
  captureHydratedBattleState,
  hydrateBattleState,
  toShowdownCurrentHp,
  type HydratedBattleSummary
} from "./showdown-hydrator.js";

const { Battle } = PokemonShowdown;
type Battle = InstanceType<typeof Battle>;

export { toShowdownCurrentHp } from "./showdown-hydrator.js";

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
  battleState?: BattleState;
  seed?: ShowdownSeed | readonly [number, number, number, number];
}

export interface BattleStateSingleTurnChoices {
  p1Choice: string;
  p2Choice: string;
  p1TeamPreviewChoice?: string;
  p2TeamPreviewChoice?: string;
}

export interface ShowdownMoveEvent {
  side: PlayerSide;
  slot: string;
  user: string;
  move: string;
  target?: string;
  order: number;
}

export type ShowdownDamageCause = "move" | "recoil" | "residual" | "self" | "other";

export interface ShowdownDamageEvent {
  side: PlayerSide;
  slot: string;
  pokemon: string;
  target: string;
  remainingHp: number;
  maxHp: number | null;
  startingHp: number;
  damageAmount: number;
  damagePercent: number;
  sourceSide?: PlayerSide;
  sourceSlot?: string;
  cause: ShowdownDamageCause;
  rawHpText: string;
}

export interface ShowdownHealingEvent {
  side: PlayerSide;
  slot: string;
  pokemon: string;
  target: string;
  startingHp: number;
  remainingHp: number;
  maxHp: number | null;
  healingAmount: number;
  healingPercent: number;
  sourceSide?: PlayerSide;
  sourceSlot?: string;
  rawHpText: string;
}

export interface ShowdownPokemonHpSummary {
  side: PlayerSide;
  slot: string;
  pokemon: string;
  remainingHp: number;
  maxHp: number | null;
  fainted: boolean;
}

export interface ShowdownStatusChange {
  side: PlayerSide;
  slot: string;
  pokemon: string;
  before: string;
  after: string;
}

export interface ShowdownBoostChange {
  side: PlayerSide;
  slot: string;
  pokemon: string;
  stat: keyof import("../domain/battle-state.js").StatBoosts;
  before: number;
  after: number;
  delta: number;
}

export interface ShowdownVolatileChange {
  side: PlayerSide;
  slot: string;
  pokemon: string;
  effectId: string;
  change: "started" | "ended";
}

export interface ShowdownActionOutcome {
  side: PlayerSide;
  slot: string;
  pokemon: string;
  outcome: "moved" | "switched" | "denied" | "missed" | "failed" | "immune" | "fainted-before-action" | "not-observed";
  move?: string;
  target?: string;
  reason?: string;
  order?: number;
}

export interface ShowdownConditionChange {
  scope: "field" | "side";
  side?: PlayerSide;
  conditionId: string;
  change: "started" | "ended" | "changed";
  sourceSide?: PlayerSide;
}

export interface ShowdownItemChange {
  side: PlayerSide;
  slot: string;
  pokemon: string;
  before: string;
  after: string;
  sourceSide?: PlayerSide;
  cause?: "move" | "consumed" | "other";
}

export interface ShowdownForcedSwitch {
  side: PlayerSide;
  slot: string;
  pokemon: string;
}

export interface ShowdownTacticalEffect {
  kind: "protection" | "redirection" | "substitute" | "action-restriction" | "ally-synergy";
  side: PlayerSide;
  slot: string;
  pokemon: string;
  effectId: string;
}

export interface SingleTurnOutcomeSummary {
  hpByPokemon: ShowdownPokemonHpSummary[];
  faintedPokemon: ShowdownPokemonHpSummary[];
  damageTakenBySide: Record<PlayerSide, number>;
  damageTakenPercentBySide: Record<PlayerSide, number>;
  healingBySide: Record<PlayerSide, number>;
  healingPercentBySide: Record<PlayerSide, number>;
  recoilDamageBySide: Record<PlayerSide, number>;
  residualDamageBySide: Record<PlayerSide, number>;
  kosTakenBySide: Record<PlayerSide, number>;
  movesBySide: Record<PlayerSide, ShowdownMoveEvent[]>;
  statusChanges: ShowdownStatusChange[];
  boostChanges: ShowdownBoostChange[];
  volatileChanges: ShowdownVolatileChange[];
  actionOutcomes: ShowdownActionOutcome[];
  conditionChanges: ShowdownConditionChange[];
  itemChanges: ShowdownItemChange[];
  forcedSwitches: ShowdownForcedSwitch[];
  tacticalEffects: ShowdownTacticalEffect[];
  criticalHitsBySide: Record<PlayerSide, number>;
  missesBySide: Record<PlayerSide, number>;
}

export interface SingleTurnSimulationResult {
  formatId: string;
  inputLog: string[];
  log: string[];
  moveEvents: ShowdownMoveEvent[];
  damageEvents: ShowdownDamageEvent[];
  healingEvents: ShowdownHealingEvent[];
  summary: SingleTurnOutcomeSummary;
  initialState: HydratedBattleSummary;
  finalState: HydratedBattleSummary;
  turn: number;
  ended: boolean;
  winner: string | null;
}

type ShowdownSeed = `${number},${string}` | `gen5,${string}` | `sodium,${string}`;

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
    species: set.formId ?? set.speciesId,
    item: set.itemId ?? "",
    ability: set.abilityId,
    moves: [...set.moveIds],
    nature: set.statAlignment,
    // The Champions mod reads Stat Points directly from Showdown's `evs` field.
    evs: { ...set.statPoints },
    ivs: { ...fixedChampionsIvs },
    level: set.level,
    gender: set.gender ?? ""
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
  const simulationState = normalizeBattleStateForShowdown(battleState);
  return {
    formatId: getShowdownFormatIdForRegulation(simulationState.regulationId),
    battleState: simulationState,
    p1: {
      name: "Player 1",
      team: toShowdownTeam(simulationState.teams.p1),
      teamPreviewChoice: choices.p1TeamPreviewChoice ?? defaultTeamPreviewChoice(simulationState.teams.p1.active.length),
      turnChoice: choices.p1Choice
    },
    p2: {
      name: "Player 2",
      team: toShowdownTeam(simulationState.teams.p2),
      teamPreviewChoice: choices.p2TeamPreviewChoice ?? defaultTeamPreviewChoice(simulationState.teams.p2.active.length),
      turnChoice: choices.p2Choice
    }
  };
}

export function buildShowdownChoiceFromLegalActions(
  actions: LegalAction[],
  side: PlayerSide,
  teamState?: TeamState
): string {
  const sideActions = actions
    .filter((action) => action.activeSlot.startsWith(side))
    .sort((a, b) => a.activeSlot.localeCompare(b.activeSlot));

  if (sideActions.length === 0 && !teamState) {
    throw new Error(`No actions were provided for ${side}.`);
  }

  const actionBySlot = new Map(sideActions.map((action) => [action.activeSlot, action]));
  const slots: Array<LegalAction["activeSlot"]> = teamState
    ? [`${side}a`, `${side}b`] as Array<LegalAction["activeSlot"]>
    : sideActions.map((action) => action.activeSlot);

  return slots
    .map((slot) => {
      const action = actionBySlot.get(slot);
      if (!action) {
        const active = teamState?.active.find((pokemon) => pokemon.slot === slot);
        if (!active || isFaintedHp(active.hp)) return "pass";
        throw new Error(`No action was provided for living active slot ${slot}.`);
      }

      if (action.type === "switch") {
        const benchIndex = teamState
          ? [...teamState.bench]
              .sort((a, b) => a.benchSlot - b.benchSlot)
              .findIndex((pokemon) => pokemon.benchSlot === action.benchSlot)
          : -1;
        const teamPosition =
          teamState && benchIndex >= 0
            ? teamState.active.length + benchIndex + 1
            : action.benchSlot + 1;
        return `switch ${teamPosition}`;
      }

      const targetLoc = toShowdownTargetLocation(action.activeSlot, action.targetSlot);

      const choice =
        targetLoc === null ? `move ${action.moveId}` : `move ${action.moveId} ${targetLoc}`;
      return `${choice}${toShowdownSpecialMechanicSuffix(action.specialMechanic?.kind)}`;
    })
    .join(", ");
}

function isFaintedHp(hp: HpMeasurement): boolean {
  return hp.unit === "exact" ? hp.current === 0 : hp.percent === 0;
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

    const initialState = input.battleState
      ? hydrateBattleState(battle, input.battleState)
      : captureHydratedBattleState(battle);
    if (input.battleState) battle.makeRequest("move");

    const initialHpBySlot = captureActiveHp(battle);

    battle.makeChoices(input.p1.turnChoice, input.p2.turnChoice);

    const log = [...battle.log];

    const moveEvents = parseMoveEvents(log);
    const { damageEvents, healingEvents } = parseHpEvents(log, initialHpBySlot);
    const finalState = captureHydratedBattleState(battle);

    return {
      formatId: input.formatId,
      inputLog: [...battle.inputLog],
      log,
      moveEvents,
      damageEvents,
      healingEvents,
      summary: summarizeSingleTurnOutcome(
        log,
        moveEvents,
        damageEvents,
        healingEvents,
        initialHpBySlot,
        initialState,
        finalState
      ),
      initialState,
      finalState,
      turn: battle.turn,
      ended: battle.ended,
      winner: battle.winner ?? null
    };
  } finally {
    battle.destroy();
  }
}

export function createHydratedBattleFromState(
  battleState: BattleState,
  seed?: SingleTurnSimulationInput["seed"]
): Battle {
  const simulationState = normalizeBattleStateForShowdown(battleState);
  const battle = new Battle({
    formatid: getShowdownFormatIdForRegulation(simulationState.regulationId) as never,
    seed: toShowdownSeed(seed),
    strictChoices: true
  });

  try {
    battle.setPlayer("p1", { name: "Player 1", team: toShowdownTeam(simulationState.teams.p1) });
    battle.setPlayer("p2", { name: "Player 2", team: toShowdownTeam(simulationState.teams.p2) });

    if (battle.requestState === "teampreview") {
      battle.makeChoices(
        defaultTeamPreviewChoice(simulationState.teams.p1.active.length),
        defaultTeamPreviewChoice(simulationState.teams.p2.active.length)
      );
    }

    if (battle.requestState !== "move") {
      throw new Error(`Expected a move request, received ${battle.requestState || "none"}.`);
    }

    hydrateBattleState(battle, simulationState);
    battle.makeRequest("move");
    return battle;
  } catch (error) {
    battle.destroy();
    throw error;
  }
}

function normalizeBattleStateForShowdown(battleState: BattleState): BattleState {
  const normalized = structuredClone(battleState);

  for (const side of ["p1", "p2"] as const) {
    const team = normalized.teams[side];
    if (team.active.length !== 1) continue;

    const existing = team.active[0];
    const missingSlot = `${side}${existing.slot.endsWith("a") ? "b" : "a"}` as typeof existing.slot;
    team.active.push({
      ...structuredClone(existing),
      slot: missingSlot,
      hp: existing.hp.unit === "exact"
        ? { ...existing.hp, current: 0 }
        : { unit: "percent", percent: 0 },
      status: "healthy",
      boosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
      volatileEffectIds: [],
      volatileEffects: [],
      turnsActive: 0,
      lastMoveId: null,
      lastMoveTurn: null,
      lastMoveResult: null,
      protectedThisTurn: false,
      protectStreak: 0
    });
    team.active.sort((a, b) => a.slot.localeCompare(b.slot));
  }

  return battleStateSchema.parse(normalized);
}

function defaultTeamPreviewChoice(activeCount: number): string {
  const selectedSlots = Array.from({ length: activeCount }, (_, index) => index + 1).join("");

  return `team ${selectedSlots}`;
}

function toShowdownSpecialMechanicSuffix(kind: string | undefined): string {
  switch (kind) {
    case "megaevolution":
      return " mega";
    case "megaevolutionx":
      return " megax";
    case "megaevolutiony":
      return " megay";
    case "terastallization":
      return " terastallize";
    default:
      return "";
  }
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
  let order = 0;
  return log.flatMap((line) => {
    if (!line.startsWith("|move|")) return [];

    const [, , user, move, target] = line.split("|");
    const parsedUser = parsePokemonLabel(user);

    return [
      {
        side: parsedUser.side,
        slot: parsedUser.slot,
        user,
        move,
        target,
        order: ++order
      }
    ];
  });
}

function parseHpEvents(
  log: string[],
  initialHpBySlot: ReadonlyMap<string, ShowdownPokemonHpSummary> = new Map()
): { damageEvents: ShowdownDamageEvent[]; healingEvents: ShowdownHealingEvent[] } {
  const damageEvents: ShowdownDamageEvent[] = [];
  const healingEvents: ShowdownHealingEvent[] = [];
  const hpBySlot = new Map<string, { remainingHp: number; maxHp: number | null }>(
    [...initialHpBySlot].map(([slot, hp]) => [
      slot,
      { remainingHp: hp.remainingHp, maxHp: hp.maxHp }
    ])
  );
  let previousHpLine = "";
  let turnStarted = false;
  let currentMove: ReturnType<typeof parsePokemonLabel> | undefined;

  for (const line of log) {
    if (line.startsWith("|turn|")) {
      turnStarted = true;
      continue;
    }

    if (line.startsWith("|move|")) {
      const [, , user] = line.split("|");
      currentMove = parsePokemonLabel(user);
      continue;
    }

    if (line.startsWith("|switch|")) {
      const [, , target, , rawHpText] = line.split("|");
      const parsedTarget = parsePokemonLabel(target);
      const hp = parseHpText(rawHpText);

      if (turnStarted || !initialHpBySlot.has(parsedTarget.slot)) {
        hpBySlot.set(parsedTarget.slot, {
          remainingHp: hp.remainingHp,
          maxHp: hp.maxHp
        });
      }

      continue;
    }

    const isDamage = line.startsWith("|-damage|");
    const isHealing = line.startsWith("|-heal|");
    if (!isDamage && !isHealing) continue;
    if (line === previousHpLine) continue;

    previousHpLine = line;

    const [, , target, rawHpText, ...annotations] = line.split("|");
    const parsedTarget = parsePokemonLabel(target);
    const previousHp = hpBySlot.get(parsedTarget.slot);
    const hp = parseHpText(rawHpText);
    const maxHp = hp.maxHp ?? previousHp?.maxHp ?? null;
    const startingHp = previousHp?.remainingHp ?? hp.remainingHp;
    const amount = previousHp
      ? Math.max(0, isDamage ? previousHp.remainingHp - hp.remainingHp : hp.remainingHp - previousHp.remainingHp)
      : 0;
    const percent = maxHp && maxHp > 0 ? Math.min(100, amount / maxHp * 100) : 0;
    const source = resolveHpEventSource(annotations, currentMove, parsedTarget, isDamage);

    hpBySlot.set(parsedTarget.slot, {
      remainingHp: hp.remainingHp,
      maxHp
    });

    if (isDamage) {
      damageEvents.push({
        side: parsedTarget.side,
        slot: parsedTarget.slot,
        pokemon: parsedTarget.pokemon,
        target,
        startingHp,
        remainingHp: hp.remainingHp,
        maxHp,
        damageAmount: amount,
        damagePercent: percent,
        ...source,
        rawHpText
      });
    } else {
      healingEvents.push({
        side: parsedTarget.side,
        slot: parsedTarget.slot,
        pokemon: parsedTarget.pokemon,
        target,
        startingHp,
        remainingHp: hp.remainingHp,
        maxHp,
        healingAmount: amount,
        healingPercent: percent,
        ...(source.sourceSide ? { sourceSide: source.sourceSide } : {}),
        ...(source.sourceSlot ? { sourceSlot: source.sourceSlot } : {}),
        rawHpText
      });
    }
  }

  return { damageEvents, healingEvents };
}

function resolveHpEventSource(
  annotations: string[],
  currentMove: ReturnType<typeof parsePokemonLabel> | undefined,
  target: ReturnType<typeof parsePokemonLabel>,
  isDamage: boolean
): { sourceSide?: PlayerSide; sourceSlot?: string; cause: ShowdownDamageCause } {
  const annotationText = annotations.join("|").toLowerCase();
  const sourceAnnotation = annotations.find((annotation) => annotation.startsWith("[of] "));
  const sourceLabel = sourceAnnotation?.slice(5);
  const annotatedSource = sourceLabel?.startsWith("p1") || sourceLabel?.startsWith("p2")
    ? parsePokemonLabel(sourceLabel)
    : undefined;

  if (!isDamage) {
    const source = annotatedSource ?? currentMove;
    return {
      ...(source ? { sourceSide: source.side, sourceSlot: source.slot } : {}),
      cause: "other"
    };
  }
  if (annotationText.includes("recoil")) {
    return { sourceSide: target.side, sourceSlot: target.slot, cause: "recoil" };
  }
  if (annotationText.includes("[from]")) {
    const source = annotatedSource;
    return {
      ...(source ? { sourceSide: source.side, sourceSlot: source.slot } : {}),
      cause: source?.slot === target.slot ? "self" : "residual"
    };
  }
  if (currentMove) {
    return {
      sourceSide: currentMove.side,
      sourceSlot: currentMove.slot,
      cause: currentMove.slot === target.slot ? "self" : "move"
    };
  }
  return { cause: "other" };
}

function summarizeSingleTurnOutcome(
  log: string[],
  moveEvents: ShowdownMoveEvent[],
  damageEvents: ShowdownDamageEvent[],
  healingEvents: ShowdownHealingEvent[],
  initialHpBySlot: ReadonlyMap<string, ShowdownPokemonHpSummary> = new Map(),
  initialState?: HydratedBattleSummary,
  finalState?: HydratedBattleSummary
): SingleTurnOutcomeSummary {
  const hpBySlot = new Map<string, ShowdownPokemonHpSummary>(initialHpBySlot);
  let turnStarted = false;

  for (const line of log) {
    if (line.startsWith("|turn|")) {
      turnStarted = true;
      continue;
    }

    if (!line.startsWith("|switch|")) continue;

    const [, , target, , rawHpText] = line.split("|");
    const parsedTarget = parsePokemonLabel(target);
    const hp = parseHpText(rawHpText);

    if (turnStarted || !initialHpBySlot.has(parsedTarget.slot)) {
      hpBySlot.set(parsedTarget.slot, {
        side: parsedTarget.side,
        slot: parsedTarget.slot,
        pokemon: parsedTarget.pokemon,
        remainingHp: hp.remainingHp,
        maxHp: hp.maxHp,
        fainted: false
      });
    }
  }

  for (const damageEvent of damageEvents) {
    hpBySlot.set(damageEvent.slot, {
      side: damageEvent.side,
      slot: damageEvent.slot,
      pokemon: damageEvent.pokemon,
      remainingHp: damageEvent.remainingHp,
      maxHp: damageEvent.maxHp,
      fainted: damageEvent.remainingHp === 0 || damageEvent.rawHpText.includes(" fnt")
    });
  }

  const hpByPokemon = [...hpBySlot.values()].sort((a, b) => a.slot.localeCompare(b.slot));
  const initiallyFaintedSlots = new Set(
    initialState?.pokemon.filter((pokemon) => pokemon.fainted).map((pokemon) => pokemon.slot) ?? []
  );
  const faintedPokemon = hpByPokemon.filter(
    (pokemon) => pokemon.fainted && !initiallyFaintedSlots.has(pokemon.slot)
  );
  const stateChanges = compareHydratedStates(log, initialState, finalState);
  const actionOutcomes = parseActionOutcomes(log, initialState, finalState);

  return {
    hpByPokemon,
    faintedPokemon,
    damageTakenBySide: {
      p1: sumDamageTakenBySide(damageEvents, "p1"),
      p2: sumDamageTakenBySide(damageEvents, "p2")
    },
    damageTakenPercentBySide: {
      p1: sumPercentBySide(damageEvents, "p1", "damagePercent"),
      p2: sumPercentBySide(damageEvents, "p2", "damagePercent")
    },
    healingBySide: {
      p1: sumHealingBySide(healingEvents, "p1", "healingAmount"),
      p2: sumHealingBySide(healingEvents, "p2", "healingAmount")
    },
    healingPercentBySide: {
      p1: sumHealingBySide(healingEvents, "p1", "healingPercent"),
      p2: sumHealingBySide(healingEvents, "p2", "healingPercent")
    },
    recoilDamageBySide: {
      p1: sumDamageByCause(damageEvents, "p1", "recoil"),
      p2: sumDamageByCause(damageEvents, "p2", "recoil")
    },
    residualDamageBySide: {
      p1: sumDamageByCause(damageEvents, "p1", "residual"),
      p2: sumDamageByCause(damageEvents, "p2", "residual")
    },
    kosTakenBySide: {
      p1: faintedPokemon.filter((pokemon) => pokemon.side === "p1").length,
      p2: faintedPokemon.filter((pokemon) => pokemon.side === "p2").length
    },
    movesBySide: {
      p1: moveEvents.filter((event) => event.side === "p1"),
      p2: moveEvents.filter((event) => event.side === "p2")
    },
    ...stateChanges,
    volatileChanges: parseVolatileChanges(log),
    actionOutcomes,
    conditionChanges: parseConditionChanges(log),
    forcedSwitches: parseForcedSwitches(log),
    tacticalEffects: parseTacticalEffects(log),
    criticalHitsBySide: countLogTargetsBySide(log, "|-crit|"),
    missesBySide: countMissesBySide(actionOutcomes)
  };
}

function compareHydratedStates(
  log: string[],
  initialState: HydratedBattleSummary | undefined,
  finalState: HydratedBattleSummary | undefined
): Pick<SingleTurnOutcomeSummary, "statusChanges" | "boostChanges" | "itemChanges"> {
  const statusChanges: ShowdownStatusChange[] = [];
  const boostChanges: ShowdownBoostChange[] = [];
  const itemChanges: ShowdownItemChange[] = [];
  if (!initialState || !finalState) return { statusChanges, boostChanges, itemChanges };

  const initialBySlot = new Map(initialState.pokemon.map((pokemon) => [pokemon.slot, pokemon]));
  const itemEvents = parseItemEvents(log);
  for (const after of finalState.pokemon) {
    const before = initialBySlot.get(after.slot);
    if (!before || before.pokemon !== after.pokemon) continue;

    if (before.status !== after.status) {
      statusChanges.push({
        side: after.side,
        slot: after.slot,
        pokemon: after.pokemon,
        before: before.status,
        after: after.status
      });
    }

    for (const stat of Object.keys(after.boosts) as Array<keyof typeof after.boosts>) {
      if (before.boosts[stat] === after.boosts[stat]) continue;
      boostChanges.push({
        side: after.side,
        slot: after.slot,
        pokemon: after.pokemon,
        stat,
        before: before.boosts[stat],
        after: after.boosts[stat],
        delta: after.boosts[stat] - before.boosts[stat]
      });
    }

    if (before.itemId !== after.itemId) {
      const itemEvent = itemEvents.get(after.slot);
      itemChanges.push({
        side: after.side,
        slot: after.slot,
        pokemon: after.pokemon,
        before: before.itemId,
        after: after.itemId,
        ...(itemEvent?.sourceSide ? { sourceSide: itemEvent.sourceSide } : {}),
        ...(itemEvent?.cause ? { cause: itemEvent.cause } : {})
      });
    }
  }

  return { statusChanges, boostChanges, itemChanges };
}

function parseItemEvents(
  log: string[]
): Map<string, { sourceSide?: PlayerSide; cause: "move" | "consumed" | "other" }> {
  const events = new Map<string, { sourceSide?: PlayerSide; cause: "move" | "consumed" | "other" }>();
  for (const line of log) {
    if (!line.startsWith("|-enditem|") && !line.startsWith("|-item|")) continue;
    const [, , label, , ...annotations] = line.split("|");
    const parsed = parsePokemonLabel(label);
    const source = annotations.find((annotation) => annotation.startsWith("[of] "))?.slice(5);
    const sourceSide = source?.startsWith("p1") || source?.startsWith("p2")
      ? parsePokemonLabel(source).side
      : undefined;
    const annotationText = annotations.join("|").toLowerCase();
    const cause = annotationText.includes("[from] move:")
      ? "move"
      : annotationText.includes("[eat]") || annotationText.includes("[consumed]")
        ? "consumed"
        : "other";
    events.set(parsed.slot, { ...(sourceSide ? { sourceSide } : {}), cause });
  }
  return events;
}

function parseActionOutcomes(
  log: string[],
  initialState: HydratedBattleSummary | undefined,
  finalState: HydratedBattleSummary | undefined
): ShowdownActionOutcome[] {
  const outcomes = new Map<string, ShowdownActionOutcome>();
  const finalBySlot = new Map(finalState?.pokemon.map((pokemon) => [pokemon.slot, pokemon]) ?? []);

  for (const pokemon of initialState?.pokemon ?? []) {
    if (!/^p[12][ab]$/.test(pokemon.slot) || pokemon.fainted) continue;
    outcomes.set(pokemon.slot, {
      side: pokemon.side,
      slot: pokemon.slot,
      pokemon: pokemon.pokemon,
      outcome: "not-observed"
    });
  }

  let currentTurnStarted = false;
  let lastMoverSlot = "";
  let actionOrder = 0;
  for (const line of log) {
    if (line.startsWith("|turn|")) {
      currentTurnStarted = true;
      continue;
    }
    if (line.startsWith("|move|")) {
      const [, , label, move, target] = line.split("|");
      const parsed = parsePokemonLabel(label);
      lastMoverSlot = parsed.slot;
      outcomes.set(parsed.slot, {
        ...parsed,
        outcome: "moved",
        move,
        ...(target ? { target } : {}),
        order: ++actionOrder
      });
      continue;
    }
    if (line.startsWith("|cant|")) {
      const [, , label, reason] = line.split("|");
      const parsed = parsePokemonLabel(label);
      const existing = outcomes.get(parsed.slot);
      outcomes.set(parsed.slot, {
        ...parsed,
        outcome: "denied",
        reason: toCanonicalId(reason),
        order: existing?.order ?? ++actionOrder
      });
      continue;
    }
    if (line.startsWith("|-miss|")) {
      const [, , label] = line.split("|");
      const parsed = parsePokemonLabel(label);
      const existing = outcomes.get(parsed.slot);
      outcomes.set(parsed.slot, { ...existing, ...parsed, outcome: "missed" });
      continue;
    }
    if (line.startsWith("|-fail|") && lastMoverSlot) {
      const existing = outcomes.get(lastMoverSlot);
      if (existing) outcomes.set(lastMoverSlot, { ...existing, outcome: "failed" });
      continue;
    }
    if (line.startsWith("|-immune|") && lastMoverSlot) {
      const existing = outcomes.get(lastMoverSlot);
      if (existing) outcomes.set(lastMoverSlot, { ...existing, outcome: "immune" });
      continue;
    }
    if (currentTurnStarted && line.startsWith("|switch|")) {
      const [, , label] = line.split("|");
      const parsed = parsePokemonLabel(label);
      outcomes.set(parsed.slot, { ...parsed, outcome: "switched", order: ++actionOrder });
      continue;
    }
    if (currentTurnStarted && line.startsWith("|faint|")) {
      const [, , label] = line.split("|");
      const parsed = parsePokemonLabel(label);
      const existing = outcomes.get(parsed.slot);
      if (!existing || existing.outcome === "not-observed") {
        outcomes.set(parsed.slot, {
          ...parsed,
          outcome: "fainted-before-action",
          order: ++actionOrder
        });
      }
    }
  }

  return [...outcomes.values()].map((outcome) => {
    const final = finalBySlot.get(outcome.slot);
    return outcome.outcome === "not-observed" && final?.fainted
      ? { ...outcome, outcome: "fainted-before-action" }
      : outcome;
  });
}

function parseTacticalEffects(log: string[]): ShowdownTacticalEffect[] {
  const protection = new Set([
    "protect", "detect", "kingsshield", "spikyshield", "banefulbunker",
    "obstruct", "silktrap", "burningbulwark", "wideguard", "quickguard", "matblock"
  ]);
  const redirection = new Set(["followme", "ragepowder", "spotlight"]);
  const restrictions = new Set(["encore", "disable", "torment", "taunt", "healblock", "imprison"]);
  const allySynergy = new Set(["helpinghand"]);
  const effects: ShowdownTacticalEffect[] = [];

  for (const line of log) {
    if (line.startsWith("|cant|")) {
      const [, , label, rawReason] = line.split("|");
      const parsed = parsePokemonLabel(label);
      effects.push({ ...parsed, kind: "action-restriction", effectId: toCanonicalId(rawReason) });
      continue;
    }
    if (!line.startsWith("|-singleturn|") && !line.startsWith("|-start|")) continue;
    const [, , label, rawEffect] = line.split("|");
    if (!label?.startsWith("p1") && !label?.startsWith("p2")) continue;
    const parsed = parsePokemonLabel(label);
    const effectId = toCanonicalId(rawEffect.replace(/^move: /i, ""));
    const kind = protection.has(effectId)
      ? "protection"
      : redirection.has(effectId)
        ? "redirection"
        : effectId === "substitute"
          ? "substitute"
          : restrictions.has(effectId)
            ? "action-restriction"
            : allySynergy.has(effectId)
              ? "ally-synergy"
              : null;
    if (kind) effects.push({ ...parsed, kind, effectId });
  }

  return [...new Map(
    effects.map((effect) => [`${effect.kind}:${effect.slot}:${effect.effectId}`, effect])
  ).values()];
}

function parseVolatileChanges(log: string[]): ShowdownVolatileChange[] {
  return log.flatMap((line) => {
    const change = line.startsWith("|-start|") ? "started" : line.startsWith("|-end|") ? "ended" : null;
    if (!change) return [];
    const [, , label, rawEffect] = line.split("|");
    if (!label?.startsWith("p1") && !label?.startsWith("p2")) return [];
    const parsed = parsePokemonLabel(label);
    return [{ ...parsed, effectId: toCanonicalId(rawEffect), change }];
  });
}

function parseConditionChanges(log: string[]): ShowdownConditionChange[] {
  const changes: ShowdownConditionChange[] = [];
  let lastMoveSide: PlayerSide | undefined;

  for (const line of log) {
    if (line.startsWith("|move|")) {
      const [, , label] = line.split("|");
      lastMoveSide = parsePokemonLabel(label).side;
      continue;
    }
    if (line.startsWith("|-weather|")) {
      const [, , rawCondition] = line.split("|");
      changes.push({
        scope: "field",
        conditionId: toCanonicalId(rawCondition),
        change: toCanonicalId(rawCondition) === "none" ? "ended" : "changed",
        sourceSide: lastMoveSide
      });
      continue;
    }
    if (line.startsWith("|-fieldstart|") || line.startsWith("|-fieldend|")) {
      const [, command, rawCondition] = line.split("|");
      changes.push({
        scope: "field",
        conditionId: toCanonicalId(rawCondition.replace(/^move: /i, "")),
        change: command === "-fieldstart" ? "started" : "ended",
        sourceSide: lastMoveSide
      });
      continue;
    }
    if (line.startsWith("|-sidestart|") || line.startsWith("|-sideend|")) {
      const [, command, rawSide, rawCondition] = line.split("|");
      changes.push({
        scope: "side",
        side: rawSide.slice(0, 2) as PlayerSide,
        conditionId: toCanonicalId(rawCondition.replace(/^move: /i, "")),
        change: command === "-sidestart" ? "started" : "ended",
        sourceSide: lastMoveSide
      });
    }
  }

  return changes;
}

function parseForcedSwitches(log: string[]): ShowdownForcedSwitch[] {
  return log.flatMap((line) => {
    if (!line.startsWith("|drag|")) return [];
    const [, , label] = line.split("|");
    return [parsePokemonLabel(label)];
  });
}

function countLogTargetsBySide(log: string[], prefix: string): Record<PlayerSide, number> {
  const counts = { p1: 0, p2: 0 };
  for (const line of log) {
    if (!line.startsWith(prefix)) continue;
    const [, , label] = line.split("|");
    counts[parsePokemonLabel(label).side] += 1;
  }
  return counts;
}

function countMissesBySide(outcomes: ShowdownActionOutcome[]): Record<PlayerSide, number> {
  return {
    p1: outcomes.filter((outcome) => outcome.side === "p1" && outcome.outcome === "missed").length,
    p2: outcomes.filter((outcome) => outcome.side === "p2" && outcome.outcome === "missed").length
  };
}

function toCanonicalId(value: string): string {
  return PokemonShowdown.toID(value);
}

function sumDamageTakenBySide(damageEvents: ShowdownDamageEvent[], side: PlayerSide): number {
  return damageEvents
    .filter((event) => event.side === side)
    .reduce((totalDamage, event) => totalDamage + event.damageAmount, 0);
}

function sumPercentBySide(
  damageEvents: ShowdownDamageEvent[],
  side: PlayerSide,
  key: "damagePercent"
): number {
  return damageEvents
    .filter((event) => event.side === side)
    .reduce((total, event) => total + event[key], 0);
}

function sumHealingBySide(
  healingEvents: ShowdownHealingEvent[],
  side: PlayerSide,
  key: "healingAmount" | "healingPercent"
): number {
  return healingEvents
    .filter((event) => event.side === side)
    .reduce((total, event) => total + event[key], 0);
}

function sumDamageByCause(
  damageEvents: ShowdownDamageEvent[],
  side: PlayerSide,
  cause: ShowdownDamageCause
): number {
  return damageEvents
    .filter((event) => event.side === side && event.cause === cause)
    .reduce((total, event) => total + event.damageAmount, 0);
}

function parsePokemonLabel(label: string): { side: PlayerSide; slot: string; pokemon: string } {
  const [slot, pokemon = ""] = label.split(": ");

  return {
    side: slot.slice(0, 2) as PlayerSide,
    slot,
    pokemon
  };
}

function parseHpText(rawHpText: string): { remainingHp: number; maxHp: number | null } {
  const hpToken = rawHpText.split(" ")[0];
  const [remainingText, maxText] = hpToken.split("/");

  return {
    remainingHp: Number.parseInt(remainingText, 10),
    maxHp: maxText ? Number.parseInt(maxText, 10) : null
  };
}

function captureActiveHp(battle: Battle): Map<string, ShowdownPokemonHpSummary> {
  const hpBySlot = new Map<string, ShowdownPokemonHpSummary>();

  for (const side of ["p1", "p2"] as const) {
    const showdownSide = side === "p1" ? battle.p1 : battle.p2;

    showdownSide.active.forEach((pokemon, index) => {
      if (!pokemon) return;

      const slot = `${side}${index === 0 ? "a" : "b"}`;
      hpBySlot.set(slot, {
        side,
        slot,
        pokemon: pokemon.name,
        remainingHp: pokemon.hp,
        maxHp: pokemon.maxhp,
        fainted: pokemon.fainted || pokemon.hp === 0
      });
    });
  }

  return hpBySlot;
}
