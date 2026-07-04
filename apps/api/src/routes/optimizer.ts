import { Router, Response, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { createDbPool, Queryable } from '../db/client';
import {
  readGameweekPredictionSummary,
  readLatestPredictionSummary
} from '../db/predictionQueries';
import { PredictionSummary } from '../types';
import { OptimizerInputError } from '../optimizer/errors';
import { predictionsToCandidates } from '../optimizer/predictionAdapter';
import { buildSquadFromCandidates } from '../optimizer/squadBuilder';
import { optimizeStartingXi } from '../optimizer/startingXi';
import { recommendTransfers } from '../optimizer/transfers';
import { PlayerCandidate, Squad, SquadSlot } from '../optimizer/types';

const PositionSchema = z.enum(['GK', 'DEF', 'MID', 'FWD']);
const AvailabilitySchema = z.enum(['available', 'doubtful', 'unavailable', 'unknown']);
const PositiveIdSchema = z.coerce.number().int().positive();
const MoneySchema = z.coerce.number().nonnegative();

const PlayerCandidateSchema = z.object({
  playerId: PositiveIdSchema,
  playerName: z.string().min(1),
  position: PositionSchema,
  teamId: PositiveIdSchema,
  teamName: z.string().min(1).optional(),
  teamShortName: z.string().min(1).optional(),
  price: MoneySchema,
  predictedPoints: z.coerce.number().nonnegative(),
  predictionRunId: PositiveIdSchema.optional(),
  targetGameweekId: PositiveIdSchema.optional(),
  fixtureId: PositiveIdSchema.nullable().optional(),
  availability: AvailabilitySchema.optional()
});

const SquadInputSchema = z.object({
  slots: z.array(PlayerCandidateSchema).length(15).optional(),
  playerIds: z.array(PositiveIdSchema).length(15).optional(),
  bank: MoneySchema.default(0),
  budget: MoneySchema.default(100)
}).superRefine((value, context) => {
  if (!value.slots && !value.playerIds) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['slots'],
      message: 'Provide either slots or playerIds'
    });
  }
});

const StartingXiRequestSchema = z.object({
  squad: SquadInputSchema,
  gameweekId: PositiveIdSchema.optional()
});

const TransfersRequestSchema = z.object({
  currentSquad: SquadInputSchema,
  availablePlayers: z.array(PlayerCandidateSchema).optional(),
  gameweekId: PositiveIdSchema.optional(),
  freeTransfers: z.coerce.number().int().min(0),
  maxHits: z.coerce.number().int().min(0).optional()
});

const SquadBuildRequestSchema = z.object({
  availablePlayers: z.array(PlayerCandidateSchema).optional(),
  gameweekId: PositiveIdSchema.optional(),
  budget: MoneySchema.default(100),
  reservedBank: MoneySchema.optional()
});

type SquadInput = z.infer<typeof SquadInputSchema>;

class OptimizerRouteError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(code);
    this.name = 'OptimizerRouteError';
  }
}

export function createOptimizerRouter(client: Queryable = createDbPool()): ExpressRouter {
  const router: ExpressRouter = Router();

  router.post('/starting-xi', async (req, res) => {
    try {
      const request = StartingXiRequestSchema.parse(req.body);
      const predictionContext = request.squad.playerIds
        ? await readPredictionContext(client, request.gameweekId)
        : null;
      const squad = resolveSquad(request.squad, predictionContext?.candidates);
      const startingXi = optimizeStartingXi(squad);

      res.json({
        success: true,
        data: {
          startingXi,
          predictionRunIds: predictionRunIdsFromCandidates(squad.slots),
          targetGameweekId: targetGameweekFromCandidates(squad.slots)
        }
      });
    } catch (error) {
      handleOptimizerRouteError(res, error);
    }
  });

  router.post('/transfers', async (req, res) => {
    try {
      const request = TransfersRequestSchema.parse(req.body);
      const needsPredictionContext = Boolean(request.currentSquad.playerIds || !request.availablePlayers);
      const predictionContext = needsPredictionContext
        ? await readPredictionContext(client, request.gameweekId)
        : null;
      const currentSquad = resolveSquad(request.currentSquad, predictionContext?.candidates);
      const availablePlayers = request.availablePlayers ?? predictionContext?.candidates;
      if (!availablePlayers) {
        throw new OptimizerRouteError(400, 'available_players_required');
      }

      const recommendations = recommendTransfers({
        currentSquad,
        availablePlayers,
        freeTransfers: request.freeTransfers,
        maxHits: request.maxHits
      });

      res.json({
        success: true,
        data: {
          currentStartingXi: optimizeStartingXi(currentSquad),
          recommendations,
          predictionRunIds: predictionRunIdsFromCandidates([...currentSquad.slots, ...availablePlayers]),
          targetGameweekId: targetGameweekFromCandidates([...currentSquad.slots, ...availablePlayers])
        },
        count: recommendations.length
      });
    } catch (error) {
      handleOptimizerRouteError(res, error);
    }
  });

  router.post('/squad', async (req, res) => {
    try {
      const request = SquadBuildRequestSchema.parse(req.body);
      const predictionContext = request.availablePlayers
        ? null
        : await readPredictionContext(client, request.gameweekId);
      const candidates = request.availablePlayers ?? predictionContext?.candidates;
      if (!candidates) {
        throw new OptimizerRouteError(400, 'available_players_required');
      }

      const squad = buildSquadFromCandidates({
        candidates,
        budget: request.budget,
        reservedBank: request.reservedBank
      });
      const startingXi = optimizeStartingXi(squad);

      res.json({
        success: true,
        data: {
          squad,
          startingXi,
          predictionRunIds: predictionRunIdsFromCandidates(squad.slots),
          targetGameweekId: targetGameweekFromCandidates(squad.slots)
        }
      });
    } catch (error) {
      handleOptimizerRouteError(res, error);
    }
  });

  return router;
}

