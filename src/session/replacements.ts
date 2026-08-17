import {
  battleStateSchema,
  type ActivePokemon,
  type BattleState,
  type PlayerSide,
  type PokemonSet
} from "../domain/battle-state.js";
import { applyBattleEvent } from "./state-reducer.js";
import type {
  ReplacementChoice,
  ReplacementRequest,
  ReplacementSelection
} from "./turn-report.js";

export type RevealedSpeciesBySide = Record<PlayerSide, Set<string>>;

export interface AppliedReplacements {
  state: BattleState;
  events: Array<ReturnType<typeof replacementEvent>>;
}

export function createInitialRevealedSpecies(state: BattleState): RevealedSpeciesBySide {
  return {
    p1: new Set([...state.teams.p1.active, ...state.teams.p1.bench].map((pokemon) => pokemon.set.speciesId)),
    p2: new Set(
      state.teams.p2.previewRoster
        ? state.teams.p2.active.map((pokemon) => pokemon.set.speciesId)
        : [...state.teams.p2.active, ...state.teams.p2.bench].map((pokemon) => pokemon.set.speciesId)
    )
  };
}

export function recordActiveSpecies(
  state: BattleState,
  revealed: RevealedSpeciesBySide
): void {
  for (const side of ["p1", "p2"] as const) {
    for (const pokemon of state.teams[side].active) revealed[side].add(pokemon.set.speciesId);
  }
}

export function findReplacementRequests(
  state: BattleState,
  revealed: RevealedSpeciesBySide
): ReplacementRequest[] {
  return (["p1", "p2"] as const).flatMap((side) => {
    const emptySlots = state.teams[side].active
      .filter((pokemon) => isFainted(pokemon))
      .map((pokemon) => pokemon.slot)
      .sort();
    const choices = findReplacementChoices(state, side, revealed);
    const requestCount = Math.min(emptySlots.length, maxSelectableChoices(choices, revealed[side]));

    return emptySlots.slice(0, requestCount).map((activeSlot) => ({
      side,
      activeSlot,
      choices: structuredClone(choices)
    }));
  });
}

export function applyReplacementSelections(
  state: BattleState,
  requests: ReplacementRequest[],
  selections: ReplacementSelection[],
  revealed: RevealedSpeciesBySide
): AppliedReplacements {
  if (requests.length === 0) throw new Error("No replacements are currently required.");
  if (selections.length !== requests.length) {
    throw new Error(`Expected ${requests.length} replacement selection(s), received ${selections.length}.`);
  }

  const selectedBySlot = new Map(selections.map((selection) => [selection.activeSlot, selection]));
  const resolved = requests.map((request) => {
    const selection = selectedBySlot.get(request.activeSlot);
    if (!selection || selection.side !== request.side) {
      throw new Error(`Missing replacement selection for ${request.activeSlot}.`);
    }
    const choice = request.choices.find((candidate) => candidate.speciesId === selection.speciesId);
    if (!choice) throw new Error(`${selection.speciesId} is not a valid replacement for ${request.activeSlot}.`);
    return { request, choice };
  });

  for (const side of ["p1", "p2"] as const) {
    const species = resolved.filter(({ request }) => request.side === side).map(({ choice }) => choice.speciesId);
    if (new Set(species).size !== species.length) {
      throw new Error("The same Pokemon cannot fill two active slots.");
    }
  }

  let nextState = battleStateSchema.parse(structuredClone(state));
  const events: Array<ReturnType<typeof replacementEvent>> = [];
  const reservedBenchSlots = new Set(
    resolved.flatMap(({ choice }) => choice.benchSlot === undefined ? [] : [choice.benchSlot])
  );

  for (const { request, choice } of resolved) {
    const benchSlot = choice.benchSlot ?? materializePreviewChoice(
      nextState,
      request.side,
      choice,
      revealed,
      reservedBenchSlots
    );
    reservedBenchSlots.add(benchSlot);
    const event = replacementEvent(request.side, request.activeSlot, benchSlot);
    nextState = applyBattleEvent(nextState, event);
    events.push(event);
    revealed[request.side].add(choice.speciesId);
  }

  recordActiveSpecies(nextState, revealed);
  return { state: battleStateSchema.parse(nextState), events };
}

export function getBattleWinner(
  state: BattleState,
  requests: ReplacementRequest[]
): PlayerSide | null | undefined {
  const sidesWithPending = new Set(requests.map((request) => request.side));
  const defeated = (["p1", "p2"] as const).filter(
    (side) => !state.teams[side].active.some((pokemon) => !isFainted(pokemon)) && !sidesWithPending.has(side)
  );
  if (defeated.length === 0) return undefined;
  if (defeated.length === 2) return null;
  return defeated[0] === "p1" ? "p2" : "p1";
}

