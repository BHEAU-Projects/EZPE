// Future move-ranking orchestration.
//
// This module should evaluate every legal player action from the current board
// state and sort the actions by expected value.
//
// Planned responsibilities:
// - Ask the simulator adapter for possible outcomes for each legal action.
// - Score those outcomes using the scoring module.
// - Compare actions by score, confidence, and risk profile.
// - Return a ranked list instead of only the top action so users can learn why
//   alternatives are close, risky, or situational.
//
// Initial version should focus on current-turn evaluation. Later versions can
// add opponent response modeling, two-turn search, expectimax, or Monte Carlo
// Tree Search.
