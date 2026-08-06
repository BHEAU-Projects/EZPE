// Future /analyze route.
//
// This route should validate incoming structured JSON with Zod before any
// simulator or advisor work runs. Invalid battle states should return clear
// validation errors that explain which field is missing or malformed.
//
// Planned request flow:
// 1. Parse the request body into the BattleState shape.
// 2. Confirm the requested Champions regulation is known.
// 3. Ask the move ranker to score every legal player action.
// 4. Return ranked advice with scores, confidence, explanation tags, and a
//    compact expected-outcome summary.
//
// Avoid putting battle logic here. The route should orchestrate modules, not
// become the advisor itself.
