import type { LegalAction, PlayerSide } from "./battle-state.js";
import type { SingleTurnSimulationResult } from "../sim/showdown-adapter.js";

export type ExplanationTag =
  | "confirmed-ko"
  | "heavy-damage"
  | "took-damage"
  | "low-risk"
  | "high-risk";

export interface ActionPlan {
  id: string;
  side: PlayerSide;
  actions: LegalAction[];
  showdownChoice: string;
}

export interface ScoreBreakdown {
  damageDealt: number;
  damageTaken: number;
  kosDealt: number;
  kosTaken: number;
  playerRemainingHp: number;
  opponentRemainingHp: number;
  riskPenalty: number;
}

export interface AdviceResult {
  rank: number;
  actionPlan: ActionPlan;
  score: number;
  confidence: number;
  explanationTags: ExplanationTag[];
  outcomeSummary: string;
  debug: {
    scoreBreakdown: ScoreBreakdown;
    simulation: SingleTurnSimulationResult;
  };
}

export interface RankMovesInput {
  opponentChoice: string;
  p1TeamPreviewChoice?: string;
  p2TeamPreviewChoice?: string;
  seed?: readonly [number, number, number, number];
}
