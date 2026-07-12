import { Router, Response, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { createDbPool, Queryable } from '../db/client';
import { readLatestModelEvaluation } from '../db/predictionQueries';
import { EmptyQuerySchema } from './validation';

export function createModelRouter(client: Queryable = createDbPool()): ExpressRouter {
  const router: ExpressRouter = Router();

  router.get('/evaluations/latest', async (req, res) => {
    try {
      EmptyQuerySchema.parse(req.query);
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

function handleRouteError(res: Response, error: unknown): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({
      success: false,
      error: 'invalid_model_request',
      details: error.errors
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: 'Failed to fetch model evaluation data'
  });
}
