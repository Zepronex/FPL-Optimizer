import { Router, Response, type Router as ExpressRouter } from 'express';
import { createDbPool, Queryable } from '../db/client';
import { readLatestModelEvaluation } from '../db/predictionQueries';

export function createModelRouter(client: Queryable = createDbPool()): ExpressRouter {
  const router: ExpressRouter = Router();

  router.get('/evaluations/latest', async (_req, res) => {
    try {
      const evaluation = await readLatestModelEvaluation(client);
      if (!evaluation) {
        return res.status(404).json({
          success: false,
          error: 'No model evaluations loaded'
        });
      }

      res.json({
        success: true,
        data: evaluation
      });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  return router;
}

function handleRouteError(res: Response, _error: unknown): void {
  res.status(500).json({
    success: false,
    error: 'Failed to fetch model evaluation data'
  });
}

export const modelRouter = createModelRouter();
