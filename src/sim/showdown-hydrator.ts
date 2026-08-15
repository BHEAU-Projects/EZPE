import { toID, type Battle } from "pokemon-showdown";

import type {
  ActivePokemon,
  BattleState,
  HpMeasurement,
  PlayerSide,
  StatBoosts,
  TeamState
} from "../domain/battle-state.js";

export interface HydratedPokemonSummary {
  side: PlayerSide;
  slot: string;
  pokemon: string;
  hp: number;
  maxHp: number;
  fainted: boolean;
  status: string;
  boosts: StatBoosts;
  itemId: string;
  abilityId: string;
  movePp: Record<string, number>;
  volatileEffectIds: string[];
}

export interface HydratedBattleSummary {
  turnNumber: number;
  weather: string | null;
  weatherTurnsRemaining: number;
  terrain: string | null;
  terrainTurnsRemaining: number;
  pseudoWeather: Record<string, number>;
  sideConditions: Record<PlayerSide, Record<string, { duration?: number; layers?: number }>>;
  pokemon: HydratedPokemonSummary[];
}

const weatherIds = {
  rain: "raindance",
  sun: "sunnyday",
  sandstorm: "sandstorm",
  snow: "snow",
  harshsunshine: "desolateland",
  heavyrain: "primordialsea",
  strongwinds: "deltastream"
} as const;

const terrainIds = {
  electric: "electricterrain",
  grassy: "grassyterrain",
  misty: "mistyterrain",
  psychic: "psychicterrain"
} as const;

export function hydrateBattleState(battle: Battle, state: BattleState): HydratedBattleSummary {
  hydratePokemon(battle, state);
  hydrateSideConditions(battle, state);
  hydrateField(battle, state);
  hydrateSpecialMechanics(battle, state);
  battle.turn = state.turnNumber;

  return captureHydratedBattleState(battle);
}

export function toShowdownCurrentHp(hp: HpMeasurement, showdownMaxHp: number): number {
  if (!Number.isInteger(showdownMaxHp) || showdownMaxHp < 1) {
    throw new RangeError("Showdown max HP must be a positive integer.");
  }

  const fraction = hp.unit === "exact" ? hp.current / hp.max : hp.percent / 100;

  if (fraction <= 0) return 0;

  return Math.max(1, Math.min(showdownMaxHp, Math.round(showdownMaxHp * fraction)));
}

export function captureHydratedBattleState(battle: Battle): HydratedBattleSummary {
  const pokemon: HydratedPokemonSummary[] = [];

  for (const sideId of ["p1", "p2"] as const) {
    const side = sideId === "p1" ? battle.p1 : battle.p2;

    side.pokemon.forEach((member, rosterIndex) => {
      const activeIndex = side.active.indexOf(member);
      const slot =
        activeIndex >= 0
          ? `${sideId}${activeIndex === 0 ? "a" : "b"}`
          : `${sideId}bench${rosterIndex}`;

      pokemon.push({
        side: sideId,
        slot,
        pokemon: member.name,
        hp: member.hp,
        maxHp: member.maxhp,
        fainted: member.fainted,
        status: member.status || "healthy",
        boosts: { ...member.boosts },
        itemId: member.item,
        abilityId: member.ability,
        movePp: Object.fromEntries(member.moveSlots.map((move) => [move.id, move.pp])),
        volatileEffectIds: Object.keys(member.volatiles).sort()
      });
    });
  }

  return {
    turnNumber: battle.turn,
    weather: battle.field.weather || null,
    weatherTurnsRemaining: battle.field.weatherState.duration ?? 0,
    terrain: battle.field.terrain || null,
    terrainTurnsRemaining: battle.field.terrainState.duration ?? 0,
    pseudoWeather: Object.fromEntries(
      Object.entries(battle.field.pseudoWeather).map(([id, effect]) => [id, effect.duration ?? 0])
    ),
    sideConditions: {
      p1: summarizeSideConditions(battle.p1.sideConditions),
      p2: summarizeSideConditions(battle.p2.sideConditions)
    },
    pokemon
  };
}

function hydratePokemon(battle: Battle, state: BattleState): void {
  for (const sideId of ["p1", "p2"] as const) {
    const observedPokemon = orderedTeamPokemon(state.teams[sideId]);
    const showdownSide = sideId === "p1" ? battle.p1 : battle.p2;

    observedPokemon.forEach((observed, index) => {
      const pokemon = showdownSide.pokemon[index];
      if (!pokemon) {
        throw new Error(`Showdown is missing team position ${index + 1} for ${sideId}.`);
      }

      pokemon.hp = toShowdownCurrentHp(observed.hp, pokemon.maxhp);
      pokemon.fainted = pokemon.hp === 0;
      pokemon.faintQueued = false;

      pokemon.status = observed.status === "healthy" ? "" : observed.status;
      pokemon.statusState = battle.initEffectState({ id: pokemon.status, target: pokemon });

      if ("boosts" in observed) {
        pokemon.boosts = { ...observed.boosts };
      } else {
        pokemon.boosts = emptyBoosts();
      }

      const itemId = observed.currentItemId === undefined ? observed.set.itemId : observed.currentItemId;
      pokemon.item = toID(itemId ?? "");
      pokemon.itemState = battle.initEffectState({ id: pokemon.item, target: pokemon });

      pokemon.ability = toID(observed.currentAbilityId ?? observed.set.abilityId);
      pokemon.abilityState = battle.initEffectState({ id: pokemon.ability, target: pokemon });

      for (const [moveId, remainingPp] of Object.entries(observed.movePp ?? {})) {
        const moveSlot = pokemon.moveSlots.find((move) => move.id === toID(moveId));
        if (!moveSlot) throw new Error(`${observed.set.speciesId} does not know ${moveId}.`);
        if (remainingPp > moveSlot.maxpp) {
          throw new Error(`${moveId} PP ${remainingPp} exceeds its maximum ${moveSlot.maxpp}.`);
        }
        moveSlot.pp = remainingPp;
      }

      pokemon.volatiles = {};
      if ("volatileEffectIds" in observed) {
        const volatileIds = new Set(observed.volatileEffectIds);
        if (observed.protectedThisTurn) volatileIds.add("protect");

        for (const volatileId of volatileIds) {
          const condition = battle.dex.conditions.get(volatileId);
          if (!condition.exists) throw new Error(`Unknown volatile effect: ${volatileId}`);
          pokemon.volatiles[condition.id] = battle.initEffectState({
            id: condition.id,
            target: pokemon,
            duration: condition.duration
          });
        }
      }
    });

    showdownSide.pokemonLeft = showdownSide.pokemon.filter((pokemon) => !pokemon.fainted).length;
  }
}

