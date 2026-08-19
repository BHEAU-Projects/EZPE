# PKMoveScoring Audit For EZPE

## Purpose

The [Platinum Kaizo AI Move Scoring guide](https://bparkpk.github.io/PKMoveScoring/index.html)
is a useful catalogue of questions a move evaluator should ask. It is not a
compatible mechanics engine for Pokemon Champions. EZPE uses the guide as a
strategy taxonomy while Pokemon Showdown's Champions mod remains the mechanics
source of truth.

## Source Boundaries

- [PKMoveScoring](https://bparkpk.github.io/PKMoveScoring/index.html) documents
  how a Generation IV ROM hack's trainer AI scores individual move-target
  pairs. Its procedures include intentional randomness, imperfect knowledge,
  and documented bugs.
- [Regulation Set M-B](https://champions-news.pokemon-home.com/en/page/776.html)
  is the official rules source for eligible Pokemon, one Mega Evolution per
  battle, duplicate-item restrictions, and official battle timers.
- Pokemon Showdown's Champions
  [scripts](https://github.com/smogon/pokemon-showdown/blob/master/data/mods/champions/scripts.ts),
  [conditions](https://github.com/smogon/pokemon-showdown/blob/master/data/mods/champions/conditions.ts),
  [moves](https://github.com/smogon/pokemon-showdown/blob/master/data/mods/champions/moves.ts),
  and [abilities](https://github.com/smogon/pokemon-showdown/blob/master/data/mods/champions/abilities.ts)
  provide the executable mechanics baseline.
- Confirmed Champions differences that are absent from Showdown belong in the
  regulation or Champions override layers, with a source and regression test.

## Ideas To Adopt

The following PKMoveScoring ideas improve EZPE when evaluated against a full
Doubles turn rather than an isolated move-target pair:

- Strongly penalize moves that cannot affect the current board.
- Value damage in context: remaining HP, KO probability, overkill, recoil,
  spread damage, and whether the target acts before fainting all matter.
- Reward healing only when HP is actually restored or survival improves.
- Reward setup only when a useful stat changes, the user is likely to survive,
  and the benefit is not already capped or redundant.
- Reward speed control only when it changes a relevant action order.
- Evaluate weather, terrain, rooms, screens, redirection, protection, and ally
  interactions for both Pokemon on each side.
- Reward disruption such as action denial, item removal, forced movement, and
  residual pressure when it has an observable tactical benefit.
- Keep risk explicit through accuracy, damage rolls, critical hits, secondary
  effects, and the worst legal opponent response.

## Behaviors To Reject

EZPE must not copy these Generation IV trainer-AI behaviors:

- Platinum Kaizo-specific bugs, damage omissions, type-checking errors, or
  arbitrary score randomness.
- Hidden-information cheating, including exact opponent HP, item, ability, or
  unrevealed moves that Champions does not expose in the selected context.
- Forgetting revealed moves when an opponent switches out.
- Treating usage movesets as action probabilities. They provide plausible move
  availability only.
- Ignoring move accuracy, critical hits, damage variance, multi-target effects,
  or interactions already resolved by Showdown.
- Ranking each move and target independently. EZPE ranks complete legal Doubles
  action plans because ally synergy, focus fire, redirection, immunities, and
  KO-before-action change the result.

## Battle Contexts

`ranked-closed` is the default. Opponent species and visible battle information
are known; moves become confirmed when observed. Usage-default moves fill
unknown slots without pretending they were selected with a known probability.

`vgc-open-sheet` is optional. Information supplied by an open team sheet may be
treated as known, but the opponent's turn choice remains a strategy scenario,
not a random mechanics branch.

## Implementation Roadmap

1. Add backward-compatible battle context and active-Pokemon memory for turns
   active, last move, last result, and structured volatile effects.
2. Hydrate that memory into Showdown so Fake Out, First Impression, Encore,
   Disable, Torment, and duration-based effects reproduce the real board.
3. Extract normalized damage, healing, recoil, residual damage, item changes,
   protection, redirection, substitutes, action restrictions, and action order.
4. Add contextual scoring weights in `config/scoring.json`; keep mechanics out
   of the subjective grading file.
5. Average mechanics branches within each opponent action plan, then aggregate
   distinct opponent plans as scenarios with a separate worst response.
6. Present mechanics expectation, scenario mean, worst response, and confidence
   derived from score separation, branch agreement, and information quality.

## Required Regression Coverage

- Backward parsing and migration from `volatileEffectIds`.
- Switch-sensitive Fake Out and First Impression eligibility.
- Encore using the actual last move; Disable and Torment restrictions; volatile
  duration expiry.
- Useful versus wasted recovery, setup, screens, and field effects.
- Tailwind, Icy Wind, paralysis, and Trick Room only scoring an order swing when
  the relevant order changes.
- Helping Hand, Follow Me, spread moves with immune allies, focus fire, and
  redundant actions.
- Percentage-normalized damage, overkill caps, healing, recoil, residual damage,
  item removal, misses, critical hits, and KO-before-action.
- Champions rules and mechanics already modeled by the Showdown mod, including
  the PP cap, no Terastallization, one Mega Evolution, spread damage, status
  behavior, and protection interactions.
- Opponent scenario aggregation kept separate from mechanics randomness.
- A representative warm recommendation stays below two seconds.

## Scope Limit

This milestone remains a current-turn evaluator. It does not add two-turn
search, a trained model, screenshot capture, or fabricated opponent-action
probabilities. Those require separate evidence, data, and performance budgets.
