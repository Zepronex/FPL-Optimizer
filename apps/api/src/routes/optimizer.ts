import { Router, Response, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { createDbPool, Queryable } from '../db/client';
import {
  readGameweekPredictionSummary,
  readLatestPredictionSummary
} from '../db/predictionQueries';
import { PredictionSummary } from '../types';
import { decorateStartingXiScores, decorateTransferScores } from '../optimizer/displayScores';
import { OptimizerInputError } from '../optimizer/errors';
import { predictionsToCandidates } from '../optimizer/predictionAdapter';
import { buildSquadFromCandidates } from '../optimizer/squadBuilder';
import { optimizeStartingXi } from '../optimizer/startingXi';
import { recommendTransfers } from '../optimizer/transfers';
import { FPL_RULES, OPTIMIZER_POSITIONS, SQUAD_POSITION_COUNTS, roundMoney } from '../optimizer/rules';
import { PlayerCandidate, Squad, SquadSlot } from '../optimizer/types';
import {
  BodyGameweekIdSchema,
  BodyPositiveIdSchema,
  EmptyQuerySchema,
  MAX_AVAILABLE_PLAYERS,
  hasDuplicateNumbers
} from './validation';

const PositionSchema = z.enum(['GK', 'DEF', 'MID', 'FWD']);
const AvailabilitySchema = z.enum(['available', 'doubtful', 'unavailable', 'unknown']);
const MoneySchema = z.number().finite().min(0).max(200);
const BudgetSchema = z.number().finite().min(1).max(200);
const PlayerPriceSchema = z.number().finite().positive().max(25);
const PredictedPointsSchema = z.number().finite().min(0).max(100);
const OptimizerDisplayScoreSchema = z.object({
  rawExpectedPoints: PredictedPointsSchema.nullable(),
  contextualScoreOutOf10: z.number().finite().min(0).max(10).nullable(),
  positionPercentile: z.number().finite().min(0).max(100).nullable(),
  positionPoolSize: z.number().finite().int().min(0).max(2_000)
}).strict();

const PlayerCandidateSchema = z.object({
  playerId: BodyPositiveIdSchema,
  playerName: z.string().trim().min(1).max(100),
  position: PositionSchema,
  teamId: BodyPositiveIdSchema,
  teamName: z.string().trim().min(1).max(100).optional(),
  teamShortName: z.string().trim().min(1).max(10).optional(),
  price: PlayerPriceSchema,
  predictedPoints: PredictedPointsSchema,
  predictionRunId: BodyPositiveIdSchema.optional(),
  targetGameweekId: BodyGameweekIdSchema.optional(),
  fixtureId: BodyPositiveIdSchema.nullable().optional(),
  availability: AvailabilitySchema.optional(),
  displayScore: OptimizerDisplayScoreSchema.optional()
}).strict();

const SquadInputSchema = z.object({
  slots: z.array(PlayerCandidateSchema).length(15).optional(),
  playerIds: z.array(BodyPositiveIdSchema).length(15).optional(),
  bank: MoneySchema.default(0),
  budget: BudgetSchema.default(100)
}).strict().superRefine((value, context) => {
  if (Boolean(value.slots) === Boolean(value.playerIds)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['slots'],
      message: 'Provide exactly one of slots or playerIds'
    });
  }

  const playerIds = value.slots?.map(player => player.playerId) ?? value.playerIds ?? [];
  if (hasDuplicateNumbers(playerIds)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [value.slots ? 'slots' : 'playerIds'],
      message: 'Squad player IDs must be unique'
    });
  }

  if (value.bank > value.budget) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['bank'],
      message: 'Bank cannot exceed budget'
    });
  }
});

const StartingXiRequestSchema = z.object({
  squad: SquadInputSchema,
  gameweekId: BodyGameweekIdSchema.optional()
}).strict();

