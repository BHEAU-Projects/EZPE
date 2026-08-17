import PokemonShowdown from "pokemon-showdown";

import {
  battleStateSchema,
  type ActivePokemon,
  type BattleState,
  type FieldState,
  type PlayerSide,
  type SideConditions,
  type StatBoosts,
  type StatusCondition
} from "../domain/battle-state.js";
import {
  createHydratedBattleFromState,
  getShowdownFormatIdForRegulation
} from "../sim/showdown-adapter.js";
import { captureHydratedBattleState } from "../sim/showdown-hydrator.js";
import type { ConfirmedEffect, ObservedAction, TurnReport } from "./turn-report.js";

const { Dex } = PokemonShowdown;

const weatherByShowdownId: Record<string, NonNullable<FieldState["weather"]>> = {
  raindance: "rain",
  sunnyday: "sun",
  sandstorm: "sandstorm",
  snow: "snow",
  desolateland: "harshsunshine",
  primordialsea: "heavyrain",
  deltastream: "strongwinds"
};

const terrainByShowdownId: Record<string, NonNullable<FieldState["terrain"]>> = {
  electricterrain: "electric",
  grassyterrain: "grassy",
  mistyterrain: "misty",
  psychicterrain: "psychic"
};

const permanentWeatherIds = new Set(["desolateland", "primordialsea", "deltastream"]);

export interface EffectSuggestion {
  id: string;
  label: string;
  chancePercent: number;
  effect: ConfirmedEffect;
}

interface MoveEffectData {
  name: string;
  accuracy: number | true;
  status?: string;
  boosts?: Partial<StatBoosts>;
  self?: { boosts?: Partial<StatBoosts> };
  secondary?: SecondaryEffectData | null;
  secondaries?: SecondaryEffectData[] | null;
}

interface SecondaryEffectData {
  chance?: number;
  status?: string;
  volatileStatus?: string;
  boosts?: Partial<StatBoosts>;
  self?: { boosts?: Partial<StatBoosts> };
}

export function applyAutomaticTurnEffects(
  beforeTurn: BattleState,
  observedState: BattleState,
  report: TurnReport
): BattleState {
  const battle = createHydratedBattleFromState(beforeTurn);

  try {
    const suppressedSlots = new Set(
      report.confirmedEffects.flatMap((effect) =>
        effect.kind === "move-result" && ["missed", "failed", "blocked"].includes(effect.result)
          ? [effect.slot]
          : []
      )
    );

    for (const action of report.actions) {
      if (action.type !== "move" || suppressedSlots.has(action.activeSlot)) continue;
      applyTimedMoveEffects(battle, action);
    }

    const summary = captureHydratedBattleState(battle);
    const nextState = structuredClone(observedState);
    nextState.field = fieldFromShowdownSummary(summary);
    nextState.teams.p1.sideConditions = sideConditionsFromShowdownSummary(summary.sideConditions.p1);
    nextState.teams.p2.sideConditions = sideConditionsFromShowdownSummary(summary.sideConditions.p2);
    return battleStateSchema.parse(nextState);
  } finally {
    battle.destroy();
  }
}

