# EZPE

EZPE is a backend-only learning project for exploring AI through Pokemon Champions battle-state analysis.

The long-term goal is to accept a structured battle state from Pokemon Champions Doubles/VGC and return a ranked list of the best legal actions. Accuracy comes first: visual polish, frontend work, screenshot parsing, and automation can wait until the battle logic is trustworthy.

## Current Status

The project currently has a validated battle-state contract, regulation snapshots, damage utilities, a single-turn Pokemon Showdown adapter, a first-pass move ranker, and an event-driven battle session. The API layer and live game-state capture are not implemented yet.

## Planned Commands

```bash
npm run dev
npm run cli -- --sample
npm run typecheck
npm test
```

Use `typecheck` and `test` after changing schemas, mechanics, simulation, or advisor behavior.

## Scoring Configuration

All subjective advisor grading lives in `config/scoring.json`. Adjust its damage, KO,
risk, opponent-aggregation, threshold, and confidence values without editing TypeScript.
The running process reloads the validated file when its modification time changes.

## Terminal Workflow

Start immediately with the sample state:

```bash
npm run cli -- --sample
```

Load a saved session or state with `npm run cli -- --state battle-session.json`.
To start from team exports, provide two Showdown-format files containing the four
selected Pokemon in battle order (two leads, then two bench Pokemon):

```bash
npm run cli -- --player-team player.txt --opponent-team opponent.txt --regulation development
```

Inside the CLI, use `help` to list compact update and ranking commands.

## Planned Input Concept

The first real version should accept structured JSON instead of screenshots or replay text. The input should describe:

- Battle format and Champions regulation id.
- Both teams, active Pokemon, bench Pokemon, items, abilities, moves, tera/mega or Champions-specific mechanics when relevant.
- Exact current/max HP for the player's Pokemon, matching the numbers visible in Champions.
- Percentage HP for opposing Pokemon, without pretending their hidden exact HP is known.
- Status, stat boosts, volatile effects, speed-control effects, and fainted Pokemon.
- Field state such as weather, terrain, hazards, screens, Tailwind, Trick Room, and turn count.
- Legal actions for the player, including move targets and switches.

HP is represented explicitly according to how it was observed:

```json
{ "unit": "exact", "current": 137, "max": 181 }
{ "unit": "percent", "percent": 76 }
```

The simulator converts percentages to an estimated Showdown HP value only at the simulation boundary.

## Planned Output Concept

The analyzer should return ranked actions rather than one unexplained answer. Each result should include:

- Action name, target, and action type.
- Numeric score and confidence.
- Short explanation tags such as damage, KO chance, speed control, defensive safety, board position, or setup value.
- Expected outcome summary from simulation/search.

## Accuracy-First Roadmap

1. Use Pokemon Showdown as the initial doubles battle mechanics baseline.
2. Add a regulation layer for Pokemon Champions seasons, legal Pokemon, move legality, Mega availability, and Champions-specific overrides.
3. Build a current-turn evaluator that ranks every legal action from a known board state.
4. Add opponent-response simulation, then deeper search such as expectimax or Monte Carlo Tree Search.
5. Only after the advisor is trusted, add replay parsing, screenshots/video, or frontend views.
