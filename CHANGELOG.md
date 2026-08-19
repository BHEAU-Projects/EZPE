# Changelog

This document records how EZPE developed from a learning scaffold into the
current local Pokemon Champions battle advisor. The project does not have
tagged releases yet, so entries are organized chronologically by development
milestone and linked to their checkpoint commits.

## 2026-08-06 - Project Foundation

### Initial scaffold and battle-state contract (`1ced0de`)

- Initialized the npm, Node.js, and TypeScript backend project.
- Added Fastify, Zod, Pokemon Showdown, `@pkmn/dex`, `@pkmn/data`, Vitest,
  ESLint, and `tsx` as the planned stack.
- Created the initial module layout for the API, domain models, advisor,
  simulator, data layer, fixtures, and tests.
- Promoted the original comment-only battle-state sketch into a real Zod
  contract for structured Doubles battle input.
- Modeled teams, active and bench Pokemon, visible HP, stat boosts, field
  state, side conditions, and legal move or switch actions.
- Added the first schema, adapter, and advisor test files.

## 2026-08-15 - Simulation And Advisor Core

### Simulator foundation (`02046fe`)

- Added reusable damage-calculation helpers and focused damage tests.
- Completed the first Pokemon Showdown single-turn adapter.
- Added a representative single-turn battle fixture.
- Added initial Pokemon Champions regulation records and mechanics overrides.
- Added tests for damage, regulations, and expected Showdown behavior.

### Persistent battle sessions and visible HP (`3bc62a9`)

- Implemented the first working advisor types, score breakdown, and move
  ranker.
- Added event-driven battle sessions, a state reducer, and battle event
  contracts so state could be updated between turns.
- Separated exact player HP from percentage-based opponent HP to match the
  information shown during a Champions battle.
- Added session, reducer, schema, advisor, and simulation coverage.

### Authoritative Pokemon data validation (`4f30a06`)

- Added a central Pokemon data service backed by the installed Pokemon data
  packages.
- Added canonical validation for species, forms, moves, Abilities, and items.
- Reduced reliance on manually duplicated move and species information.

### Complete Showdown state hydration (`9e0fef8`)

- Added a Showdown hydrator that reconstructs the current board before a
  candidate turn is simulated.
- Hydrated HP, status, boosts, active slots, teams, and field state into the
  simulator.
- Extended battle events and the reducer to preserve the information needed
  for repeatable turn analysis.

### Legal action generation (`e03d724`)

- Added automatic legal move, target, and switch generation from the current
  battle state.
- Connected generated legal actions to the move ranker.
- Added tests for target shapes, available slots, and generated plans.

### Opponent response search (`0eb0abf`)

- Generated candidate opponent action plans instead of evaluating only one
  fixed response.
- Evaluated player plans against multiple opponent responses.
- Added opponent-branching tests and exposed the selected worst response in
  advice data.

### Editable grading configuration (`8d9c338`)

- Moved subjective ranking weights and thresholds into
  `config/scoring.json`.
- Added validated configuration loading and automatic reload after the file
  changes.
- Kept damage, KO, survival, risk, confidence, and response aggregation
  grading adjustable without changing TypeScript.

## 2026-08-15 - Fast Data Entry And Better Predictions

### Terminal battle workflow (`4a6c246`)

- Added a compact interactive CLI for loading, updating, saving, and ranking
  a live battle session.
- Added Showdown team import and JSON battle-state file support.
- Added commands for fast HP, move, switch, field, and state corrections.
- Added CLI integration tests.

### Accuracy-aware expected damage (`e4a322d`)

- Included move accuracy in expected-damage calculations.
- Preserved damage ranges while distinguishing conditional hit damage from
  accuracy-weighted expected damage.
- Added tests for inaccurate, perfectly accurate, and always-hit moves.

### Inferred opponent movesets (`439296a`)

- Added an offline high-ladder Regulation M-B usage snapshot.
- Assigned popular default moves to opponent Pokemon when their moves were
  still hidden.
- Kept inferred and observed moves separate in battle state.
- Replaced inferred moves with confirmed observations as moves were revealed.
- Added a refresh script for rebuilding the bundled usage snapshot outside a
  live battle.

### Quick Capture browser screen (`6c98878`)

- Added a local Fastify-served browser interface for rapid battle updates.
- Added session API routes and sample-state startup through `npm run dev`.
- Exposed controls for HP, status, moves, switches, boosts, items, field
  effects, and ranking without requiring raw JSON entry.

### Clearer advice presentation (`6b11645`)

- Added a dedicated presenter between advisor output and the UI.
- Replaced ambiguous raw result text with readable scores, expected outcomes,
  explanation tags, actions, targets, and damage summaries.
- Displayed the player's known move list and PP information.

### Plan-specific enemy responses (`37cbeaf`)

- Attached each recommendation to the opponent response that hurts that plan
  most.
- Displayed enemy move users, targets, expected incoming damage, hit chance,
  and critical maximums in the same recommendation panel.
- Used percentages when describing damage dealt to opposing Pokemon.

## 2026-08-17 - Pokemon Champions Team Setup

### Team setup flow (`19eefaa`)

- Added a browser setup process for entering the player's complete roster.
- Added fields for battle-relevant form, gender, Ability, item, build, and
  moves.
- Added a lightweight opponent preview that only requires visible information
  and fills hidden details with local assumptions.
