import { describe, expect, it } from "vitest";

import { singleTurnBattleState, singleTurnChoices } from "../src/fixtures/single-turn-battle-state.js";
import {
  buildShowdownChoiceFromLegalActions,
  createSingleTurnSimulationInputFromBattleState,
  getShowdownFormatIdForRegulation,
  simulateSingleTurn,
  toShowdownCurrentHp
} from "../src/sim/showdown-adapter.js";

describe("showdown adapter", () => {
  it("maps known regulation ids to pinned Showdown format ids", () => {
    expect(getShowdownFormatIdForRegulation("development")).toBe("gen9championsdoublescustomgame");
    expect(getShowdownFormatIdForRegulation("champions-m-b")).toBe("gen9championsvgc2026regmb");
  });

  it("builds a Showdown move choice from legal actions", () => {
    expect(buildShowdownChoiceFromLegalActions(singleTurnBattleState.legalActions, "p1")).toBe(
      "move thunderbolt 1, move tackle 1"
    );
  });

  it("converts exact and percentage observations to Showdown HP", () => {
    expect(toShowdownCurrentHp({ unit: "exact", current: 55, max: 110 }, 200)).toBe(100);
    expect(toShowdownCurrentHp({ unit: "percent", percent: 25 }, 200)).toBe(50);
    expect(toShowdownCurrentHp({ unit: "percent", percent: 0 }, 200)).toBe(0);
  });

  it("simulates one deterministic doubles turn from sample data", () => {
    const input = createSingleTurnSimulationInputFromBattleState(singleTurnBattleState, singleTurnChoices);
    const result = simulateSingleTurn({
      ...input,
      seed: [1, 2, 3, 4]
    });

    expect(result.formatId).toBe("gen9championsdoublescustomgame");
    expect(result.turn).toBe(2);
    expect(result.moveEvents.map((event) => event.move)).toContain("Thunderbolt");
    expect(result.damageEvents.length).toBeGreaterThan(0);
    expect(result.damageEvents[0]).toMatchObject({
      target: "p2a: Squirtle",
      remainingHp: 0,
      rawHpText: "0 fnt"
    });
  });

  it("uses the opponent's observed percentage as the simulation's starting HP", () => {
    const battleState = structuredClone(singleTurnBattleState);
    battleState.teams.p2.active[0].hp = { unit: "percent", percent: 10 };

    const input = createSingleTurnSimulationInputFromBattleState(battleState, {
      ...singleTurnChoices,
      p1Choice: "move protect, move tackle 1"
    });
    const result = simulateSingleTurn({
      ...input,
      seed: [1, 2, 3, 4]
    });
    const squirtleDamage = result.damageEvents.find(
      (event) => event.target === "p2a: Squirtle"
    );

    expect(squirtleDamage).toMatchObject({ remainingHp: 0 });
    expect(squirtleDamage?.damageAmount).toBeGreaterThan(0);
    expect(squirtleDamage?.damageAmount).toBeLessThan(20);
  });
});
