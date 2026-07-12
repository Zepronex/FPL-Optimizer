import { Router, Response, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { createDbPool, Queryable } from '../db/client';
import {
  readGameweekPredictionSummary,
  readLatestPredictionSummary,
  readPlayerPredictions,
  readTopPredictions
} from '../db/predictionQueries';
import { PLAYER_CANDIDATE_REQUIRED_COMMANDS } from '../db/playerQueries';
import {
  EmptyQuerySchema,
  GameweekIdParamSchema,
  PositiveIdParamSchema,
  queryIntegerSchema
} from './validation';

const PositionSchema = z.enum(['GK', 'DEF', 'MID', 'FWD']);
const playerParamsSchema = z.object({ playerId: PositiveIdParamSchema }).strict();
const gameweekParamsSchema = z.object({ gameweekId: GameweekIdParamSchema }).strict();

const topPredictionsQuerySchema = z.object({
  gameweekId: GameweekIdParamSchema.optional(),
  position: PositionSchema.optional(),
  limit: queryIntegerSchema(1, 100).optional().default('25')
}).strict();

export function createPredictionsRouter(client: Queryable = createDbPool()): ExpressRouter {
  const router: ExpressRouter = Router();

  router.get('/latest', async (req, res) => {
    try {
      EmptyQuerySchema.parse(req.query);
      const summary = await readLatestPredictionSummary(client);
      if (!summary) {
        return res.status(404).json({
          success: false,
          error: 'No prediction runs loaded',
          requiredCommands: PLAYER_CANDIDATE_REQUIRED_COMMANDS
        });
      }

      res.json({
        success: true,
        data: summary,
        count: summary.count
      });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.get('/player/:playerId', async (req, res) => {
    try {
      EmptyQuerySchema.parse(req.query);
      const { playerId } = playerParamsSchema.parse(req.params);
      const predictions = await readPlayerPredictions(client, playerId);
      if (predictions.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No predictions found for player'
        });
      }

      res.json({
        success: true,
        data: {
          playerId,
          predictions,
          count: predictions.length
        },
        count: predictions.length
      });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.get('/gameweek/:gameweekId', async (req, res) => {
    try {
      EmptyQuerySchema.parse(req.query);
      const { gameweekId } = gameweekParamsSchema.parse(req.params);
      const summary = await readGameweekPredictionSummary(client, gameweekId);
      if (!summary) {
        return res.status(404).json({
          success: false,
          error: 'No prediction run loaded for gameweek',
          requiredCommands: PLAYER_CANDIDATE_REQUIRED_COMMANDS
        });
      }

      res.json({
        success: true,
        data: summary,
        count: summary.count
      });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.get('/top', async (req, res) => {
    try {
      const filters = topPredictionsQuerySchema.parse(req.query);
      const summary = await readTopPredictions(client, filters);
      if (!summary) {
        return res.status(404).json({
          success: false,
          error: 'No prediction runs loaded',
          requiredCommands: PLAYER_CANDIDATE_REQUIRED_COMMANDS
        });
      }

      res.json({
        success: true,
        data: summary,
        count: summary.count
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
      error: 'Invalid prediction request',
      details: error.errors
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: 'Failed to fetch prediction data'
  });
}