function hydrateSideConditions(battle: Battle, state: BattleState): void {
  for (const sideId of ["p1", "p2"] as const) {
    const showdownSide = sideId === "p1" ? battle.p1 : battle.p2;
    const observed = state.teams[sideId].sideConditions;
    showdownSide.sideConditions = {};

    addSideCondition(battle, showdownSide, "tailwind", observed.tailwindTurns);
    addSideCondition(battle, showdownSide, "reflect", observed.reflectTurns);
    addSideCondition(battle, showdownSide, "lightscreen", observed.lightScreenTurns);
    addSideCondition(battle, showdownSide, "auroraveil", observed.auroraVeilTurns);
    addSideCondition(battle, showdownSide, "safeguard", observed.safeguardTurns);
    if (observed.stealthRock) addSideCondition(battle, showdownSide, "stealthrock");
    if (observed.stickyWeb) addSideCondition(battle, showdownSide, "stickyweb");
    if (observed.spikesLayers > 0) {
      addSideCondition(battle, showdownSide, "spikes", undefined, observed.spikesLayers);
    }
    if (observed.toxicSpikesLayers > 0) {
      addSideCondition(
        battle,
        showdownSide,
        "toxicspikes",
        undefined,
        observed.toxicSpikesLayers
      );
    }
  }
}

function hydrateField(battle: Battle, state: BattleState): void {
  battle.field.weather = "";
  battle.field.weatherState = battle.initEffectState({ id: "" });
  battle.field.terrain = "";
  battle.field.terrainState = battle.initEffectState({ id: "" });
  battle.field.pseudoWeather = {};

  if (state.field.weather) {
    const weatherId = weatherIds[state.field.weather];
    battle.field.weather = toID(weatherId);
    battle.field.weatherState = battle.initEffectState({
      id: battle.field.weather,
      target: battle.field,
      duration: state.field.weatherTurnsRemaining
    });
  }

  if (state.field.terrain) {
    const terrainId = terrainIds[state.field.terrain];
    battle.field.terrain = toID(terrainId);
    battle.field.terrainState = battle.initEffectState({
      id: battle.field.terrain,
      target: battle.field,
      duration: state.field.terrainTurnsRemaining
    });
  }

  addPseudoWeather(battle, "trickroom", state.field.trickRoomTurnsRemaining);
  addPseudoWeather(battle, "magicroom", state.field.magicRoomTurnsRemaining);
  addPseudoWeather(battle, "wonderroom", state.field.wonderRoomTurnsRemaining);
  addPseudoWeather(battle, "gravity", state.field.gravityTurnsRemaining);
}

function hydrateSpecialMechanics(battle: Battle, state: BattleState): void {
  for (const sideId of ["p1", "p2"] as const) {
    const observedPokemon = orderedTeamPokemon(state.teams[sideId]);
    const showdownSide = sideId === "p1" ? battle.p1 : battle.p2;
    const megaWasUsed = observedPokemon.some(
      (pokemon) =>
        ["mega", "megaevolution"].includes(pokemon.set.specialMechanic?.kind ?? "") &&
        pokemon.set.specialMechanic?.used
    );

    if (megaWasUsed) {
      showdownSide.pokemon.forEach((pokemon) => {
        pokemon.canMegaEvo = false;
        pokemon.canMegaEvoX = false;
        pokemon.canMegaEvoY = false;
      });
    }
  }
}

function orderedTeamPokemon(
  team: TeamState
): Array<TeamState["active"][number] | TeamState["bench"][number]> {
  const active = [...team.active].sort((a, b) => a.slot.localeCompare(b.slot));
  const bench = [...team.bench].sort((a, b) => a.benchSlot - b.benchSlot);
  return [...active, ...bench];
}

function addSideCondition(
  battle: Battle,
  side: Battle["p1"],
  id: string,
  duration?: number,
  layers?: number
): void {
  if (duration === 0) return;
  const condition = battle.dex.conditions.get(id);
  const effectState = battle.initEffectState({
    id: condition.id,
    target: side,
    source: side.active[0],
    duration
  });
  if (layers !== undefined) effectState.layers = layers;
  side.sideConditions[condition.id] = effectState;
}

function addPseudoWeather(battle: Battle, id: string, duration: number): void {
  if (duration === 0) return;
  const condition = battle.dex.conditions.get(id);
  battle.field.pseudoWeather[condition.id] = battle.initEffectState({
    id: condition.id,
    target: battle.field,
    duration
  });
}

function summarizeSideConditions(
  sideConditions: Battle["p1"]["sideConditions"]
): Record<string, { duration?: number; layers?: number }> {
  return Object.fromEntries(
    Object.entries(sideConditions).map(([id, state]) => [
      id,
      { duration: state.duration, layers: state.layers }
    ])
  );
}

function emptyBoosts(): StatBoosts {
  return { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 };
}
