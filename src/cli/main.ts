import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { pokemonDataService } from "../data/pokemon-data-service.js";
import { loadInitialState } from "../io/initial-state.js";
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

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

runCli().catch((error) => {
  output.write(`Fatal: ${formatError(error)}\n`);
  output.write(`${cliHelpLines.join("\n")}\n`);
  process.exitCode = 1;
});