function findReplacementChoices(
  state: BattleState,
  side: PlayerSide,
  revealed: RevealedSpeciesBySide
): ReplacementChoice[] {
  const team = state.teams[side];
  const activeSpecies = new Set(team.active.map((pokemon) => pokemon.set.speciesId));
  const faintedSpecies = new Set(team.bench.filter((pokemon) => pokemon.fainted || isFainted(pokemon)).map((pokemon) => pokemon.set.speciesId));
  const benchChoices: ReplacementChoice[] = team.bench
    .filter((pokemon) => !pokemon.fainted && !isFainted(pokemon) && !activeSpecies.has(pokemon.set.speciesId))
    .map((pokemon) => ({
      id: `${side}:bench:${pokemon.benchSlot}`,
      source: "bench",
      benchSlot: pokemon.benchSlot,
      speciesId: pokemon.set.speciesId,
      displayName: pokemon.set.displayName ?? pokemon.set.speciesId
    }));

  if (side === state.playerSide || !team.previewRoster || revealed[side].size >= 4) return benchChoices;
  const benchSpecies = new Set(benchChoices.map((choice) => choice.speciesId));
  const previewChoices = team.previewRoster.flatMap((set, previewIndex) => {
    if (activeSpecies.has(set.speciesId) || faintedSpecies.has(set.speciesId) || benchSpecies.has(set.speciesId)) return [];
    return [{
      id: `${side}:preview:${previewIndex}`,
      source: "preview" as const,
      previewIndex,
      speciesId: set.speciesId,
      displayName: set.displayName ?? set.speciesId
    }];
  });

  return [...benchChoices, ...previewChoices].slice(0, 4);
}

function materializePreviewChoice(
  state: BattleState,
  side: PlayerSide,
  choice: ReplacementChoice,
  revealed: RevealedSpeciesBySide,
  reservedBenchSlots: Set<number>
): number {
  const team = state.teams[side];
  const set = team.previewRoster?.[choice.previewIndex ?? -1];
  if (!set || set.speciesId !== choice.speciesId) {
    throw new Error(`Preview Pokemon ${choice.speciesId} is no longer available.`);
  }

  const replaceable = team.bench.find(
    (pokemon) =>
      !reservedBenchSlots.has(pokemon.benchSlot) &&
      !pokemon.fainted &&
      !isFainted(pokemon) &&
      !revealed[side].has(pokemon.set.speciesId)
  );
  const benchSlot = replaceable?.benchSlot ?? firstFreeBenchSlot(state, side);
  const replacement = createFreshBenchPokemon(set, side === state.playerSide, benchSlot);
  const index = team.bench.findIndex((pokemon) => pokemon.benchSlot === benchSlot);
  if (index === -1) team.bench.push(replacement);
  else team.bench[index] = replacement;
  return benchSlot;
}

function createFreshBenchPokemon(
  set: PokemonSet,
  exactHp: boolean,
  benchSlot: number
): BattleState["teams"][PlayerSide]["bench"][number] {
  return {
    benchSlot,
    set: structuredClone(set),
    hp: exactHp
      ? { unit: "exact", current: set.stats.hp, max: set.stats.hp }
      : { unit: "percent", percent: 100 },
    status: "healthy",
    fainted: false
  };
}

function firstFreeBenchSlot(state: BattleState, side: PlayerSide): number {
  const used = new Set(state.teams[side].bench.map((pokemon) => pokemon.benchSlot));
  for (let slot = 0; slot <= 5; slot += 1) if (!used.has(slot)) return slot;
  throw new Error(`No bench slot is available for ${side}.`);
}

function maxSelectableChoices(
  choices: ReplacementChoice[],
  revealed: Set<string>
): number {
  const knownChoices = choices.filter((choice) => choice.source === "bench" && revealed.has(choice.speciesId)).length;
  const unseenCapacity = Math.max(0, 4 - revealed.size);
  return Math.min(choices.length, knownChoices + unseenCapacity);
}

function replacementEvent(side: PlayerSide, activeSlot: ActivePokemon["slot"], benchSlot: number) {
  return { type: "switch-observed" as const, side, activeSlot, benchSlot };
}

function isFainted(pokemon: { hp: ActivePokemon["hp"] }): boolean {
  return pokemon.hp.unit === "exact" ? pokemon.hp.current === 0 : pokemon.hp.percent === 0;
}
