import type { LegalAction, PlayerSide } from "./battle-state.js";
import type { SingleTurnSimulationResult } from "../sim/showdown-adapter.js";

export type ExplanationTag =
  | "confirmed-ko"
  | "heavy-damage"
  | "took-damage"
  | "low-risk"
  | "high-risk"
  | "inflicted-status"
  | "action-denial"
  | "speed-control"
  | "field-control"
  | "forced-switch"
  | "miss-risk"
  | "healing"
  | "order-swing"
  | "useful-setup"
  | "wasted-action"
  | "ally-synergy"
  | "item-denial"
  | "residual-pressure";

export interface ActionPlan {
  id: string;
  side: PlayerSide;
  actions: LegalAction[];
  showdownChoice: string;
}

export interface ScoreBreakdown {
  damageDealt: number;
  damageTaken: number;
  damageDealtPercent: number;
  damageTakenPercent: number;
  healingReceivedPercent: number;
  healingAllowedPercent: number;
  kosDealt: number;
  kosTaken: number;
  playerRemainingHp: number;
  opponentRemainingHp: number;
  riskPenalty: number;
  statusesInflicted: number;
  statusesTaken: number;
  actionsDenied: number;
  actionsLost: number;
  statStageAdvantage: number;
  speedControl: number;
  fieldControl: number;
  sideConditionAdvantage: number;
  forcedSwitches: number;
  effectiveSpeedSwings: number;
  usefulBoostValue: number;
  tacticalEffectValue: number;
  wastedActions: number;
  informationConfidence: number;
  itemsRemoved: number;
  residualPressure: number;
  allySynergy: number;
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
    opponentEvaluation: {
      expectedScore: number;
      worstCaseScore: number;
      bestCaseScore: number;
      mechanicsExpectedScore: number;
      scenarioMeanScore: number;
      worstResponseScore: number;
      branchAgreement: number;
      responseCount: number;
      simulationCount: number;
      worstOpponentChoice: string;
    };
  };
}

export type SimulationSeed = readonly [number, number, number, number];

export interface RankMovesInput {
  opponentChoice?: string;
  opponentChoices?: string[];
  maxOpponentPlans?: number;
  p1TeamPreviewChoice?: string;
  p2TeamPreviewChoice?: string;
  seed?: SimulationSeed;
  seeds?: SimulationSeed[];
}
