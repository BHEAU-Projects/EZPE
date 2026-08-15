import type {
  ActivePokemon,
  BattleState,
  HpMeasurement,
  LegalAction,
  PlayerSide,
  TargetSlot
} from "../domain/battle-state.js";
import { createHydratedBattleFromState } from "../sim/showdown-adapter.js";

export function generateLegalActions(
  battleState: BattleState,
  side: PlayerSide = battleState.playerSide
): LegalAction[] {
  const battle = createHydratedBattleFromState(battleState);

  try {
    const showdownSide = side === "p1" ? battle.p1 : battle.p2;
    const request = showdownSide.activeRequest;

    if (!request || !("active" in request)) {
      throw new Error(`Expected a move request while generating legal actions for ${side}.`);
    }

    const activePokemon = [...battleState.teams[side].active].sort((a, b) =>
      a.slot.localeCompare(b.slot)
    );
    const actions: LegalAction[] = [];

    request.active.forEach((activeRequest, index) => {
      const pokemon = activePokemon[index];
      if (!pokemon || showdownSide.active[index]?.fainted) return;

      for (const requestedMove of activeRequest.moves) {
        if (requestedMove.disabled || requestedMove.pp === 0) continue;

        const targetSlots = getTargetSlots(
          requestedMove.target ?? battle.dex.moves.get(requestedMove.id).target,
          pokemon.slot,
          battleState
        );

        for (const targetSlot of targetSlots) {
          for (const mechanic of getSpecialMechanicOptions(activeRequest)) {
            actions.push({
              type: "move",
              activeSlot: pokemon.slot,
              moveId: requestedMove.id,
              targetSlot,
              flags: {},
              ...(mechanic ? { specialMechanic: { kind: mechanic } } : {})
            });
          }
        }
      }

      if (!activeRequest.trapped) {
        for (const benchPokemon of battleState.teams[side].bench) {
          if (benchPokemon.fainted || isFainted(benchPokemon.hp)) continue;
          actions.push({
            type: "switch",
            activeSlot: pokemon.slot,
            benchSlot: benchPokemon.benchSlot,
            speciesId: benchPokemon.set.speciesId
          });
        }
      }
    });

    return actions;
  } finally {
    battle.destroy();
  }
}

function getTargetSlots(
  target: string,
  activeSlot: ActivePokemon["slot"],
  battleState: BattleState
): TargetSlot[] {
  const side = activeSlot.slice(0, 2) as PlayerSide;
  const opponentSide = side === "p1" ? "p2" : "p1";
  const allySlots = battleState.teams[side].active
    .filter((pokemon) => pokemon.slot !== activeSlot && !isFainted(pokemon.hp))
    .map((pokemon) => pokemon.slot);
  const opponentSlots = battleState.teams[opponentSide].active
    .filter((pokemon) => !isFainted(pokemon.hp))
    .map((pokemon) => pokemon.slot);

  switch (target) {
    case "normal":
    case "adjacentFoe":
    case "randomNormal":
      return opponentSlots;
    case "any":
      return [...opponentSlots, ...allySlots];
    case "adjacentAlly":
      return allySlots;
    case "adjacentAllyOrSelf":
      return [activeSlot, ...allySlots];
    case "self":
      return ["self"];
    case "foeSide":
    case "allAdjacentFoes":
      return ["opponentSide"];
    case "allySide":
    case "allyTeam":
      return ["allySide"];
    default:
      return ["field"];
  }
}

function getSpecialMechanicOptions(activeRequest: {
  canMegaEvo?: boolean;
  canMegaEvoX?: boolean;
  canMegaEvoY?: boolean;
  canTerastallize?: string;
}): Array<string | null> {
  const mechanics: Array<string | null> = [null];
  if (activeRequest.canMegaEvo) mechanics.push("megaevolution");
  if (activeRequest.canMegaEvoX) mechanics.push("megaevolutionx");
  if (activeRequest.canMegaEvoY) mechanics.push("megaevolutiony");
  if (activeRequest.canTerastallize) mechanics.push("terastallization");
  return mechanics;
}

function isFainted(hp: HpMeasurement): boolean {
  return hp.unit === "exact" ? hp.current === 0 : hp.percent === 0;
}