async function readPredictionContext(
  client: Queryable,
  gameweekId?: number
): Promise<{ summary: PredictionSummary; candidates: PlayerCandidate[] }> {
  const summary = gameweekId
    ? await readGameweekPredictionSummary(client, gameweekId)
    : await readLatestPredictionSummary(client);

  if (!summary) {
    throw new OptimizerRouteError(404, 'no_prediction_runs_loaded');
  }

  return {
    summary,
    candidates: predictionsToCandidates(summary.predictions)
  };
}

function resolveSquad(input: SquadInput, predictionCandidates?: readonly PlayerCandidate[]): Squad {
  if (input.slots) {
    return toSquad(input.slots, input.budget, input.bank);
  }

  if (!input.playerIds) {
    throw new OptimizerRouteError(400, 'squad_players_required');
  }

  if (!predictionCandidates) {
    throw new OptimizerRouteError(400, 'prediction_candidates_required');
  }

  const candidateById = new Map(predictionCandidates.map(candidate => [candidate.playerId, candidate]));
  const missingPlayerIds = input.playerIds.filter(playerId => !candidateById.has(playerId));
  if (missingPlayerIds.length > 0) {
    throw new OptimizerRouteError(400, 'squad_predictions_missing', { playerIds: missingPlayerIds });
  }

  return toSquad(
    input.playerIds.map(playerId => candidateById.get(playerId)).filter(isPlayerCandidate),
    input.budget,
    input.bank
  );
}

function toSquad(players: readonly PlayerCandidate[], budget: number, bank: number): Squad {
  return {
    budget,
    bank,
    slots: players.map((player, index) => ({
      ...player,
      slotIndex: index
    }))
  };
}

function isPlayerCandidate(value: PlayerCandidate | undefined): value is PlayerCandidate {
  return value !== undefined;
}

function predictionRunIdsFromCandidates(candidates: readonly PlayerCandidate[]): number[] {
  return uniqueSortedNumbers(candidates.map(candidate => candidate.predictionRunId));
}

function targetGameweekFromCandidates(candidates: readonly PlayerCandidate[]): number | undefined {
  return uniqueSortedNumbers(candidates.map(candidate => candidate.targetGameweekId))[0];
}

function uniqueSortedNumbers(values: ReadonlyArray<number | undefined>): number[] {
  return [...new Set(values.filter((value): value is number => value !== undefined))]
    .sort((left, right) => left - right);
}

function handleOptimizerRouteError(res: Response, error: unknown): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({
      success: false,
      error: 'invalid_optimizer_request',
      details: error.errors
    });
    return;
  }

  if (error instanceof OptimizerInputError) {
    res.status(400).json({
      success: false,
      error: error.code,
      validation: error.validation
    });
    return;
  }

  if (error instanceof OptimizerRouteError) {
    res.status(error.status).json({
      success: false,
      error: error.code,
      details: error.details
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: 'optimizer_request_failed'
  });
}

export const optimizerRouter = createOptimizerRouter();
