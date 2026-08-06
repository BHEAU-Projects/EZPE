// Future Pokemon Champions regulation data.
//
// This module should track season/regulation snapshots separately from battle
// mechanics. Regulations change over time, so the advisor should be able to
// analyze a state under a specific ruleset instead of assuming one permanent
// format.
//
// Planned data:
// - Regulation id, name, start/end dates, and supported battle format.
// - Legal Pokemon, legal forms, restricted Pokemon rules, and team constraints.
// - Legal moves, items, abilities, Mega availability, and special mechanics.
// - Links or notes describing where each snapshot came from.
//
// Keep regulation data versioned and testable. A future data refresh script can
// update these snapshots without changing advisor logic.
