import { describe, expect, it } from "vitest";

import { scoreSingleTurnOutcome } from "../src/advisor/scoring.js";
import type { BattleState } from "../src/domain/battle-state.js";
import { singleTurnBattleState, singleTurnChoices } from "../src/fixtures/single-turn-battle-state.js";
import {
  createSingleTurnSimulationInputFromBattleState,
  simulateSingleTurn
} from "../src/sim/showdown-adapter.js";

function stateWithPlayerMoves(firstMove: string, secondMove = "protect"): BattleState {
  const state = structuredClone(singleTurnBattleState);
  state.teams.p1.active[0].set.moveIds = [firstMove, "protect"];
  state.teams.p1.active[1].set.moveIds = [secondMove, "protect"];
  return state;
}

function simulate(
  state: BattleState,
  p1Choice: string,
  p2Choice = "move protect, move protect",
  seed: readonly [number, number, number, number] = [1, 2, 3, 4]
) {
  return simulateSingleTurn({
    ...createSingleTurnSimulationInputFromBattleState(state, {
      ...singleTurnChoices,
      p1Choice,
      p2Choice
    }),
    seed
  });
}

describe("contextual single-turn scoring", () => {
  it("rewards real recovery and penalizes a full-HP recovery attempt as wasted", () => {
    const lowHp = stateWithPlayerMoves("recover");
    lowHp.teams.p1.active[0].hp = { unit: "exact", current: 30, max: 110 };
    const fullHp = stateWithPlayerMoves("recover");

    const lowScore = scoreSingleTurnOutcome(simulate(lowHp, "move recover, move protect"), "p1");
    const fullScore = scoreSingleTurnOutcome(simulate(fullHp, "move recover, move protect"), "p1");

    expect(lowScore.breakdown.healingReceivedPercent).toBeGreaterThan(0);
    expect(lowScore.explanationTags).toContain("healing");
    expect(fullScore.breakdown.healingReceivedPercent).toBe(0);
    expect(fullScore.breakdown.wastedActions).toBeGreaterThan(0);
    expect(lowScore.score).toBeGreaterThan(fullScore.score);
  });

  it("rewards a useful surviving boost but not a capped setup move", () => {
    const useful = stateWithPlayerMoves("swordsdance");
    const capped = stateWithPlayerMoves("swordsdance");
    capped.teams.p1.active[0].boosts.atk = 6;

    const usefulScore = scoreSingleTurnOutcome(simulate(useful, "move swordsdance, move protect"), "p1");
    const cappedScore = scoreSingleTurnOutcome(simulate(capped, "move swordsdance, move protect"), "p1");

    expect(usefulScore.breakdown.usefulBoostValue).toBe(2);
    expect(usefulScore.explanationTags).toContain("useful-setup");
    expect(cappedScore.breakdown.usefulBoostValue).toBe(0);
    expect(cappedScore.explanationTags).toContain("wasted-action");
  });

  it("only values Reflect when the observed opposing attacks are physical", () => {
    const physical = stateWithPlayerMoves("reflect");
    const special = stateWithPlayerMoves("reflect");
    special.teams.p2.active[0].set.moveIds = ["watergun", "protect"];
    special.teams.p2.active[1].set.moveIds = ["ember", "protect"];

    const physicalScore = scoreSingleTurnOutcome(
      simulate(physical, "move reflect, move protect", "move tackle 1, move scratch 1"),
      "p1"
    );
    const specialScore = scoreSingleTurnOutcome(
      simulate(special, "move reflect, move protect", "move watergun 1, move ember 1"),
      "p1"
    );

    expect(physicalScore.breakdown.sideConditionAdvantage).toBe(1);
    expect(specialScore.breakdown.sideConditionAdvantage).toBe(0);
  });

  it("separates raw Speed drops from actual action-order swings", () => {
    const state = stateWithPlayerMoves("icywind");
    const simulation = simulate(
      state,
      "move icywind, move protect",
      "move tackle 1, move scratch 1"
    );
    const withSwing = scoreSingleTurnOutcome(simulation, "p1");
    const noSwingSimulation = structuredClone(simulation);
    for (const final of noSwingSimulation.finalState.pokemon) {
      const initial = noSwingSimulation.initialState.pokemon.find((pokemon) => pokemon.slot === final.slot);
      if (initial) final.actionSpeed = initial.actionSpeed;
    }
    const withoutSwing = scoreSingleTurnOutcome(noSwingSimulation, "p1");

    expect(withSwing.breakdown.speedControl).toBeGreaterThan(0);
    expect(withSwing.breakdown.effectiveSpeedSwings).toBeGreaterThan(0);
    expect(withoutSwing.breakdown.speedControl).toBeGreaterThan(0);
    expect(withoutSwing.breakdown.effectiveSpeedSwings).toBe(0);
  });

  it("recognizes Helping Hand as ally synergy from the full-turn result", () => {
    const supported = stateWithPlayerMoves("helpinghand", "thunderbolt");
    const baseline = stateWithPlayerMoves("protect", "thunderbolt");
    const supportedScore = scoreSingleTurnOutcome(
      simulate(supported, "move helpinghand -2, move thunderbolt 1"),
      "p1"
    );
    const baselineScore = scoreSingleTurnOutcome(
      simulate(baseline, "move protect, move thunderbolt 1"),
      "p1"
    );

    expect(supportedScore.breakdown.allySynergy).toBeGreaterThan(0);
    expect(supportedScore.explanationTags).toContain("ally-synergy");
    expect(supportedScore.breakdown.damageDealtPercent).toBeGreaterThanOrEqual(
      baselineScore.breakdown.damageDealtPercent
    );
  });

  it("tags move-driven item denial, residual pressure, and ineffective actions", () => {
    const knockOffState = stateWithPlayerMoves("knockoff");
    knockOffState.teams.p2.active[0].set.itemId = "leftovers";
    const knockOff = scoreSingleTurnOutcome(
      simulate(
        knockOffState,
        "move knockoff 1, move protect",
        "move tackle 1, move scratch 1"
      ),
      "p1"
    );

    const seededState = stateWithPlayerMoves("leechseed");
    const seeded = scoreSingleTurnOutcome(
      simulate(
        seededState,
        "move leechseed 1, move protect",
        "move tackle 1, move scratch 1"
      ),
      "p1"
    );

    const immuneState = stateWithPlayerMoves("thunderbolt");
    Object.assign(immuneState.teams.p2.active[0].set, {
      speciesId: "dugtrio",
      abilityId: "sandveil",
      moveIds: ["tackle", "protect"]
    });
    const immune = scoreSingleTurnOutcome(
      simulate(
        immuneState,
        "move thunderbolt 1, move protect",
        "move tackle 1, move scratch 1"
      ),
      "p1"
    );

    expect(knockOff.breakdown.itemsRemoved).toBe(1);
    expect(knockOff.explanationTags).toContain("item-denial");
    expect(seeded.breakdown.residualPressure).toBeGreaterThan(0);
    expect(seeded.explanationTags).toContain("residual-pressure");
    expect(immune.breakdown.wastedActions).toBeGreaterThan(0);
    expect(immune.explanationTags).toContain("wasted-action");
  });

  it("reports lower information confidence for unrevealed ranked moves", () => {
    const closed = structuredClone(singleTurnBattleState);
    const open = structuredClone(singleTurnBattleState);
    open.battleContext = "vgc-open-sheet";
    const simulation = simulate(closed, singleTurnChoices.p1Choice, singleTurnChoices.p2Choice);

    const closedScore = scoreSingleTurnOutcome(simulation, "p1", undefined, closed);
    const openScore = scoreSingleTurnOutcome(simulation, "p1", undefined, open);

    expect(closedScore.breakdown.informationConfidence).toBeLessThan(1);
    expect(openScore.breakdown.informationConfidence).toBe(1);
  });
});
