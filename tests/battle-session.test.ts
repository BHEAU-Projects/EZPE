import { describe, expect, it } from "vitest";

import { singleTurnBattleState, singleTurnChoices } from "../src/fixtures/single-turn-battle-state.js";
import { createBattleSession } from "../src/session/battle-session.js";

describe("battle session", () => {
  it("tracks events and bounded snapshots without exposing mutable state", () => {
    const session = createBattleSession(singleTurnBattleState, { maxSnapshots: 2 });

    session.applyEvent({
      type: "damage-observed",
      slot: "p2a",
      remainingHp: { unit: "percent", percent: 80 }
    });
    session.applyEvent({ type: "status-applied", slot: "p1a", status: "par" });

    const exposedState = session.getState();
    exposedState.teams.p2.active[0].hp = { unit: "percent", percent: 1 };

    expect(session.getState().teams.p2.active[0].hp).toEqual({ unit: "percent", percent: 80 });
    expect(session.getHistory()).toHaveLength(2);
    expect(session.getSnapshots()).toHaveLength(2);
    expect(session.getSnapshots()[0].teams.p2.active[0].hp).toEqual({
      unit: "percent",
      percent: 80
    });
    expect(session.getSnapshots()[1].teams.p1.active[0].status).toBe("par");
  });

  it("ranks moves using the session's current battle state", () => {
    const session = createBattleSession(singleTurnBattleState);
    session.applyEvent({
      type: "damage-observed",
      slot: "p2a",
      remainingHp: { unit: "percent", percent: 60 }
    });

    const advice = session.rank({
      opponentChoice: singleTurnChoices.p2Choice,
      seed: [1, 2, 3, 4]
    });

    expect(advice).toHaveLength(9);
    expect(advice[0].rank).toBe(1);
    expect(
      advice[0].actionPlan.actions.some(
        (action) => action.type === "move" && action.moveId === "thunderbolt"
      )
    ).toBe(true);
  });

  it("rejects invalid snapshot limits", () => {
    expect(() => createBattleSession(singleTurnBattleState, { maxSnapshots: 0 })).toThrow(
      /positive integer/
    );
  });
});
