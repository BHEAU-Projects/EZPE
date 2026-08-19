import {
  battleStateSchema,
  type ActivePokemon,
  type BattleState,
  type PlayerSide
} from "../domain/battle-state.js";
import { pokemonDataService } from "../data/pokemon-data-service.js";
import { battleEventSchema, type BattleEvent } from "./battle-events.js";

const emptyBoosts: ActivePokemon["boosts"] = {
  atk: 0,
  def: 0,
  spa: 0,
  spd: 0,
  spe: 0,
  accuracy: 0,
  evasion: 0
};

export function applyBattleEvent(state: BattleState, event: BattleEvent): BattleState {
  const currentState = battleStateSchema.parse(state);
  const parsedEvent = battleEventSchema.parse(event);
  const nextState = structuredClone(currentState);

  switch (parsedEvent.type) {
    case "turn-started":
      nextState.turnNumber = parsedEvent.turnNumber;
      nextState.teams.p1.active.forEach((pokemon) => {
        pokemon.protectedThisTurn = false;
      });
      nextState.teams.p2.active.forEach((pokemon) => {
        pokemon.protectedThisTurn = false;
      });
      if (parsedEvent.legalActions) {
        nextState.legalActions = parsedEvent.legalActions;
      }
      break;

    case "damage-observed": {
      const pokemon = findActivePokemon(nextState, parsedEvent.slot);

      if (pokemon.hp.unit !== parsedEvent.remainingHp.unit) {
        throw new Error(
          `HP for ${parsedEvent.slot} must be observed as ${pokemon.hp.unit}, not ${parsedEvent.remainingHp.unit}.`
        );
      }

      if (parsedEvent.remainingHp.unit === "exact") {
        if (pokemon.hp.unit !== "exact") {
          throw new Error(`HP for ${parsedEvent.slot} is not stored as exact HP.`);
        }
        if (parsedEvent.remainingHp.current > pokemon.hp.max) {
          throw new Error(
            `Observed HP ${parsedEvent.remainingHp.current} exceeds ${parsedEvent.slot}'s max HP ${pokemon.hp.max}.`
          );
        }
        pokemon.hp.current = parsedEvent.remainingHp.current;
      } else {
        if (pokemon.hp.unit !== "percent") {
          throw new Error(`HP for ${parsedEvent.slot} is not stored as percentage HP.`);
        }
        pokemon.hp.percent = parsedEvent.remainingHp.percent;
      }
      break;
    }

    case "faint-observed": {
      const pokemon = findActivePokemon(nextState, parsedEvent.slot);
      if (pokemon.hp.unit === "exact") {
        pokemon.hp.current = 0;
      } else {
        pokemon.hp.percent = 0;
      }
      break;
    }

    case "switch-observed":
      applySwitch(nextState, parsedEvent.side, parsedEvent.activeSlot, parsedEvent.benchSlot);
      break;

    case "status-applied":
      findActivePokemon(nextState, parsedEvent.slot).status = parsedEvent.status;
      break;

    case "status-cleared":
      findActivePokemon(nextState, parsedEvent.slot).status = "healthy";
      break;

    case "boosts-changed":
      findActivePokemon(nextState, parsedEvent.slot).boosts = parsedEvent.boosts;
      break;

    case "item-changed":
      findActivePokemon(nextState, parsedEvent.slot).currentItemId = parsedEvent.itemId;
      break;

    case "ability-changed":
      findActivePokemon(nextState, parsedEvent.slot).currentAbilityId = parsedEvent.abilityId;
      break;

    case "move-observed":
      applyObservedMove(nextState, parsedEvent.slot, parsedEvent.moveId);
      break;

    case "move-memory-updated": {
      const pokemon = findActivePokemon(nextState, parsedEvent.slot);
      pokemon.lastMoveId = parsedEvent.moveId;
      pokemon.lastMoveTurn = parsedEvent.turnNumber;
      pokemon.lastMoveResult = parsedEvent.result;
      break;
    }

    case "active-turn-advanced": {
      const pokemon = findActivePokemon(nextState, parsedEvent.slot);
      pokemon.turnsActive = Math.min(999, pokemon.turnsActive + 1);
      break;
    }

    case "move-pp-changed": {
      const pokemon = findActivePokemon(nextState, parsedEvent.slot);
      if (!pokemon.set.moveIds.includes(parsedEvent.moveId)) {
        throw new Error(`${pokemon.set.speciesId} does not know ${parsedEvent.moveId}.`);
      }
      pokemon.movePp = { ...pokemon.movePp, [parsedEvent.moveId]: parsedEvent.remainingPp };
      break;
    }

    case "volatiles-changed":
      updateVolatiles(findActivePokemon(nextState, parsedEvent.slot), parsedEvent.volatileEffectIds);
      break;

    case "special-mechanic-used": {
      const pokemon = findActivePokemon(nextState, parsedEvent.slot);
      if (pokemon.set.specialMechanic?.kind !== parsedEvent.kind) {
        throw new Error(`${pokemon.set.speciesId} does not have special mechanic ${parsedEvent.kind}.`);
      }
      pokemon.set.specialMechanic.used = true;
      break;
    }

    case "field-changed":
      nextState.field = { ...nextState.field, ...parsedEvent.changes };
      break;

    case "side-condition-changed":
      nextState.teams[parsedEvent.side].sideConditions = {
        ...nextState.teams[parsedEvent.side].sideConditions,
        ...parsedEvent.changes
      };
      break;

    case "legal-actions-updated":
      nextState.legalActions = parsedEvent.legalActions;
      break;
  }

  return battleStateSchema.parse(nextState);
}

