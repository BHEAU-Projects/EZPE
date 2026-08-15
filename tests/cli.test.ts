import { mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseCliCommand } from "../src/cli/command-parser.js";
import { executeSessionCommand } from "../src/cli/session-command.js";
import { singleTurnBattleState } from "../src/fixtures/single-turn-battle-state.js";
import {
  createBattleStateFromTeams,
  loadBattleStateFile,
  saveBattleSessionFile
} from "../src/io/battle-state-file.js";
import { importOpponentTeam, importTeam } from "../src/io/team-importer.js";
import { createBattleSession } from "../src/session/battle-session.js";

const showdownTeam = `Pikachu @ Light Ball
Ability: Static
Level: 50
Serious Nature
- Thunderbolt
- Protect

Bulbasaur
Ability: Overgrow
Level: 50
Serious Nature
- Tackle
- Protect`;

describe("terminal team and state input", () => {
  it("imports Showdown exports into canonical calculated sets", () => {
    const team = importTeam(showdownTeam, "development");

    expect(team).toHaveLength(2);
    expect(team[0]).toMatchObject({
      speciesId: "pikachu",
      itemId: "lightball",
      abilityId: "static",
      moveIds: ["thunderbolt", "protect"],
      stats: { hp: 110, spe: 110 }
    });
  });

  it("creates player exact HP and opponent percentage HP", () => {
    const team = importTeam(showdownTeam, "development");
    const state = createBattleStateFromTeams({
      regulationId: "development",
      playerSide: "p1",
      p1Team: team,
      p2Team: team
    });

    expect(state.teams.p1.active[0].hp).toEqual({ unit: "exact", current: 110, max: 110 });
    expect(state.teams.p2.active[0].hp).toEqual({ unit: "percent", percent: 100 });
  });

  it("fills an opponent roster with offline usage-based moves", () => {
    const team = importOpponentTeam("Pikachu\n\nBasculegion", "champions-m-b");

    expect(team[0].moveIds).toEqual(["fakeout", "risingvoltage", "grassknot", "protect"]);
    expect(team[0].moveKnowledge).toMatchObject({
      source: "usage-default",
      observedMoveIds: [],
      assumedMoveIds: ["fakeout", "risingvoltage", "grassknot", "protect"]
    });
  });
});

describe("terminal commands", () => {
  it("parses compact HP, switch, and rank commands", () => {
    expect(parseCliCommand("hp p2a 63%")).toEqual({
      type: "hp",
      slot: "p2a",
      unit: "percent",
      percent: 63
    });
    expect(parseCliCommand("switch p1a 1")).toMatchObject({
      type: "switch",
      slot: "p1a",
      benchSlot: 0
    });
    expect(parseCliCommand("rank 2 4")).toEqual({
      type: "rank",
      top: 2,
      maxOpponentPlans: 4
    });
    expect(parseCliCommand("move p2a Water Gun")).toEqual({
      type: "move",
      slot: "p2a",
      moveId: "watergun"
    });
  });

  it("rejects malformed visible-state commands", () => {
    expect(() => parseCliCommand("hp p2a 101%")).toThrow(/0 to 100/);
    expect(() => parseCliCommand("status p1a dizzy")).toThrow(/Unknown status/);
    expect(() => parseCliCommand("weather fog 5")).toThrow(/Unknown weather/);
  });

  it("updates and ranks the live session", () => {
    const session = createBattleSession(singleTurnBattleState);

    executeSessionCommand(session, parseCliCommand("hp p2a 60%"));
    const ranking = executeSessionCommand(session, parseCliCommand("rank 1 1"));

    expect(session.getState().teams.p2.active[0].hp).toEqual({
      unit: "percent",
      percent: 60
    });
    expect(ranking.lines[0]).toMatch(/^1\. /);
    expect(ranking.lines.at(-1)).toMatch(/plans/);
  });

  it("records an observed opponent move from a compact command", () => {
    const session = createBattleSession(singleTurnBattleState);

    executeSessionCommand(session, parseCliCommand("move p2a watergun"));

    expect(session.getState().teams.p2.active[0].set.moveKnowledge).toMatchObject({
      observedMoveIds: ["watergun"]
    });
  });

  it("saves a session that can be loaded as a battle state", () => {
    const directory = mkdtempSync(join(tmpdir(), "ezpe-session-"));
    const path = join(directory, "session.json");

    try {
      const session = createBattleSession(singleTurnBattleState);
      executeSessionCommand(session, parseCliCommand("turn 2"));
      saveBattleSessionFile(path, session);

      expect(loadBattleStateFile(path).turnNumber).toBe(2);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("launches through the real Node ESM entrypoint", () => {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "src/cli/main.ts", "--sample"],
      { cwd: process.cwd(), input: "quit\n", encoding: "utf8" }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("EZPE battle advisor");
    expect(result.stdout).toContain("Session closed.");
    expect(result.stderr).toBe("");
  });
});