const TransfersRequestSchema = z.object({
  currentSquad: SquadInputSchema,
  availablePlayers: z.array(PlayerCandidateSchema).min(1).max(MAX_AVAILABLE_PLAYERS).optional(),
  gameweekId: BodyGameweekIdSchema.optional(),
  freeTransfers: z.number().finite().int().min(0).max(5),
  maxHits: z.number().finite().int().min(0).max(2).optional()
}).strict().superRefine((value, context) => {
  validateUniqueAvailablePlayers(value.availablePlayers, context);
});

const SquadBuildRequestSchema = z.object({
  availablePlayers: z.array(PlayerCandidateSchema).min(15).max(MAX_AVAILABLE_PLAYERS).optional(),
  gameweekId: BodyGameweekIdSchema.optional(),
  budget: BudgetSchema.default(100),
  reservedBank: MoneySchema.optional()
}).strict().superRefine((value, context) => {
  validateUniqueAvailablePlayers(value.availablePlayers, context);
  if (value.reservedBank !== undefined && value.reservedBank >= value.budget) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reservedBank'],
      message: 'Reserved bank must be less than budget'
    });
  }
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
      EmptyQuerySchema.parse(req.query);
      const request = StartingXiRequestSchema.parse(req.body);
      const predictionContext = request.squad.playerIds
        ? await readPredictionContext(client, request.gameweekId, request.squad.playerIds)
        : null;
      const squad = resolveSquad(request.squad, predictionContext?.candidates);
      const comparisonPool = predictionContext?.candidates ?? squad.slots;
      const startingXi = decorateStartingXiScores(optimizeStartingXi(squad), comparisonPool);

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
      EmptyQuerySchema.parse(req.query);
      const request = TransfersRequestSchema.parse(req.body);
      const needsPredictionContext = Boolean(request.currentSquad.playerIds || !request.availablePlayers);
      const predictionContext = needsPredictionContext
        ? await readPredictionContext(
            client,
            request.gameweekId,
            squadPlayerIds(request.currentSquad)
          )
        : null;
      const currentSquad = resolveSquad(request.currentSquad, predictionContext?.candidates);
      const availablePlayers = request.availablePlayers ?? predictionContext?.candidates;
      if (!availablePlayers) {
        throw new OptimizerRouteError(400, 'available_players_required');
      }

      const comparisonPool = uniquePlayersById([...currentSquad.slots, ...availablePlayers]);
      const currentStartingXi = decorateStartingXiScores(optimizeStartingXi(currentSquad), comparisonPool);
      const recommendations = recommendTransfers({
        currentSquad,
        availablePlayers,
        freeTransfers: request.freeTransfers,
        maxHits: request.maxHits
      }).map(recommendation => decorateTransferScores(recommendation, comparisonPool));

      res.json({
        success: true,
        data: {
          currentStartingXi,
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
      EmptyQuerySchema.parse(req.query);
      const request = SquadBuildRequestSchema.parse(req.body);
      const predictionContext = request.availablePlayers
        ? null
        : await readPredictionContext(client, request.gameweekId, [], {
            budget: request.budget,
            reservedBank: request.reservedBank
          });
      const candidates = request.availablePlayers ?? predictionContext?.candidates;
      if (!candidates) {
        throw new OptimizerRouteError(400, 'available_players_required');
      }

      const squad = buildSquadFromCandidates({
        candidates,
        budget: request.budget,
        reservedBank: request.reservedBank
      });
      const startingXi = decorateStartingXiScores(optimizeStartingXi(squad), candidates);

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

function validateUniqueAvailablePlayers(
  players: readonly z.infer<typeof PlayerCandidateSchema>[] | undefined,
  context: z.RefinementCtx
): void {
  if (!players || !hasDuplicateNumbers(players.map(player => player.playerId))) return;

  context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['availablePlayers'],
    message: 'Available player IDs must be unique'
  });
}

async function readPredictionContext(
  client: Queryable,
  gameweekId?: number,
  requiredPlayerIds: readonly number[] = [],
  squadConstraints?: DatabaseSquadConstraints
): Promise<{ summary: PredictionSummary; candidates: PlayerCandidate[] }> {
  const summary = gameweekId
    ? await readGameweekPredictionSummary(client, gameweekId)
    : await readLatestPredictionSummary(client);

  if (!summary) {
    throw new OptimizerRouteError(404, 'no_prediction_runs_loaded');
  }

  return {
    summary,
    candidates: boundDatabaseCandidates(
      predictionsToCandidates(summary.predictions),
      requiredPlayerIds,
      squadConstraints
    )
  };
}

interface DatabaseSquadConstraints {
  budget: number;
  reservedBank?: number;
}

export function boundDatabaseCandidates(
  candidates: readonly PlayerCandidate[],
  requiredPlayerIds: readonly number[] = [],
  squadConstraints?: DatabaseSquadConstraints
): PlayerCandidate[] {
  const ranked = uniquePlayersById(candidates)
    .sort((left, right) =>
      Number(left.availability === 'unavailable') - Number(right.availability === 'unavailable') ||
      right.predictedPoints - left.predictedPoints ||
      left.playerName.localeCompare(right.playerName) ||
      left.playerId - right.playerId
    );
  if (ranked.length <= MAX_AVAILABLE_PLAYERS) return ranked;

  const byId = new Map(ranked.map(candidate => [candidate.playerId, candidate]));
  const selected = new Map<number, PlayerCandidate>();
  for (const playerId of [...new Set(requiredPlayerIds)]) {
    const candidate = byId.get(playerId);
    if (candidate) selected.set(playerId, candidate);
  }

  const feasibleSeed = squadConstraints
    ? findMinimumCostFeasibleSquad(ranked, squadConstraints)
    : null;
  if (feasibleSeed) {
    for (const candidate of feasibleSeed) {
      selected.set(candidate.playerId, candidate);
    }
  } else {
    for (const position of OPTIMIZER_POSITIONS) {
      const currentCount = [...selected.values()].filter(candidate => candidate.position === position).length;
      const needed = Math.max(0, SQUAD_POSITION_COUNTS[position] - currentCount);
      for (const candidate of ranked.filter(candidate => candidate.position === position).slice(0, needed)) {
        selected.set(candidate.playerId, candidate);
      }
    }
  }

  for (const candidate of ranked) {
    if (selected.size >= MAX_AVAILABLE_PLAYERS) break;
    selected.set(candidate.playerId, candidate);
  }
  return [...selected.values()];
}

interface FeasibleSquadState {
  counts: Record<PlayerCandidate['position'], number>;
  players: PlayerCandidate[];
  cost: number;
  predictedPoints: number;
}

function findMinimumCostFeasibleSquad(
  candidates: readonly PlayerCandidate[],
  constraints: DatabaseSquadConstraints
): PlayerCandidate[] | null {
  const maxSpend = roundMoney(constraints.budget - (constraints.reservedBank ?? 0));
  if (maxSpend <= 0) return null;

  const candidatesByTeam = new Map<number, PlayerCandidate[]>();
  for (const candidate of candidates) {
    if (candidate.availability === 'unavailable') continue;
    const teamCandidates = candidatesByTeam.get(candidate.teamId) ?? [];
    teamCandidates.push(candidate);
    candidatesByTeam.set(candidate.teamId, teamCandidates);
  }

  let states = new Map<string, FeasibleSquadState>([[
    positionCountKey({ GK: 0, DEF: 0, MID: 0, FWD: 0 }),
    {
      counts: { GK: 0, DEF: 0, MID: 0, FWD: 0 },
      players: [],
      cost: 0,
      predictedPoints: 0
    }
  ]]);

  const orderedTeams = [...candidatesByTeam.entries()]
    .sort(([leftTeamId], [rightTeamId]) => leftTeamId - rightTeamId);
  for (const [, teamCandidates] of orderedTeams) {
    const options = feasibleTeamOptions(teamCandidates);
    const nextStates = new Map<string, FeasibleSquadState>();

    for (const state of states.values()) {
      for (const option of options) {
        const counts = addPositionCounts(state.counts, option.counts);
        if (OPTIMIZER_POSITIONS.some(position => counts[position] > SQUAD_POSITION_COUNTS[position])) {
          continue;
        }

        const cost = state.cost + option.cost;
        if (roundMoney(cost) > maxSpend) continue;

        const candidateState: FeasibleSquadState = {
          counts,
          players: [...state.players, ...option.players],
          cost,
          predictedPoints: state.predictedPoints + option.predictedPoints
        };
        const key = positionCountKey(counts);
        const current = nextStates.get(key);
        if (!current || isBetterFeasibleState(candidateState, current)) {
          nextStates.set(key, candidateState);
        }
      }
    }
    states = nextStates;
  }

  return states.get(positionCountKey(SQUAD_POSITION_COUNTS))?.players ?? null;
}

function feasibleTeamOptions(teamCandidates: readonly PlayerCandidate[]): FeasibleSquadState[] {
  const byPosition = Object.fromEntries(
    OPTIMIZER_POSITIONS.map(position => [
      position,
      teamCandidates
        .filter(candidate => candidate.position === position)
        .sort(compareByPriceThenProjection)
    ])
  ) as Record<PlayerCandidate['position'], PlayerCandidate[]>;
  const options: FeasibleSquadState[] = [];

  for (let goalkeepers = 0; goalkeepers <= Math.min(2, byPosition.GK.length); goalkeepers += 1) {
    for (let defenders = 0; defenders <= Math.min(3, byPosition.DEF.length); defenders += 1) {
      for (let midfielders = 0; midfielders <= Math.min(3, byPosition.MID.length); midfielders += 1) {
        for (let forwards = 0; forwards <= Math.min(3, byPosition.FWD.length); forwards += 1) {
          if (goalkeepers + defenders + midfielders + forwards > FPL_RULES.maxPlayersPerTeam) {
            continue;
          }

          const players = [
            ...byPosition.GK.slice(0, goalkeepers),
            ...byPosition.DEF.slice(0, defenders),
            ...byPosition.MID.slice(0, midfielders),
            ...byPosition.FWD.slice(0, forwards)
          ];
          options.push({
            counts: { GK: goalkeepers, DEF: defenders, MID: midfielders, FWD: forwards },
            players,
            cost: players.reduce((sum, player) => sum + player.price, 0),
            predictedPoints: players.reduce((sum, player) => sum + player.predictedPoints, 0)
          });
        }
      }
    }
  }
  return options;
}

function addPositionCounts(
  left: Record<PlayerCandidate['position'], number>,
  right: Record<PlayerCandidate['position'], number>
): Record<PlayerCandidate['position'], number> {
  return {
    GK: left.GK + right.GK,
    DEF: left.DEF + right.DEF,
    MID: left.MID + right.MID,
    FWD: left.FWD + right.FWD
  };
}

function positionCountKey(counts: Record<PlayerCandidate['position'], number>): string {
  return `${counts.GK}:${counts.DEF}:${counts.MID}:${counts.FWD}`;
}

function isBetterFeasibleState(candidate: FeasibleSquadState, current: FeasibleSquadState): boolean {
  if (candidate.cost !== current.cost) return candidate.cost < current.cost;
  if (candidate.predictedPoints !== current.predictedPoints) {
    return candidate.predictedPoints > current.predictedPoints;
  }
  return candidate.players.map(player => player.playerId).join(',') <
    current.players.map(player => player.playerId).join(',');
}

function compareByPriceThenProjection(left: PlayerCandidate, right: PlayerCandidate): number {
  return left.price - right.price ||
    right.predictedPoints - left.predictedPoints ||
    left.playerId - right.playerId;
}

function squadPlayerIds(input: SquadInput): number[] {
  return input.playerIds ?? input.slots?.map(player => player.playerId) ?? [];
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

function uniquePlayersById<T extends PlayerCandidate>(players: readonly T[]): T[] {
  const playerById = new Map<number, T>();
  for (const player of players) {
    if (!playerById.has(player.playerId)) {
      playerById.set(player.playerId, player);
    }
  }
  return [...playerById.values()];
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
