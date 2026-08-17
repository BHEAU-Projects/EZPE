# EZPE

EZPE is a local learning project for exploring AI through Pokemon Champions battle-state analysis.

The goal is to accept a structured battle state from Pokemon Champions Doubles/VGC and return a ranked list of the best legal actions. Accuracy comes first; the current browser screen is deliberately focused on rapid manual capture rather than visual polish or screenshot automation.

## Current Status

The project has a validated battle-state contract, regulation and usage snapshots, accuracy-aware damage utilities, a single-turn Pokemon Showdown adapter, opponent-response ranking, an event-driven battle session, a browser team-setup flow, a terminal workflow, and a local Quick Capture screen.

## Planned Commands

```bash
npm run dev
npm run quick -- --state battle-session.json
npm run cli -- --sample
npm run data:refresh:moves
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
npm run cli -- --player-team player.txt --opponent-team opponent.txt --regulation champions-m-b
```

Inside the CLI, use `help` to list compact update and ranking commands. Record a newly revealed opponent move with `move p2a fakeout`.

## Browser Setup And Quick Capture

Start the local screen with sample data:

```bash
npm run dev
```

Then open `http://127.0.0.1:4173`. The first page records your six-Pokemon
preview roster, full build details, and the four Pokemon selected for battle. The
second page records the opposing preview roster and two expected leads. Starting
the battle opens the live-turn screen at `http://127.0.0.1:4173/battle`.

Your roster stores species or battle-relevant form, gender, nickname, Ability,
item, Stat Alignment, moves, and the six Champions Stat Point values. Champions
battles are level 50, so the app fixes the level and calculates battle stats from
those inputs. Each stat accepts 0-32 Stat Points, with a 66-point total limit.
IVs are fixed internally at their maximum equivalent and are not user inputs. The
opponent setup only needs species or form and gender; hidden Abilities, stats, and
moves use neutral or local usage-based assumptions until observations in battle
replace them.

## Champions Stat Model

The domain model follows Pokemon Champions rather than exposing the main-series
IV and EV fields. A build contains `statAlignment` and `statPoints`; level 50 and
maximum-equivalent IVs are fixed automatically. Showdown exports with values
outside Champions' 32-per-stat or 66-total limits are recognized as legacy EV
spreads and converted during import; for example, 4/252/252 becomes 1/32/32
Stat Points.

The Showdown Champions simulator still names its wire fields `nature`, `evs`, and
`ivs`. Those names exist only at the adapter boundary: Stat Alignment is sent as
`nature`, Stat Points are sent directly as the Champions mod's `evs`, and fixed
IVs are supplied for compatibility.

You can also start a real session from files with:

```bash
npm run quick -- --player-team player.txt --opponent-team opponent.txt --regulation champions-m-b
```

The screen provides direct controls for exact player HP, opponent HP percentages,
status, revealed opponent moves, switches, boosts, items, abilities, side conditions,
weather, terrain, Trick Room, Gravity, turn count, and ranked analysis.

## Opponent Move Assumptions

Opponent team imports use the four highest-usage moves for each Pokemon from the
bundled high-ladder Regulation M-B snapshot. The snapshot is distilled from
[Smogon usage statistics](https://www.smogon.com/stats/2026-06/chaos/gen9championsvgc2026regmb-1760.json)
and is read locally during battle.

Assumed and observed moves remain distinct in battle state. Recording a revealed
move promotes it to observed and removes enough assumptions to keep a legal
four-move simulation set. Refresh the offline snapshot outside a battle with:

```bash
npm run data:refresh:moves
```

The bundled snapshot covers 275 Pokemon and records its format, rating cutoff,
data period, retrieval date, and source URL.

## Planned Input Concept

The structured JSON input describes:

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

## Output Concept

The analyzer returns ranked actions rather than one unexplained answer. Each result includes:

- Action name, target, and action type.
- Numeric score and confidence.
- Short explanation tags such as damage, KO chance, speed control, defensive safety, board position, or setup value.
- Expected outcome summary from simulation/search.

## Accuracy-First Roadmap

1. Use Pokemon Showdown as the initial doubles battle mechanics baseline.
2. Add a regulation layer for Pokemon Champions seasons, legal Pokemon, move legality, Mega availability, and Champions-specific overrides.
3. Build a current-turn evaluator that ranks every legal action from a known board state.
4. Add opponent-response simulation, then deeper search such as expectimax or Monte Carlo Tree Search.
5. Validate recommendations against recorded games before adding screenshot or video capture.
