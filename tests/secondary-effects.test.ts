import { describe, expect, it } from "vitest";

import { scoreSingleTurnOutcome } from "../src/advisor/scoring.js";
import type { BattleState } from "../src/domain/battle-state.js";
import { singleTurnBattleState, singleTurnChoices } from "../src/fixtures/single-turn-battle-state.js";
import {
  createSingleTurnSimulationInputFromBattleState,
  simulateSingleTurn
} from "../src/sim/showdown-adapter.js";

function stateWithMoves(firstMove: string, secondMove = "protect"): BattleState {
  const state = structuredClone(singleTurnBattleState);
  state.teams.p1.active[0].set.moveIds = [firstMove, "protect"];
  state.teams.p1.active[1].set.moveIds = [secondMove, "protect"];
  return state;
}

function simulate(
  state: BattleState,
  p1Choice: string,
  seed: readonly [number, number, number, number] = [1, 2, 3, 4]
) {
  return simulateSingleTurn({
    ...createSingleTurnSimulationInputFromBattleState(state, {
      ...singleTurnChoices,
      p1Choice
    }),
    seed
  });
}

describe("secondary-aware Showdown outcomes", () => {
  it("records Fake Out flinch as action denial and rewards it", () => {
    const simulation = simulate(
      stateWithMoves("fakeout"),
      "move fakeout 1, move protect"
    );
    const squirtleAction = simulation.summary.actionOutcomes.find(
      (outcome) => outcome.slot === "p2a"
    );
    const scored = scoreSingleTurnOutcome(simulation, "p1");

    expect(squirtleAction).toMatchObject({ outcome: "denied", reason: "flinch" });
    expect(scored.breakdown.actionsDenied).toBe(1);
    expect(scored.explanationTags).toContain("action-denial");
  });

  it("records Icy Wind's spread Speed drops as speed control", () => {
    const simulation = simulate(
      stateWithMoves("icywind"),
      "move icywind, move protect"
    );
    const speedDrops = simulation.summary.boostChanges.filter(
      (change) => change.side === "p2" && change.stat === "spe" && change.delta === -1
    );
    const scored = scoreSingleTurnOutcome(simulation, "p1");

    expect(speedDrops).toHaveLength(2);
    expect(scored.breakdown.speedControl).toBe(2);
    expect(scored.explanationTags).toContain("speed-control");
  });

  it("captures a Thunderbolt paralysis branch and scores the visible status", () => {
    let paralyzed: ReturnType<typeof simulate> | undefined;
    for (let value = 1; value <= 128 && !paralyzed; value += 1) {
      const branch = simulate(singleTurnBattleState, singleTurnChoices.p1Choice, [value, value + 1, value + 2, value + 3]);
      if (branch.summary.statusChanges.some((change) => change.after === "par")) paralyzed = branch;
    }

    expect(paralyzed).toBeDefined();
    const scored = scoreSingleTurnOutcome(paralyzed!, "p1");
    expect(scored.breakdown.statusesInflicted).toBeGreaterThan(0);
    expect(scored.explanationTags).toContain("inflicted-status");
  });

  it("tracks guaranteed critical hits and sampled misses", () => {
    const critical = simulate(stateWithMoves("stormthrow"), "move stormthrow 1, move protect");
    let missed: ReturnType<typeof simulate> | undefined;
    const zapCannonState = stateWithMoves("zapcannon");
    for (let value = 1; value <= 32 && !missed; value += 1) {
      const branch = simulate(zapCannonState, "move zapcannon 1, move protect", [value, value + 1, value + 2, value + 3]);
      if (branch.summary.missesBySide.p1 > 0) missed = branch;
    }

    expect(critical.summary.criticalHitsBySide.p2).toBeGreaterThan(0);
    expect(missed?.summary.actionOutcomes).toContainEqual(expect.objectContaining({
      slot: "p1a",
      outcome: "missed"
    }));
  });

  it("does not count an already-fainted slot as a new KO", () => {
    const state = structuredClone(singleTurnBattleState);
    state.teams.p1.active[1].hp = { unit: "exact", current: 0, max: 120 };
    const simulation = simulate(state, "move thunderbolt 1, pass");

    expect(simulation.summary.kosTakenBySide.p1).toBe(0);
    expect(simulation.summary.kosTakenBySide.p2).toBe(1);
  });

  it("marks a Pokemon KO'd before its turn instead of considering its move", () => {
    const simulation = simulate(singleTurnBattleState, singleTurnChoices.p1Choice);

    expect(simulation.summary.actionOutcomes).toContainEqual(expect.objectContaining({
      slot: "p2a",
      outcome: "fainted-before-action"
    }));
    expect(simulation.summary.movesBySide.p2.some((move) => move.slot === "p2a")).toBe(false);
  });

  it("normalizes and caps damage at the target's HP before the hit", () => {
    const state = structuredClone(singleTurnBattleState);
    state.teams.p2.active[0].hp = { unit: "percent", percent: 1 };
    const simulation = simulate(state, "move thunderbolt 1, move protect");
    const damage = simulation.damageEvents.find((event) => event.slot === "p2a");

    expect(damage).toBeDefined();
    expect(damage!.damageAmount).toBeLessThanOrEqual(damage!.startingHp);
    expect(damage!.damagePercent).toBeCloseTo(damage!.damageAmount / damage!.maxHp! * 100);
  });

  it("extracts useful healing, recoil, and residual damage separately", () => {
    const recoveryState = stateWithMoves("recover");
    recoveryState.teams.p1.active[0].hp = { unit: "exact", current: 30, max: 110 };
    const recovered = simulate(recoveryState, "move recover, move protect");

    const recoilState = stateWithMoves("wildcharge");
    const recoiled = simulate(recoilState, "move wildcharge 2, move protect");

    const burnState = stateWithMoves("protect");
    burnState.teams.p1.active[0].status = "brn";
    const burned = simulate(burnState, "move protect, move protect");

    expect(recovered.healingEvents).toContainEqual(expect.objectContaining({
      slot: "p1a",
      healingAmount: expect.any(Number)
    }));
    expect(recovered.summary.healingPercentBySide.p1).toBeGreaterThan(0);
    expect(recoiled.damageEvents).toContainEqual(expect.objectContaining({
      slot: "p1a",
      cause: "recoil"
    }));
    expect(recoiled.summary.recoilDamageBySide.p1).toBeGreaterThan(0);
    expect(burned.damageEvents).toContainEqual(expect.objectContaining({
      slot: "p1a",
      cause: "residual"
    }));
    expect(burned.summary.residualDamageBySide.p1).toBeGreaterThan(0);
  });

  it("extracts protection, redirection, substitutes, restrictions, and ally support", () => {
    const protection = simulate(stateWithMoves("protect"), "move protect, move protect");
    const redirection = simulate(stateWithMoves("followme"), "move followme, move protect");
    const substitute = simulate(stateWithMoves("substitute"), "move substitute, move protect");
    const helpingHand = simulate(
      stateWithMoves("helpinghand", "thunderbolt"),
      "move helpinghand -2, move thunderbolt 1"
    );
    const restricted = simulate(stateWithMoves("fakeout"), "move fakeout 1, move protect");

    expect(protection.summary.tacticalEffects).toContainEqual(expect.objectContaining({ kind: "protection" }));
    expect(redirection.summary.tacticalEffects).toContainEqual(expect.objectContaining({ kind: "redirection" }));
    expect(substitute.summary.tacticalEffects).toContainEqual(expect.objectContaining({ kind: "substitute" }));
    expect(helpingHand.summary.tacticalEffects).toContainEqual(expect.objectContaining({ kind: "ally-synergy" }));
    expect(restricted.summary.tacticalEffects).toContainEqual(expect.objectContaining({ kind: "action-restriction" }));
  });
});
