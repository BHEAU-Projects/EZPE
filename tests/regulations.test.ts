import { describe, expect, it } from "vitest";

import { getCurrentRegulation, getRegulationById } from "../src/data/regulations.js";
import { getOverridesForRegulation } from "../src/data/champions-overrides.js";

describe("regulation data", () => {
  it("looks up regulation snapshots by id and alias", () => {
    expect(getRegulationById("champions-m-a")?.showdownFormatId).toBe("gen9championsvgc2026regma");
    expect(getRegulationById("m-b")?.showdownFormatId).toBe("gen9championsvgc2026regmb");
  });

  it("returns Regulation M-B for mid-August 2026", () => {
    const regulation = getCurrentRegulation(new Date("2026-08-15T00:00:00.000Z"));
    expect(regulation?.id).toBe("champions-m-b");
    expect(regulation?.teamRules.openTeamSheets).toBe(false);
    expect(regulation?.sources).toContainEqual(expect.objectContaining({
      url: "https://champions-news.pokemon-home.com/en/page/776.html"
    }));
  });

  it("starts with no manual Champions overrides", () => {
    expect(getOverridesForRegulation("champions-m-b")).toEqual([]);
  });
});
