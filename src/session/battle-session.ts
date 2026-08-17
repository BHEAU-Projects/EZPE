import type { AdviceResult, RankMovesInput } from "../domain/advice.js";
import { battleStateSchema, type BattleState } from "../domain/battle-state.js";
import { rankMoves } from "../advisor/move-ranker.js";
import { battleEventSchema, type BattleEvent } from "./battle-events.js";
import { applyBattleEvent } from "./state-reducer.js";
import {
  applyTurnReport,
  replacementSubmissionSchema,
  turnReportSchema,
  type TurnReport,
  type TurnResolution
} from "./turn-report.js";
import type { ReplacementSubmission } from "./turn-report.js";
import {
  applyReplacementSelections,
  createInitialRevealedSpecies,
  findReplacementRequests,
  getBattleWinner,
  recordActiveSpecies
} from "./replacements.js";

export interface BattleSessionOptions {
  maxSnapshots?: number;
}

export interface BattleSession {
  getState(): BattleState;
  replaceState(nextState: BattleState): BattleState;
  applyEvent(event: BattleEvent): BattleState;
  applyTurn(report: TurnReport): TurnResolution;
  applyReplacements(submission: ReplacementSubmission): TurnResolution;
  rank(input: RankMovesInput): AdviceResult[];
  getHistory(): BattleEvent[];
  getSnapshots(): BattleState[];
  getTurnHistory(): TurnReport[];
  getReplacementRequests(): TurnResolution["replacementRequests"];
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
  let revealedSpecies = createInitialRevealedSpecies(state);
  let replacementRequests = findReplacementRequests(state, revealedSpecies);
  const history: BattleEvent[] = [];
  const turnHistory: TurnReport[] = [];
  const snapshots: BattleState[] = [structuredClone(state)];

  return {
    getState() {
      return structuredClone(state);
    },

    replaceState(nextState) {
      state = battleStateSchema.parse(structuredClone(nextState));
      revealedSpecies = createInitialRevealedSpecies(state);
      replacementRequests = findReplacementRequests(state, revealedSpecies);
      history.splice(0, history.length);
      turnHistory.splice(0, turnHistory.length);
      snapshots.splice(0, snapshots.length, structuredClone(state));
      return structuredClone(state);
    },

    applyTurn(report) {
      const parsedReport = turnReportSchema.parse(report);
      const applied = applyTurnReport(state, parsedReport);
      state = applied.state;
      recordActiveSpecies(state, revealedSpecies);
      replacementRequests = findReplacementRequests(state, revealedSpecies);
      history.push(...structuredClone(applied.events));
      turnHistory.push(structuredClone(parsedReport));
      snapshots.push(structuredClone(state));
      trimSnapshots(snapshots, maxSnapshots);

      const winner = getBattleWinner(state, replacementRequests);
      return {
        phase: winner !== undefined
          ? "battle-over"
          : replacementRequests.length > 0
            ? "replacement-required"
            : "ready",
        turnNumber: state.turnNumber,
        state: structuredClone(state),
        report: structuredClone(parsedReport),
        replacementRequests: structuredClone(replacementRequests),
        ...(winner !== undefined ? { winner } : {})
      };
    },

    applyReplacements(submission) {
      const parsedSubmission = replacementSubmissionSchema.parse(submission);
      const applied = applyReplacementSelections(
        state,
        replacementRequests,
        parsedSubmission.replacements,
        revealedSpecies
      );
      state = applied.state;
      history.push(...structuredClone(applied.events));
      replacementRequests = findReplacementRequests(state, revealedSpecies);
      snapshots.push(structuredClone(state));
      trimSnapshots(snapshots, maxSnapshots);
      const winner = getBattleWinner(state, replacementRequests);

      return {
        phase: winner !== undefined
          ? "battle-over"
          : replacementRequests.length > 0
            ? "replacement-required"
            : "ready",
        turnNumber: state.turnNumber,
        state: structuredClone(state),
        replacementRequests: structuredClone(replacementRequests),
        ...(winner !== undefined ? { winner } : {})
      };
    },

    applyEvent(event) {
      const parsedEvent = battleEventSchema.parse(event);
      state = applyBattleEvent(state, parsedEvent);
      recordActiveSpecies(state, revealedSpecies);
      replacementRequests = findReplacementRequests(state, revealedSpecies);
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
    },

    getReplacementRequests() {
      return structuredClone(replacementRequests);
    }
  };
}

function trimSnapshots(snapshots: BattleState[], maxSnapshots: number): void {
  if (snapshots.length > maxSnapshots) {
    snapshots.splice(0, snapshots.length - maxSnapshots);
  }
}
