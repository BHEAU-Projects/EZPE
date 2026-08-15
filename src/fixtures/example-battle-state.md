# Example Battle State Placeholder

The executable sample currently lives in `single-turn-battle-state.ts`. Keep
future JSON fixtures valid and use this document for notes that JSON cannot
contain.

Future contents should become one or more valid `.json` fixtures that describe:

- The selected Pokemon Champions regulation.
- Both players' teams.
- Active Pokemon and bench Pokemon.
- Exact current/max HP for the player and visible HP percentages for the opponent.
- Status, boosts, weather, terrain, field effects, and turn number.
- Legal move and switch choices for the player being advised.

Use small, known board states first so tests can explain why one action should
rank above another.
