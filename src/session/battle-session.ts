import type { AdviceResult, RankMovesInput } from "../domain/advice.js";
import { battleStateSchema, type BattleState } from "../domain/battle-state.js";
import { rankMoves } from "../advisor/move-ranker.js";
import { battleEventSchema, type BattleEvent } from "./battle-events.js";
import { applyBattleEvent } from "./state-reducer.js";

export interface BattleSessionOptions {
  maxSnapshots?: number;
}

export interface BattleSession {
  getState(): BattleState;
  replaceState(nextState: BattleState): BattleState;
  applyEvent(event: BattleEvent): BattleState;
  rank(input: RankMovesInput): AdviceResult[];
  getHistory(): BattleEvent[];
  getSnapshots(): BattleState[];
}

export function createBattleSession(
  initialState: BattleState,
  options: BattleSessionOptions = {}
): BattleSession {
  const maxSnapshots = options.maxSnapshots ?? 50;

  if (!Number.isInteger(maxSnapshots) || maxSnapshots < 1) {
    throw new Error("maxSnapshots must be a positive integer.");
  }

  let state = battleStateSchema.parse(structuredClone(initialState));
  const history: BattleEvent[] = [];
  const snapshots: BattleState[] = [structuredClone(state)];

  return {
    getState() {
      return structuredClone(state);
    },

    replaceState(nextState) {
      state = battleStateSchema.parse(structuredClone(nextState));
      history.splice(0, history.length);
      snapshots.splice(0, snapshots.length, structuredClone(state));
      return structuredClone(state);
    },

    applyEvent(event) {
      const parsedEvent = battleEventSchema.parse(event);
      state = applyBattleEvent(state, parsedEvent);
      history.push(structuredClone(parsedEvent));
      snapshots.push(structuredClone(state));

      if (snapshots.length > maxSnapshots) {
        snapshots.splice(0, snapshots.length - maxSnapshots);
      }

      return structuredClone(state);
    },

    rank(input) {
      return rankMoves(state, input);
    },

    getHistory() {
      return structuredClone(history);
    },

    getSnapshots() {
      return structuredClone(snapshots);
    }
  };
}
