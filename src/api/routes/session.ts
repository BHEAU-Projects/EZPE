import { z } from "zod";
import type { FastifyInstance } from "fastify";

import type { BattleSession } from "../../session/battle-session.js";
import { battleEventSchema } from "../../session/battle-events.js";
import { AdvicePresenter, presentPlayerMovePp } from "../../advisor/advice-presenter.js";

const rankRequestSchema = z
  .object({
    top: z.number().int().min(1).max(10).default(3),
    maxOpponentPlans: z.number().int().min(1).max(24).default(4)
  })
  .strict();

export function registerSessionRoutes(app: FastifyInstance, session: BattleSession): void {
  app.get("/api/state", async () => statePayload(session));

  app.post("/api/event", async (request, reply) => {
    const event = battleEventSchema.safeParse(request.body);
    if (!event.success) {
      return reply.code(400).send({
        error: "Invalid battle event.",
        issues: event.error.issues
      });
    }

    try {
      session.applyEvent(event.data);
      return statePayload(session);
    } catch (error) {
      return reply.code(400).send({ error: formatError(error) });
    }
  });

  app.post("/api/rank", async (request, reply) => {
    const input = rankRequestSchema.safeParse(request.body ?? {});
    if (!input.success) {
      return reply.code(400).send({ error: "Invalid ranking options.", issues: input.error.issues });
    }

    try {
      const startedAt = performance.now();
      const results = session.rank({ maxOpponentPlans: input.data.maxOpponentPlans });
      const elapsedMs = performance.now() - startedAt;
      const presenter = new AdvicePresenter(session.getState());

      return {
        elapsedMs,
        totalPlans: results.length,
        worstCase: presenter.findWorstEnemyDamagePlan(),
        results: results.slice(0, input.data.top).map((result) => ({
          rank: result.rank,
          actions: presenter.presentPlan(result.actionPlan),
          score: result.score,
          confidence: result.confidence,
          expectedScore: result.debug.opponentEvaluation.expectedScore,
          worstCaseScore: result.debug.opponentEvaluation.worstCaseScore
        }))
      };
    } catch (error) {
      return reply.code(400).send({ error: formatError(error) });
    }
  });
}

function statePayload(session: BattleSession) {
  const state = session.getState();
  return {
    state,
    playerMovePp: presentPlayerMovePp(state)
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
