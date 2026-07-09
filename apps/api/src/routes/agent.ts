import { Router, Response, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { AgentPublicStatus, readAgentPublicStatus } from '../agent/config';
import { explainRecommendation } from '../agent/explanationService';
import {
  ExplainRecommendationRequestSchema,
  RecommendationExplanation,
  RecommendationExplanationInput
} from '../agent/schemas';

type ExplainRecommendationFn = (
  input: RecommendationExplanationInput
) => Promise<RecommendationExplanation>;

type ReadAgentStatusFn = () => AgentPublicStatus;

type AgentRouterOptions = {
  explainRecommendation?: ExplainRecommendationFn;
  readAgentStatus?: ReadAgentStatusFn;
};

export function createAgentRouter(options: AgentRouterOptions = {}): ExpressRouter {
  const router: ExpressRouter = Router();
  const explain = options.explainRecommendation ?? explainRecommendation;
  const readStatus = options.readAgentStatus ?? (() => readAgentPublicStatus());

  router.get('/status', (_req, res) => {
    res.json({
      success: true,
      data: readStatus()
    });
  });

  router.post('/explain-recommendation', async (req, res) => {
    try {
      const request = ExplainRecommendationRequestSchema.parse(req.body);
      const explanation = await explain(request.optimizerResult);

      res.json({
        success: true,
        data: explanation
      });
    } catch (error) {
      handleAgentRouteError(res, error);
    }
  });

  return router;
}

function handleAgentRouteError(res: Response, error: unknown): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({
      success: false,
      error: 'invalid_agent_request',
      details: error.errors
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: 'agent_request_failed'
  });
}

export const agentRouter = createAgentRouter();
