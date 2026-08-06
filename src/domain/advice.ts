// Future advice result model.
//
// This module should describe the ranked output returned by /analyze.
// The advisor should return multiple candidate actions so a learner can see
// the tradeoffs instead of receiving one mysterious "best move."
//
// Planned result fields:
// - action: move, switch, target, and side-specific action metadata.
// - rank: sorted position among legal actions.
// - score: normalized numeric value used for comparison.
// - confidence: how strongly the advisor prefers this action over alternatives.
// - explanationTags: compact labels such as KO chance, damage, speed control,
//   defensive safety, setup value, board position, or high risk.
// - outcomeSummary: short text explaining the likely simulated result.
// - debug details: optional raw simulator/search values for learning and tests.
//
// Keep user-facing explanations separate from raw scoring internals so the API
// can later support both beginner-friendly and advanced output modes.