function findActivePokemon(state: BattleState, slot: ActivePokemon["slot"]): ActivePokemon {
  const side = slot.slice(0, 2) as PlayerSide;
  const pokemon = state.teams[side].active.find((candidate) => candidate.slot === slot);

  if (!pokemon) {
    throw new Error(`No active Pokemon exists in slot ${slot}.`);
  }

  return pokemon;
}

function applySwitch(
  state: BattleState,
  side: PlayerSide,
  activeSlot: ActivePokemon["slot"],
  benchSlot: number
): void {
  const team = state.teams[side];
  const activeIndex = team.active.findIndex((pokemon) => pokemon.slot === activeSlot);
  const benchIndex = team.bench.findIndex((pokemon) => pokemon.benchSlot === benchSlot);

  if (activeIndex === -1) {
    throw new Error(`No active Pokemon exists in slot ${activeSlot}.`);
  }

  if (benchIndex === -1) {
    throw new Error(`No bench Pokemon exists in slot ${benchSlot} for ${side}.`);
  }

  const outgoingPokemon = team.active[activeIndex];
  const incomingPokemon = team.bench[benchIndex];

  if (incomingPokemon.fainted || isFainted(incomingPokemon.hp)) {
    throw new Error(`Cannot switch a fainted Pokemon into ${activeSlot}.`);
  }

  team.active[activeIndex] = {
    slot: activeSlot,
    set: incomingPokemon.set,
    hp: incomingPokemon.hp,
    status: incomingPokemon.status,
    boosts: structuredClone(emptyBoosts),
    volatileEffectIds: [],
    volatileEffects: [],
    turnsActive: 0,
    lastMoveId: null,
    lastMoveTurn: null,
    lastMoveResult: null,
    protectedThisTurn: false,
    protectStreak: 0,
    currentItemId: incomingPokemon.currentItemId,
    currentAbilityId: incomingPokemon.currentAbilityId,
    movePp: incomingPokemon.movePp
  };

  team.bench[benchIndex] = {
    benchSlot,
    set: outgoingPokemon.set,
    hp: outgoingPokemon.hp,
    status: outgoingPokemon.status,
    fainted: isFainted(outgoingPokemon.hp),
    currentItemId: outgoingPokemon.currentItemId,
    currentAbilityId: outgoingPokemon.currentAbilityId,
    movePp: outgoingPokemon.movePp
  };
}

function updateVolatiles(pokemon: ActivePokemon, volatileEffectIds: string[]): void {
  const existing = new Map(pokemon.volatileEffects.map((effect) => [effect.id, effect]));
  pokemon.volatileEffectIds = [...new Set(volatileEffectIds)];
  pokemon.volatileEffects = pokemon.volatileEffectIds.map((id) => existing.get(id) ?? { id });
}

function applyObservedMove(
  state: BattleState,
  slot: ActivePokemon["slot"],
  moveId: string
): void {
  const side = slot.slice(0, 2) as PlayerSide;
  if (side === state.playerSide) {
    throw new Error("move-observed is for revealing an opponent move; player moves are already known.");
  }

  const pokemon = findActivePokemon(state, slot);
  if (!pokemonDataService.getMove(state.regulationId, moveId)) {
    throw new Error(`Cannot record unknown move ${moveId}.`);
  }
  const knowledge = pokemon.set.moveKnowledge ?? {
    source: "fallback" as const,
    observedMoveIds: [],
    assumedMoveIds: [...pokemon.set.moveIds]
  };
  if (knowledge.observedMoveIds.includes(moveId)) return;
  if (knowledge.observedMoveIds.length === 4) {
    throw new Error(`${pokemon.set.speciesId} already has four observed moves.`);
  }

  const observedMoveIds = [...knowledge.observedMoveIds, moveId];
  const assumedMoveIds = knowledge.assumedMoveIds
    .filter((assumedMoveId) => !observedMoveIds.includes(assumedMoveId))
    .slice(0, 4 - observedMoveIds.length);
  const set = {
    ...pokemon.set,
    moveIds: [...observedMoveIds, ...assumedMoveIds],
    moveKnowledge: {
      ...knowledge,
      observedMoveIds,
      assumedMoveIds
    }
  };
  pokemon.set = set;
}

function isFainted(hp: ActivePokemon["hp"]): boolean {
  return hp.unit === "exact" ? hp.current === 0 : hp.percent === 0;
}
