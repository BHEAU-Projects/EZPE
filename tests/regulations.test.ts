import { describe, expect, it } from "vitest";

import { getCurrentRegulation, getRegulationById } from "../src/data/regulations.js";
import { getOverridesForRegulation } from "../src/data/champions-overrides.js";

describe("regulation data", () => {
  it("looks up regulation snapshots by id and alias", () => {
    expect(getRegulationById("champions-m-a")?.showdownFormatId).toBe("gen9championsvgc2026regma");
    expect(getRegulationById("m-b")?.showdownFormatId).toBe("gen9championsvgc2026regmb");
  });

  it("returns Regulation M-B for mid-August 2026", () => {
    expect(getCurrentRegulation(new Date("2026-08-15T00:00:00.000Z"))?.id).toBe("champions-m-b");
  });

  it("starts with no manual Champions overrides", () => {
    expect(getOverridesForRegulation("champions-m-b")).toEqual([]);
  });
});