export function suggestTurnEffects(
  state: BattleState,
  actions: ObservedAction[]
): EffectSuggestion[] {
  const dex = Dex.forFormat(getShowdownFormatIdForRegulation(state.regulationId));
  const suggestions: EffectSuggestion[] = [];

  for (const action of actions) {
    if (action.type !== "move") continue;
    const move = dex.moves.get(action.moveId) as unknown as MoveEffectData;
    const targetSlots = resolveEffectTargetSlots(state, action);
    const hitChance = move.accuracy === true ? 100 : move.accuracy;

    if (move.accuracy !== true && move.accuracy < 100) {
      suggestions.push({
        id: `${action.activeSlot}:${action.moveId}:missed`,
        label: `${move.name} missed`,
        chancePercent: 100 - move.accuracy,
        effect: { kind: "move-result", slot: action.activeSlot, result: "missed" }
      });
    }

    addStatusSuggestions(suggestions, state, action, targetSlots, move.name, move.status, hitChance);
    addBoostSuggestions(suggestions, state, action, targetSlots, move.name, move.boosts, hitChance);
    addBoostSuggestions(
      suggestions,
      state,
      action,
      [action.activeSlot],
      move.name,
      move.self?.boosts,
      hitChance,
      "self"
    );

    const secondaries = move.secondaries ?? (move.secondary ? [move.secondary] : []);
    for (const secondary of secondaries) {
      const chance = hitChance * (secondary.chance ?? 100) / 100;
      addStatusSuggestions(suggestions, state, action, targetSlots, move.name, secondary.status, chance);
      addBoostSuggestions(suggestions, state, action, targetSlots, move.name, secondary.boosts, chance);
      addBoostSuggestions(
        suggestions,
        state,
        action,
        [action.activeSlot],
        move.name,
        secondary.self?.boosts,
        chance,
        "self"
      );

      if (secondary.volatileStatus === "flinch") {
        for (const slot of targetSlots) {
          suggestions.push({
            id: `${action.activeSlot}:${action.moveId}:${slot}:flinched`,
            label: `${displaySpecies(state, slot)} flinched`,
            chancePercent: chance,
            effect: { kind: "action-denied", slot, reason: "flinched" }
          });
        }
      }
    }
  }

  return uniqueSuggestions(suggestions);
}

function applyTimedMoveEffects(
  battle: ReturnType<typeof createHydratedBattleFromState>,
  action: Extract<ObservedAction, { type: "move" }>
): void {
  const side = action.activeSlot.startsWith("p1") ? battle.p1 : battle.p2;
  const source = side.active[action.activeSlot.endsWith("a") ? 0 : 1];
  if (!source || source.fainted) return;
  const move = battle.dex.getActiveMove(action.moveId);

  if (move.weather) battle.field.setWeather(move.weather, source, move);
  if (move.terrain) battle.field.setTerrain(move.terrain, source, move);
  if (move.pseudoWeather) battle.field.addPseudoWeather(move.pseudoWeather, source, move);

  if (move.sideCondition) {
    const targetSide = move.target === "foeSide" || action.targetSlot === "opponentSide"
      ? source.side.foe
      : source.side;
    targetSide.addSideCondition(move.sideCondition, source, move);
  }

  if (move.self?.sideCondition) {
    source.side.addSideCondition(move.self.sideCondition, source, move);
  }
}

function fieldFromShowdownSummary(
  summary: ReturnType<typeof captureHydratedBattleState>
): FieldState {
  const weatherDuration = decrementDuration(summary.weatherTurnsRemaining);
  const terrainDuration = decrementDuration(summary.terrainTurnsRemaining);
  const weatherIsPermanent = summary.weather ? permanentWeatherIds.has(summary.weather) : false;
  const weather = summary.weather && (weatherDuration > 0 || weatherIsPermanent)
    ? weatherByShowdownId[summary.weather] ?? null
    : null;
  const terrain = summary.terrain && terrainDuration > 0
    ? terrainByShowdownId[summary.terrain] ?? null
    : null;

  return {
    weather,
    weatherTurnsRemaining: weatherIsPermanent ? 0 : weatherDuration,
    terrain,
    terrainTurnsRemaining: terrainDuration,
    trickRoomTurnsRemaining: decrementDuration(summary.pseudoWeather.trickroom ?? 0),
    magicRoomTurnsRemaining: decrementDuration(summary.pseudoWeather.magicroom ?? 0),
    wonderRoomTurnsRemaining: decrementDuration(summary.pseudoWeather.wonderroom ?? 0),
    gravityTurnsRemaining: decrementDuration(summary.pseudoWeather.gravity ?? 0)
  };
}

function sideConditionsFromShowdownSummary(
  summary: Record<string, { duration?: number; layers?: number }>
): SideConditions {
  return {
    tailwindTurns: decrementDuration(summary.tailwind?.duration ?? 0),
    reflectTurns: decrementDuration(summary.reflect?.duration ?? 0),
    lightScreenTurns: decrementDuration(summary.lightscreen?.duration ?? 0),
    auroraVeilTurns: decrementDuration(summary.auroraveil?.duration ?? 0),
    safeguardTurns: decrementDuration(summary.safeguard?.duration ?? 0),
    stealthRock: Boolean(summary.stealthrock),
    stickyWeb: Boolean(summary.stickyweb),
    spikesLayers: summary.spikes?.layers ?? 0,
    toxicSpikesLayers: summary.toxicspikes?.layers ?? 0
  };
}

