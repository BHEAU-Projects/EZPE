import { z } from "zod";
import type { FastifyInstance } from "fastify";

import type { BattleSession } from "../../session/battle-session.js";
import { battleEventSchema } from "../../session/battle-events.js";

const rankRequestSchema = z
  .object({
    top: z.number().int().min(1).max(10).default(3),
    maxOpponentPlans: z.number().int().min(1).max(24).default(4)
  })
  .strict();

export function registerSessionRoutes(app: FastifyInstance, session: BattleSession): void {
  app.get("/api/state", async () => ({ state: session.getState() }));

  app.post("/api/event", async (request, reply) => {
    const event = battleEventSchema.safeParse(request.body);
    if (!event.success) {
      return reply.code(400).send({
        error: "Invalid battle event.",
        issues: event.error.issues
      });
    }

    try {
      return { state: session.applyEvent(event.data) };
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

      return {
        elapsedMs,
        totalPlans: results.length,
        results: results.slice(0, input.data.top).map((result) => ({
          rank: result.rank,
          choice: result.actionPlan.showdownChoice,
          score: result.score,
          confidence: result.confidence,
          explanationTags: result.explanationTags,
          outcomeSummary: result.outcomeSummary,
          expectedScore: result.debug.opponentEvaluation.expectedScore,
          worstCaseScore: result.debug.opponentEvaluation.worstCaseScore,
          worstOpponentChoice: result.debug.opponentEvaluation.worstOpponentChoice
        }))
      };
    } catch (error) {
      return reply.code(400).send({ error: formatError(error) });
    }
  });
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
