import { describe, expect, it } from "vitest";

import { singleTurnBattleState, singleTurnChoices } from "../src/fixtures/single-turn-battle-state.js";
import {
  buildShowdownChoiceFromLegalActions,
  createSingleTurnSimulationInputFromBattleState,
  getShowdownFormatIdForRegulation,
  simulateSingleTurn
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
});
