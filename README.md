# EZPE

EZPE is a backend-only learning project for exploring AI through Pokemon Champions battle-state analysis.

The long-term goal is to accept a structured battle state from Pokemon Champions Doubles/VGC and return a ranked list of the best legal actions. Accuracy comes first: visual polish, frontend work, screenshot parsing, and automation can wait until the battle logic is trustworthy.

## Current Status

This repository is currently a comment-only scaffold. The files describe where each future part of the system should live, but there is no working analyzer, API server, simulator adapter, or scoring engine yet.

## Planned Commands

```bash
npm run dev
npm run typecheck
npm test
```

These commands are wired into `package.json` for the future implementation. While the source files are comment-only, `typecheck` and `test` should still be safe verification commands.

## Planned Input Concept

The first real version should accept structured JSON instead of screenshots or replay text. The input should describe:

- Battle format and Champions regulation id.
- Both teams, active Pokemon, bench Pokemon, items, abilities, moves, tera/mega or Champions-specific mechanics when relevant.
- Current HP, status, stat boosts, volatile effects, speed-control effects, and fainted Pokemon.
- Field state such as weather, terrain, hazards, screens, Tailwind, Trick Room, and turn count.
- Legal actions for the player, including move targets and switches.

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