function addStatusSuggestions(
  suggestions: EffectSuggestion[],
  state: BattleState,
  action: Extract<ObservedAction, { type: "move" }>,
  targetSlots: ActivePokemon["slot"][],
  moveName: string,
  status: string | undefined,
  chancePercent: number
): void {
  if (!status || !isStatusCondition(status)) return;
  for (const slot of targetSlots) {
    suggestions.push({
      id: `${action.activeSlot}:${action.moveId}:${slot}:${status}`,
      label: `${displaySpecies(state, slot)} became ${statusLabel(status)}`,
      chancePercent,
      effect: { kind: "status-applied", slot, status }
    });
  }
}

function addBoostSuggestions(
  suggestions: EffectSuggestion[],
  state: BattleState,
  action: Extract<ObservedAction, { type: "move" }>,
  targetSlots: ActivePokemon["slot"][],
  moveName: string,
  boosts: Partial<StatBoosts> | undefined,
  chancePercent: number,
  suffix = "target"
): void {
  if (!boosts || Object.keys(boosts).length === 0) return;
  for (const slot of targetSlots) {
    const pokemon = findActive(state, slot);
    if (!pokemon) continue;
    const nextBoosts = { ...pokemon.boosts };
    for (const [stat, stages] of Object.entries(boosts) as Array<[keyof StatBoosts, number]>) {
      nextBoosts[stat] = Math.max(-6, Math.min(6, nextBoosts[stat] + stages));
    }
    suggestions.push({
      id: `${action.activeSlot}:${action.moveId}:${slot}:boosts:${suffix}`,
      label: `${moveName}: ${displaySpecies(state, slot)} stats changed`,
      chancePercent,
      effect: { kind: "boosts-changed", slot, boosts: nextBoosts }
    });
  }
}

function resolveEffectTargetSlots(
  state: BattleState,
  action: Extract<ObservedAction, { type: "move" }>
): ActivePokemon["slot"][] {
  if (action.targetSlot === "self") return [action.activeSlot];
  if (action.targetSlot === "opponentSide") {
    const opponentSide: PlayerSide = action.activeSlot.startsWith("p1") ? "p2" : "p1";
    return state.teams[opponentSide].active.filter((pokemon) => !isFainted(pokemon)).map((pokemon) => pokemon.slot);
  }
  if (action.targetSlot === "field" || action.targetSlot === "allySide") return [];
  return [action.targetSlot];
}

function uniqueSuggestions(suggestions: EffectSuggestion[]): EffectSuggestion[] {
  return [...new Map(suggestions.map((suggestion) => [suggestion.id, suggestion])).values()];
}

function findActive(state: BattleState, slot: ActivePokemon["slot"]): ActivePokemon | undefined {
  const side = slot.slice(0, 2) as PlayerSide;
  return state.teams[side].active.find((pokemon) => pokemon.slot === slot);
}

function displaySpecies(state: BattleState, slot: ActivePokemon["slot"]): string {
  const pokemon = findActive(state, slot);
  return pokemon?.set.displayName ?? pokemon?.set.speciesId ?? slot;
}

function decrementDuration(duration: number): number {
  return Math.max(0, duration - 1);
}

function isFainted(pokemon: ActivePokemon): boolean {
  return pokemon.hp.unit === "exact" ? pokemon.hp.current === 0 : pokemon.hp.percent === 0;
}

function isStatusCondition(status: string): status is Exclude<StatusCondition, "healthy"> {
  return ["brn", "par", "slp", "frz", "psn", "tox"].includes(status);
}

function statusLabel(status: Exclude<StatusCondition, "healthy">): string {
  return ({ brn: "burned", par: "paralyzed", slp: "asleep", frz: "frozen", psn: "poisoned", tox: "badly poisoned" })[status];
}
