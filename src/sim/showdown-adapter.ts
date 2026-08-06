// Future Pokemon Showdown simulation adapter.
//
// This module should isolate every direct dependency on Pokemon Showdown and
// the @pkmn data packages. Other parts of the app should call an adapter API
// instead of importing simulator internals directly.
//
// Planned responsibilities:
// - Convert the structured BattleState model into a simulator-ready doubles
//   battle state.
// - Enumerate legal actions when the battle state does not provide them.
// - Simulate current-turn move pairs, switches, target choices, priority,
//   speed order, damage, status, weather, terrain, and field effects.
// - Surface deterministic outputs and probability-weighted outcomes for moves
//   with accuracy checks, secondary effects, damage rolls, or random targeting.
// - Keep Champions-specific overrides pluggable so the baseline simulator data
//   can be patched without scattering exceptions through the codebase.
//
// Accuracy note: Pokemon Showdown is the first mechanics baseline, not the
// final authority for every Pokemon Champions regulation difference.
