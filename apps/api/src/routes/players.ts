import { Router, Response, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { createDbPool, Queryable } from '../db/client';
import {
  PLAYER_CANDIDATE_REQUIRED_COMMANDS,
  readSquadBuilderPlayers,
  searchEnrichedPlayers
} from '../db/playerQueries';

// Validation schemas
const searchSchema = z.object({
  name: z.string().min(1).max(100)
});

const positionSchema = z.enum(['GK', 'DEF', 'MID', 'FWD']);
const playerIdSchema = z.coerce.number().int().positive();

export function createPlayersRouter(client: Queryable = createDbPool()): ExpressRouter {
  const router: ExpressRouter = Router();

  // GET /api/players - Get prediction-backed local players
  router.get('/', async (_req, res) => {
    try {
      const players = await readSquadBuilderPlayers(client);
      if (players.length === 0) return sendMissingPlayerData(res);

      res.json({
        success: true,
        data: players,
        count: players.length
      });
    } catch (error) {
      sendPlayerDataError(res);
    }
  });

  // GET /api/players/search?name=playerName - Search prediction-backed local players by name
  router.get('/search', async (req, res) => {
    try {
      const { name } = searchSchema.parse(req.query);
      const players = await readSquadBuilderPlayers(client);
      if (players.length === 0) return sendMissingPlayerData(res);

      const matches = searchEnrichedPlayers(players, name);

      res.json({
        success: true,
        data: matches,
        count: matches.length
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid search parameters',
          details: error.errors
        });
      }

      sendPlayerDataError(res);
    }
  });

  // GET /api/players/position/:pos - Get prediction-backed local players by position
  router.get('/position/:pos', async (req, res) => {
    try {
      const position = positionSchema.parse(req.params.pos.toUpperCase());
      const players = await readSquadBuilderPlayers(client);
      if (players.length === 0) return sendMissingPlayerData(res);

      const filteredPlayers = players.filter(player => player.pos === position);

      res.json({
        success: true,
        data: filteredPlayers,
        count: filteredPlayers.length
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid position. Must be GK, DEF, MID, or FWD',
          details: error.errors
        });
      }

      sendPlayerDataError(res);
    }
  });

  // GET /api/players/:id - Get specific prediction-backed local player by ID
  router.get('/:id', async (req, res) => {
    try {
      const playerId = playerIdSchema.parse(req.params.id);
      const players = await readSquadBuilderPlayers(client);
      if (players.length === 0) return sendMissingPlayerData(res);

      const player = players.find(candidate => candidate.id === playerId);

      if (!player) {
        return res.status(404).json({
          success: false,
          error: 'Player not found'
        });
      }

      res.json({
        success: true,
        data: player
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid player ID',
          details: error.errors
        });
      }

      sendPlayerDataError(res);
    }
  });

  return router;
}

function sendMissingPlayerData(res: Response): void {
  res.status(503).json({
    success: false,
    error: 'No prediction-backed player candidates are loaded. Run the local data pipeline and load predictions into PostgreSQL.',
    data: [],
    count: 0,
    requiredCommands: PLAYER_CANDIDATE_REQUIRED_COMMANDS
  });
}

function sendPlayerDataError(res: Response): void {
  res.status(503).json({
    success: false,
    error: 'Could not load local player data. Start PostgreSQL and run the documented data pipeline.',
    data: [],
    count: 0,
    requiredCommands: PLAYER_CANDIDATE_REQUIRED_COMMANDS
  });
}

export const playersRouter = createPlayersRouter();
