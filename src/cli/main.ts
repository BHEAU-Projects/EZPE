import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import type { BattleState, PlayerSide } from "../domain/battle-state.js";
import { pokemonDataService } from "../data/pokemon-data-service.js";
import { singleTurnBattleState } from "../fixtures/single-turn-battle-state.js";
import {
  createBattleStateFromTeams,
  loadBattleStateFile
} from "../io/battle-state-file.js";
import { importOpponentTeamFile, importTeamFile } from "../io/team-importer.js";
import { createBattleSession } from "../session/battle-session.js";
import { parseCliCommand } from "./command-parser.js";
import { cliHelpLines, executeSessionCommand } from "./session-command.js";

async function runCli(): Promise<void> {
  const state = loadInitialState(process.argv.slice(2));
  const validation = pokemonDataService.validateBattleState(state);
  if (!validation.valid) throw new Error(validation.errors.join("\n"));

  const session = createBattleSession(state, { maxSnapshots: 100 });
  const readline = createInterface({ input, output });

  output.write("EZPE battle advisor\n");
  output.write(`${executeSessionCommand(session, { type: "show" }).lines.join("\n")}\n`);
  output.write("Type 'help' for compact battle commands.\n");

  try {
    while (true) {
      const line = await readline.question("ezpe> ");
      try {
        const result = executeSessionCommand(session, parseCliCommand(line));
        output.write(`${result.lines.join("\n")}\n`);
        if (result.shouldExit) break;
      } catch (error) {
        output.write(`Error: ${formatError(error)}\n`);
      }
    }
  } finally {
    readline.close();
  }
}

function loadInitialState(args: string[]): BattleState {
  const options = parseArguments(args);
  if (options.sample) return structuredClone(singleTurnBattleState);
  if (options.statePath) return loadBattleStateFile(options.statePath);

  if (!options.playerTeamPath || !options.opponentTeamPath) {
    throw new Error(
      [
        "Start with --state <battle.json>, --sample, or both team files:",
        "--player-team <team.txt> --opponent-team <team.txt> [--regulation development]"
      ].join("\n")
    );
  }

  const playerSide = options.playerSide;
  const playerTeam = importTeamFile(options.playerTeamPath, options.regulationId);
  const opponentTeam = importOpponentTeamFile(options.opponentTeamPath, options.regulationId);

  return createBattleStateFromTeams({
    regulationId: options.regulationId,
    playerSide,
    p1Team: playerSide === "p1" ? playerTeam : opponentTeam,
    p2Team: playerSide === "p2" ? playerTeam : opponentTeam
  });
}

function parseArguments(args: string[]): {
  sample: boolean;
  statePath?: string;
  playerTeamPath?: string;
  opponentTeamPath?: string;
  regulationId: string;
  playerSide: PlayerSide;
} {
  const result: {
    sample: boolean;
    statePath?: string;
    playerTeamPath?: string;
    opponentTeamPath?: string;
    regulationId: string;
    playerSide: PlayerSide;
  } = { sample: false, regulationId: "development", playerSide: "p1" };

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag === "--sample") {
      result.sample = true;
    } else if (flag === "--state") {
      result.statePath = requireValue(flag, value);
      index += 1;
    } else if (flag === "--player-team") {
      result.playerTeamPath = requireValue(flag, value);
      index += 1;
    } else if (flag === "--opponent-team") {
      result.opponentTeamPath = requireValue(flag, value);
      index += 1;
    } else if (flag === "--regulation") {
      result.regulationId = requireValue(flag, value);
      index += 1;
    } else if (flag === "--player-side") {
      const side = requireValue(flag, value);
      if (side !== "p1" && side !== "p2") throw new Error("--player-side must be p1 or p2.");
      result.playerSide = side;
      index += 1;
    } else {
      throw new Error(`Unknown CLI option '${flag}'.`);
    }
  }

  return result;
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value) throw new Error(`${flag} requires a value.`);
  return value;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

runCli().catch((error) => {
  output.write(`Fatal: ${formatError(error)}\n`);
  output.write(`${cliHelpLines.join("\n")}\n`);
  process.exitCode = 1;
});
