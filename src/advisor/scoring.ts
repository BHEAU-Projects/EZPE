// Future scoring model.
//
// This module should turn simulated outcomes into comparable numeric scores.
// Keep the categories explicit so the project teaches how AI evaluation
// functions are built instead of hiding decisions in one opaque number.
//
// Planned scoring categories:
// - KO potential: confirmed KOs, probable KOs, and preventing enemy KOs.
// - Damage value: direct damage, spread damage, chip damage, and damage rolls.
// - Survival: remaining HP, defensive positioning, Protect value, and switch
//   safety.
// - Speed control: Tailwind, Trick Room, paralysis, speed boosts, priority, and
//   whether the board moves before important threats.
// - Board position: active matchup, redirection, fake out pressure, terrain,
//   weather, screens, and side conditions.
// - Setup and disruption: stat boosts, status moves, denial, item removal, and
//   ability interactions.
// - Risk: accuracy, secondary-effect dependence, prediction dependence, and
//   downside if the opponent chooses a common response.
//
// Scores should eventually be inspectable so test fixtures can explain why a
// move ranked above another move.
