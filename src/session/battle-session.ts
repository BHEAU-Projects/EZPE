import type { AdviceResult, RankMovesInput } from "../domain/advice.js";
import { battleStateSchema, type BattleState } from "../domain/battle-state.js";
import { rankMoves } from "../advisor/move-ranker.js";
import { battleEventSchema, type BattleEvent } from "./battle-events.js";
import { applyBattleEvent } from "./state-reducer.js";
import {
  applyTurnReport,
  turnReportSchema,
  type TurnReport,
  type TurnResolution
} from "./turn-report.js";

export interface BattleSessionOptions {
  maxSnapshots?: number;
}

export interface BattleSession {
  getState(): BattleState;
  replaceState(nextState: BattleState): BattleState;
  applyEvent(event: BattleEvent): BattleState;
  applyTurn(report: TurnReport): TurnResolution;
  rank(input: RankMovesInput): AdviceResult[];
  getHistory(): BattleEvent[];
  getSnapshots(): BattleState[];
  getTurnHistory(): TurnReport[];
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
  const turnHistory: TurnReport[] = [];
  const snapshots: BattleState[] = [structuredClone(state)];

  return {
    getState() {
      return structuredClone(state);
    },

    replaceState(nextState) {
      state = battleStateSchema.parse(structuredClone(nextState));
      history.splice(0, history.length);
      turnHistory.splice(0, turnHistory.length);
      snapshots.splice(0, snapshots.length, structuredClone(state));
      return structuredClone(state);
    },

    applyTurn(report) {
      const parsedReport = turnReportSchema.parse(report);
      const applied = applyTurnReport(state, parsedReport);
      state = applied.state;
      history.push(...structuredClone(applied.events));
      turnHistory.push(structuredClone(parsedReport));
      snapshots.push(structuredClone(state));
      trimSnapshots(snapshots, maxSnapshots);

      return {
        phase: "ready",
        turnNumber: state.turnNumber,
        state: structuredClone(state),
        report: structuredClone(parsedReport),
        replacementRequests: []
      };
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
    },

    getTurnHistory() {
      return structuredClone(turnHistory);
    }
  };
}

function trimSnapshots(snapshots: BattleState[], maxSnapshots: number): void {
  if (snapshots.length > maxSnapshots) {
    snapshots.splice(0, snapshots.length - maxSnapshots);
  }
}
