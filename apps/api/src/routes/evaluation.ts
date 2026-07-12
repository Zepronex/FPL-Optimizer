import { Router, Response, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { createDbPool, Queryable } from '../db/client';
import { readDatabaseConfig } from '../db/config';
import {
  readEvaluationDataCoverage,
  readLatestModelEvaluation,
  readLatestPredictionRun,
  readModelEvaluationRuns
} from '../db/predictionQueries';
import {
  buildEvaluationDataHealth,
  buildEvaluationLatest,
  buildEvaluationRuns,
  readPlayerGameweekHistoryArtifact
} from '../evaluation/dashboard';
import { EmptyQuerySchema, queryIntegerSchema } from './validation';

type EvaluationRouterOptions = {
  playerGameweekHistoryPath?: string;
  now?: () => Date;
};

const runsQuerySchema = z.object({
  limit: queryIntegerSchema(1, 100).optional().default('25')
}).strict();

export function createEvaluationRouter(
  client: Queryable = createDbPool(),
  options: EvaluationRouterOptions = {}
): ExpressRouter {
  const router: ExpressRouter = Router();

  router.get('/latest', async (req, res) => {
    try {
      EmptyQuerySchema.parse(req.query);
      const [evaluation, latestPredictionRun] = await Promise.all([
        readLatestModelEvaluation(client),
        readLatestPredictionRun(client)
      ]);

      res.json({
        success: true,
        data: buildEvaluationLatest({
          evaluation,
          latestPredictionRun
        })
      });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.get('/runs', async (req, res) => {
    try {
      const query = runsQuerySchema.parse(req.query);
      const evaluations = await readModelEvaluationRuns(client, { limit: query.limit });
      const data = buildEvaluationRuns(evaluations);

      res.json({
        success: true,
        data,
        count: data.count
      });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.get('/data-health', async (req, res) => {
    try {
      EmptyQuerySchema.parse(req.query);
      const historyPath = options.playerGameweekHistoryPath ?? readDatabaseConfig().defaultFplHistoryPath;
      const [coverage, latestPredictionRun, historyArtifact] = await Promise.all([
        readEvaluationDataCoverage(client),
        readLatestPredictionRun(client),
        readPlayerGameweekHistoryArtifact(historyPath)
      ]);

      res.json({
        success: true,
        data: buildEvaluationDataHealth({
          coverage,
          latestPredictionRun,
          historyArtifact,
          now: options.now?.()
        })
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
      error: 'invalid_evaluation_request',
      details: error.errors
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: 'Failed to fetch evaluation data'
  });
}
