import { z } from "zod";
import type { FastifyInstance } from "fastify";

import type { BattleSession } from "../../session/battle-session.js";
import { battleEventSchema } from "../../session/battle-events.js";
import { turnReportSchema } from "../../session/turn-report.js";
import { observedActionSchema } from "../../session/turn-report.js";
import { suggestTurnEffects } from "../../session/turn-effects.js";
import { AdvicePresenter, presentPlayerMovePp } from "../../advisor/advice-presenter.js";

const rankRequestSchema = z
  .object({
    top: z.number().int().min(1).max(10).default(3),
    maxOpponentPlans: z.number().int().min(1).max(24).default(4)
  })
  .strict();

const turnEffectRequestSchema = z.object({ actions: z.array(observedActionSchema).min(1).max(4) }).strict();

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

  app.post("/api/turn", async (request, reply) => {
    const report = turnReportSchema.safeParse(request.body);
    if (!report.success) {
      return reply.code(400).send({ error: "Invalid turn report.", issues: report.error.issues });
    }

    try {
      const resolution = session.applyTurn(report.data);
      const advice = rankPayload(session, report.data.ranking.top, report.data.ranking.maxOpponentPlans);
      return {
        ...resolution,
        playerMovePp: presentPlayerMovePp(resolution.state),
        advice
      };
    } catch (error) {
      return reply.code(400).send({ error: formatError(error) });
    }
  });

  app.post("/api/turn/effects", async (request, reply) => {
    const input = turnEffectRequestSchema.safeParse(request.body);
    if (!input.success) {
      return reply.code(400).send({ error: "Invalid observed actions.", issues: input.error.issues });
    }
    return { suggestions: suggestTurnEffects(session.getState(), input.data.actions) };
  });

  app.post("/api/rank", async (request, reply) => {
    const input = rankRequestSchema.safeParse(request.body ?? {});
    if (!input.success) {
      return reply.code(400).send({ error: "Invalid ranking options.", issues: input.error.issues });
    }

    try {
      return rankPayload(session, input.data.top, input.data.maxOpponentPlans);
    } catch (error) {
      return reply.code(400).send({ error: formatError(error) });
    }
  });
}

function rankPayload(session: BattleSession, top: number, maxOpponentPlans: number) {
  const startedAt = performance.now();
  const results = session.rank({ maxOpponentPlans });
  const presenter = new AdvicePresenter(session.getState());
  const presentedResults = results.slice(0, top).map((result) => ({
    rank: result.rank,
    actions: presenter.presentPlan(result.actionPlan),
    worstCase: presenter.findWorstEnemyDamagePlan(result.actionPlan),
    score: result.score,
    confidence: result.confidence,
    expectedScore: result.debug.opponentEvaluation.expectedScore,
    worstCaseScore: result.debug.opponentEvaluation.worstCaseScore
  }));

  return {
    elapsedMs: performance.now() - startedAt,
    totalPlans: results.length,
    results: presentedResults
  };
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
