import { pathToFileURL } from "node:url";

import Fastify, { type FastifyInstance } from "fastify";

import { pokemonDataService } from "../data/pokemon-data-service.js";
import type { BattleState } from "../domain/battle-state.js";
import { loadInitialState } from "../io/initial-state.js";
import { createBattleSession } from "../session/battle-session.js";
import { quickCapturePage } from "../ui/quick-capture-page.js";
import { teamSetupPage } from "../ui/team-setup-page.js";
import { registerSessionRoutes } from "./routes/session.js";
import { registerSetupRoutes } from "./routes/setup.js";

export function buildServer(initialState: BattleState): FastifyInstance {
  const validation = pokemonDataService.validateBattleState(initialState);
  if (!validation.valid) throw new Error(validation.errors.join("\n"));

  const app = Fastify({ logger: false });
  const session = createBattleSession(initialState, { maxSnapshots: 100 });

  app.get("/health", async () => ({ status: "ok", version: "0.1.0" }));
  app.get("/", async (_request, reply) => reply.type("text/html; charset=utf-8").send(teamSetupPage));
  app.get("/setup", async (_request, reply) => reply.type("text/html; charset=utf-8").send(teamSetupPage));
  app.get("/setup/player", async (_request, reply) => reply.type("text/html; charset=utf-8").send(teamSetupPage));
  app.get("/setup/opponent", async (_request, reply) => reply.type("text/html; charset=utf-8").send(teamSetupPage));
  app.get("/battle", async (_request, reply) => reply.type("text/html; charset=utf-8").send(quickCapturePage));
  registerSetupRoutes(app, session);
  registerSessionRoutes(app, session);

  return app;
}

async function runServer(): Promise<void> {
  const { port, stateArgs } = parseServerArguments(process.argv.slice(2));
  const app = buildServer(loadInitialState(stateArgs));
  await app.listen({ host: "127.0.0.1", port });
  process.stdout.write(`EZPE Quick Capture: http://127.0.0.1:${port}\n`);
}

function parseServerArguments(args: string[]): { port: number; stateArgs: string[] } {
  const stateArgs: string[] = [];
  let port = 4173;

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--port") {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value < 1 || value > 65535) {
        throw new Error("--port must be an integer from 1 to 65535.");
      }
      port = value;
      index += 1;
    } else {
      stateArgs.push(args[index]);
    }
  }

  return { port, stateArgs };
}

const launchedFile = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === launchedFile) {
  runServer().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
