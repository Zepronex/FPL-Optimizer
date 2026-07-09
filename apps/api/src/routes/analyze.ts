import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { SquadAnalyzer } from '../lib/squad';
import { ScoringService } from '../lib/scoring';
import { AnalysisWeights, EnrichedPlayer, Squad, SquadSlot } from '../types';
import { createDbPool, Queryable } from '../db/client';
import {
  PLAYER_CANDIDATE_REQUIRED_COMMANDS,
  readSquadBuilderPlayers
} from '../db/playerQueries';

// Validation schemas
const squadSlotSchema = z.object({
  id: z.number().int().positive(),
  pos: z.enum(['GK', 'DEF', 'MID', 'FWD']),
  price: z.number().positive().max(15),
  teamId: z.number().int().positive().optional()
});

const squadSchema = z.object({
  startingXI: z.array(squadSlotSchema).length(11),
  bench: z.array(squadSlotSchema).length(4),
  bank: z.number().min(0).max(100)
});

const weightsSchema = z.object({
  form: z.number().min(0).max(1).optional(),
  xg90: z.number().min(0).max(1).optional(),
  xa90: z.number().min(0).max(1).optional(),
  expMin: z.number().min(0).max(1).optional(),
  next3Ease: z.number().min(0).max(1).optional(),
  avgPoints: z.number().min(0).max(1).optional(),
  value: z.number().min(0).max(1).optional(),
  ownership: z.number().min(0).max(1).optional()
});

const analyzeRequestSchema = z.object({
  squad: squadSchema,
  weights: weightsSchema.optional()
});

export function createAnalyzeRouter(client: Queryable = createDbPool()): ExpressRouter {
  const router: ExpressRouter = Router();

  // POST /api/analyze - Analyze squad and get suggestions
  router.post('/', async (req, res) => {
    try {
      const { squad, weights } = analyzeRequestSchema.parse(req.body);
      const playerPool = await readSquadBuilderPlayers(client);

      if (playerPool.length === 0) {
        return res.status(503).json({
          success: false,
          error: 'Prediction data is missing. Run the prediction pipeline and load predictions into PostgreSQL.',
          requiredCommands: PLAYER_CANDIDATE_REQUIRED_COMMANDS
        });
      }

      const enrichedSquad = enrichSquadFromPlayerPool(squad, playerPool);
      const unknownPlayerIds = getUnknownPlayerIds(squad, playerPool);

      if (unknownPlayerIds.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Some squad players do not have prediction rows. Re-run the prediction pipeline and reload predictions into PostgreSQL.',
          details: { playerIds: unknownPlayerIds },
          requiredCommands: PLAYER_CANDIDATE_REQUIRED_COMMANDS
        });
      }

      // Validate squad formation and constraints after enrichment from authoritative local data.
      const validation = SquadAnalyzer.validateSquad(enrichedSquad);
      if (!validation.valid) {
        const errors = validation.errors.length > 0
          ? validation.errors
          : ['Invalid squad configuration.'];

        return res.status(400).json({
          success: false,
          error: errors[0],
          details: errors
        });
      }

      const analysisWeights = normalizeWeights({
        form: weights?.form ?? 0.2,
        xg90: weights?.xg90 ?? 0.15,
        xa90: weights?.xa90 ?? 0.15,
        expMin: weights?.expMin ?? 0.15,
        next3Ease: weights?.next3Ease ?? 0.1,
        avgPoints: weights?.avgPoints ?? 0.15,
        value: weights?.value ?? 0.05,
        ownership: weights?.ownership ?? 0.05
      });

      const analysis = await SquadAnalyzer.analyzeSquad(enrichedSquad, analysisWeights, playerPool);

      res.json({
        success: true,
        data: {
          ...analysis,
          weights: analysisWeights,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request data',
          details: error.errors
        });
      }

      res.status(503).json({
        success: false,
        error: 'Could not load local prediction data for squad analysis. Start PostgreSQL and run the documented data pipeline.',
        requiredCommands: PLAYER_CANDIDATE_REQUIRED_COMMANDS
      });
    }
  });

  // POST /api/analyze/validate - Validate squad without analysis
  router.post('/validate', async (req, res) => {
    try {
      const { squad } = z.object({ squad: squadSchema }).parse(req.body);
      const playerPool = await readSquadBuilderPlayers(client);

      if (playerPool.length === 0) {
        return res.status(503).json({
          success: false,
          error: 'Prediction data is missing. Run the prediction pipeline and load predictions into PostgreSQL.',
          requiredCommands: PLAYER_CANDIDATE_REQUIRED_COMMANDS
        });
      }

      const unknownPlayerIds = getUnknownPlayerIds(squad, playerPool);
      if (unknownPlayerIds.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Selected player data could not be found in prediction rows. Reload data and try again.',
          details: { playerIds: unknownPlayerIds },
          requiredCommands: PLAYER_CANDIDATE_REQUIRED_COMMANDS
        });
      }

      const enrichedSquad = enrichSquadFromPlayerPool(squad, playerPool);
      const validation = SquadAnalyzer.validateSquad(enrichedSquad);

      res.json({
        success: true,
        data: {
          valid: validation.valid,
          errors: validation.errors
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request data',
          details: error.errors
        });
      }

      res.status(503).json({
        success: false,
        error: 'Could not load local prediction data for squad validation. Start PostgreSQL and run the documented data pipeline.',
        requiredCommands: PLAYER_CANDIDATE_REQUIRED_COMMANDS
      });
    }
  });

  // GET /api/analyze/weights - Get default weights
  router.get('/weights', (_req, res) => {
    res.json({
      success: true,
      data: {
        form: 0.2,
        xg90: 0.15,
        xa90: 0.15,
        expMin: 0.15,
        next3Ease: 0.1,
        avgPoints: 0.15,
        value: 0.05,
        ownership: 0.05
      }
    });
  });

  // GET /api/analyze/presets - Get weight presets
  router.get('/presets', (_req, res) => {
    res.json({
      success: true,
      data: ScoringService.getWeightPresets()
    });
  });

  return router;
}