- Connected setup output to a new battle session and the Quick Capture screen.

### Champions Stat Points migration (`7cfdfad`)

- Replaced player-facing IV and EV entry with Pokemon Champions Stat Points.
- Modeled Stat Alignment, six 0-32 Stat Point values, and the 66-point total
  limit.
- Fixed level 50 and maximum-equivalent IVs internally.
- Added legacy Showdown EV conversion at the import boundary.
- Removed opponent Stat Point input and generated hidden opponent builds from
  local assumptions.

### Setup order aligned with a real match (`481767d`)

- Reordered setup to match when information becomes available in Champions.
- The flow now records the player's roster, the opposing team preview, the
  player's selected four, and then the opponent's opening leads.
- Removed the irrelevant player nickname field.
- Added validation and tests for each setup stage.

## 2026-08-17 - Fast Turn-By-Turn Workflow

### Atomic turn reports (`a585ae7`)

- Added `TurnReport`, observed action, observed HP, and confirmed effect
  contracts.
- Added transactional turn resolution so invalid reports cannot partially
  mutate a battle session.
- Advanced the turn and refreshed recommendations after one End Turn action.
- Preserved individual battle events for manual corrections.

### Reduced-side battles (`fb1aac9`)

- Updated plan generation for one occupied active slot.
- Added internal pass behavior for missing Doubles slots.
- Supported 1v1, 1v2, no-reserve, replacement-required, and battle-over
  states without requiring two moves per side.

### Automatic turn effects (`7aaf383`)

- Added data-driven extraction and advancement of weather, terrain, rooms,
  screens, Tailwind, side conditions, status, and stat changes.
- Applied deterministic move effects automatically.
- Added contextual confirmation for visible random effects rather than
  assuming they occurred.
- Tracked effect duration at the start of the next turn, including supported
  duration modifiers.

### Secondary-effect-aware scoring (`7f1ce11`)

- Extended outcome summaries with status, stat changes, action denial,
  misses, failures, field control, forced movement, and item changes.
- Added grading weights for major status, speed control, stat changes, action
  denial, field control, defensive effects, and forced switching.
- Added probability-aware valuation for secondary effects.
- Added focused tests for Fake Out, paralysis, Icy Wind, misses, critical
  hits, and KO-before-action behavior.

### Forced replacement workflow (`e0f3793`)

- Added replacement requests immediately after a Pokemon faints.
- Added one-tap player choices from the selected four and opponent choices
  from known non-active preview Pokemon.
- Supported simultaneous replacements while preventing duplicate selections.
- Continued with one Pokemon when no reserve remained and returned battle
  completion when a side had no Pokemon left.

### Fast turn capture screen (`2a40862`)

- Rebuilt the live battle screen around the 30-second turn workflow.
- Added quick action buttons, automatic targets where unambiguous, prefilled
  HP, effect chips, End Turn submission, and immediate replacement choices.
- Renamed ranking settings to Recommendations and Opponent scenarios and moved
  them into Advanced Settings.
- Added stale-request protection and warm ranking performance coverage.

## 2026-08-18 - Advice And State Corrections

### Battle advice state and presentation fixes (`bea3765`)

- Fixed switches so the outgoing Pokemon's HP is not applied to the incoming
  Pokemon.
- Added consecutive Protect tracking and failure risk so repeated Protect is
  no longer valued as if it had full success probability.
- Deduplicated equivalent ranked recommendations.
- Added per-target expected damage for spread moves instead of reporting no
  direct damage.
- Marked opposing moves as confirmed or predicted.
- Added move-category styling using Pokemon type colors.
- Preserved effect and protection state through session updates and Showdown
  hydration.
- Added regression tests for all of the above behavior.

## 2026-08-19 - Champions-Native Scoring Upgrade

### PKMoveScoring strategy audit

- Audited the Platinum Kaizo AI move-scoring reference as a strategy taxonomy,
  not as a mechanics implementation.
- Recorded which ideas transfer to a Champions Doubles advisor, which Gen IV
  assumptions must be rejected, and which behavior remains delegated to the
  Pokemon Showdown Champions mod.
- Defined ranked closed-information and VGC open-team-sheet contexts without
  inventing probabilities for unknown opponent choices.
- Added a staged implementation and regression-test matrix for battle memory,
  outcome extraction, contextual scoring, opponent aggregation, and advice
  confidence.

## Current Snapshot

EZPE is currently a local TypeScript application at version `0.1.0`. It can:

- Build a Champions-compatible player roster and lightweight opponent preview.
- Track a battle turn by turn using exact player HP and opponent HP percentages.
- Infer hidden opponent moves locally and replace predictions with observations.
- Reconstruct battle state in Pokemon Showdown and simulate complete Doubles
  action plans.
- Rank plans against generated opponent scenarios using editable grading
  weights.
- Account for accuracy, damage rolls, critical hits, KOs before action,
  secondary effects, field effects, action denial, switches, and replacements.
- Run through the browser with `npm run dev` or through the terminal workflow.

The advisor is currently a mechanics-driven search and scoring system, not a
trained machine-learning model. Pokemon Showdown and the installed Pokemon data
packages are the mechanics and metadata baseline; confirmed Champions
differences belong in the regulation and override layers. Battle capture is
still manual, and visual capture or automated game-state recognition has not
yet been implemented.
