// Future advisor tests.
//
// These tests should load battle-state fixtures and verify that the move ranker
// chooses sensible actions for known board states.
//
// Planned scenarios:
// - Obvious KO move ranks first.
// - Protect or switch ranks first when the active Pokemon is threatened.
// - Speed-control move ranks high when it changes the next-turn order.
// - Spread damage is valued correctly in doubles.
// - Risky inaccurate moves are penalized unless the reward is clearly worth it.
//
// Keep fixtures small and readable so each test teaches one battle concept.