function enrichSquadFromPlayerPool(squad: Squad, playerPool: EnrichedPlayer[]): Squad {
  const playerMap = new Map(playerPool.map(player => [player.id, player]));
  const startingXI = squad.startingXI.map(slot => enrichSlot(slot, playerMap));
  const bench = squad.bench.map(slot => enrichSlot(slot, playerMap));
  const bank = roundMoney(100 - calculateSquadCost([...startingXI, ...bench]));

  return {
    startingXI,
    bench,
    bank
  };
}

function enrichSlot(slot: SquadSlot, playerMap: Map<number, EnrichedPlayer>): SquadSlot {
  const player = playerMap.get(slot.id);
  if (!player) return slot;

  return {
    id: player.id,
    pos: player.pos,
    price: player.price,
    name: player.name,
    teamShort: player.teamShort,
    teamId: player.teamId
  };
}

function getUnknownPlayerIds(squad: Squad, playerPool: EnrichedPlayer[]): number[] {
  const knownPlayerIds = new Set(playerPool.map(player => player.id));
  const selectedPlayerIds = [...squad.startingXI, ...squad.bench].map(slot => slot.id);

  return [...new Set(selectedPlayerIds.filter(playerId => !knownPlayerIds.has(playerId)))]
    .sort((left, right) => left - right);
}

function normalizeWeights(weights: AnalysisWeights): AnalysisWeights {
  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 0) return weights;

  return Object.fromEntries(
    Object.entries(weights).map(([key, value]) => [key, value / totalWeight])
  ) as AnalysisWeights;
}

function calculateSquadCost(slots: readonly SquadSlot[]): number {
  return slots.reduce((sum, slot) => sum + slot.price, 0);
}

function roundMoney(value: number): number {
  return Math.round(value * 10) / 10;
}

export const analyzeRouter = createAnalyzeRouter();

