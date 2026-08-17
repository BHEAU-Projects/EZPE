import { ZodError } from "zod";
import type { FastifyInstance } from "fastify";

import { pokemonDataService } from "../../data/pokemon-data-service.js";
import { getCurrentRegulation, getRegulationById, regulationSnapshots } from "../../data/regulations.js";
import type { BattleSession } from "../../session/battle-session.js";
import { TeamSetupController } from "../../setup/team-setup.js";

export function registerSetupRoutes(app: FastifyInstance, session: BattleSession): void {
  const setup = new TeamSetupController();

  app.get("/api/setup/status", async () => setup.getStatus());

  app.get<{ Querystring: { regulationId?: string } }>("/api/setup/catalog", async (request, reply) => {
    const regulationId = request.query.regulationId ?? getCurrentRegulation().id;
    if (!getRegulationById(regulationId)) {
      return reply.code(400).send({ error: `Unknown regulation '${regulationId}'.` });
    }

    return {
      defaultRegulationId: getCurrentRegulation().id,
      regulations: regulationSnapshots.map((regulation) => ({
        id: regulation.id,
        name: regulation.name,
        current: regulation.id === getCurrentRegulation().id
      })),
      ...pokemonDataService.getSetupCatalog(regulationId)
    };
  });

  app.post("/api/setup/player", async (request, reply) => {
    try {
      return setup.setPlayerTeam(request.body);
    } catch (error) {
      return reply.code(400).send({ error: formatSetupError(error) });
    }
  });

  app.post("/api/setup/opponent", async (request, reply) => {
    try {
      return setup.setOpponentTeam(request.body);
    } catch (error) {
      return reply.code(400).send({ error: formatSetupError(error) });
    }
  });

  app.post("/api/setup/selection", async (request, reply) => {
    try {
      return setup.setPlayerSelection(request.body);
    } catch (error) {
      return reply.code(400).send({ error: formatSetupError(error) });
    }
  });

  app.post("/api/setup/start", async (request, reply) => {
    try {
      const state = setup.createBattle(request.body);
      session.replaceState(state);
      return { state, next: "/battle" };
    } catch (error) {
      return reply.code(400).send({ error: formatSetupError(error) });
    }
  });
}

function formatSetupError(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues.map((issue) => `${issue.path.join(".") || "setup"}: ${issue.message}`).join("\n");
  }
  return error instanceof Error ? error.message : String(error);
}
