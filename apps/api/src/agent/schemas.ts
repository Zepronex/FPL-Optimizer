import { z } from 'zod';

const PositionSchema = z.enum(['GK', 'DEF', 'MID', 'FWD']);
const AvailabilitySchema = z.enum(['available', 'doubtful', 'unavailable', 'unknown']);
const PositiveIdSchema = z.coerce.number().int().positive();
const MoneySchema = z.coerce.number().nonnegative();
const ConstraintValueSchema = z.union([z.number(), z.string(), z.record(z.number())]);

export const PlayerCandidateSchema = z.object({
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
}).strict();

export const SquadSlotSchema = PlayerCandidateSchema.extend({
  slotIndex: z.coerce.number().int().min(0)
}).strict();

export const SquadSchema = z.object({
  slots: z.array(SquadSlotSchema).length(15),
  budget: MoneySchema,
  bank: MoneySchema
}).strict();

export const ConstraintCheckSchema = z.object({
  key: z.string().min(1),
  passed: z.boolean(),
  expected: ConstraintValueSchema,
  actual: ConstraintValueSchema
}).strict();

export const ConstraintViolationSchema = z.object({
  code: z.enum([
    'duplicate_player',
    'invalid_budget',
    'invalid_captaincy',
    'invalid_formation',
    'invalid_position_count',
    'invalid_squad_size',
    'invalid_starting_xi_size',
    'max_players_per_team',
    'transfer_count_exceeded',
    'unknown_player'
  ]),
  key: z.string().min(1),
  expected: ConstraintValueSchema,
  actual: ConstraintValueSchema,
  playerIds: z.array(PositiveIdSchema).optional(),
  teamId: PositiveIdSchema.optional()
}).strict();

export const ConstraintValidationResultSchema = z.object({
  valid: z.boolean(),
  checks: z.array(ConstraintCheckSchema),
  violations: z.array(ConstraintViolationSchema)
}).strict();

export const CaptaincyRecommendationSchema = z.object({
  captain: SquadSlotSchema,
  viceCaptain: SquadSlotSchema,
  captainPredictedPoints: z.coerce.number().nonnegative(),
  viceCaptainPredictedPoints: z.coerce.number().nonnegative()
}).strict();

export const StartingXISchema = z.object({
  formation: z.enum(['3-4-3', '3-5-2', '4-4-2', '4-3-3', '4-5-1', '5-3-2', '5-4-1']),
  starters: z.array(SquadSlotSchema).length(11),
  bench: z.array(SquadSlotSchema).length(4),
  captaincy: CaptaincyRecommendationSchema,
  totalPredictedPoints: z.coerce.number().nonnegative(),
  constraintSummary: ConstraintValidationResultSchema
}).strict();

export const TransferMoveSchema = z.object({
  playerOut: SquadSlotSchema,
  playerIn: PlayerCandidateSchema,
  predictedPointsDelta: z.coerce.number(),
  costDelta: z.coerce.number()
}).strict();

export const TransferRecommendationSchema = z.object({
  transferCount: z.union([z.literal(1), z.literal(2)]),
  moves: z.array(TransferMoveSchema).min(1),
  expectedPointsGain: z.coerce.number(),
  pointsHit: z.coerce.number().int().min(0),
  netExpectedPointsGain: z.coerce.number(),
  budgetImpact: z.coerce.number(),
  bankAfterTransfers: MoneySchema,
  squadAfterTransfers: SquadSchema,
  startingXi: StartingXISchema,
  validation: ConstraintValidationResultSchema
}).strict();

export const RecommendationExplanationInputSchema = z.object({
  startingXi: StartingXISchema,
  transferRecommendations: z.array(TransferRecommendationSchema).default([]),
  predictionRunIds: z.array(PositiveIdSchema).default([]),
  targetGameweekId: PositiveIdSchema.optional()
}).strict();

export const ExplainRecommendationRequestSchema = z.object({
  optimizerResult: RecommendationExplanationInputSchema
}).strict();

const ExplanationTextArraySchema = z.array(z.string().trim().min(1)).max(12);

export const RecommendationExplanationCoreSchema = z.object({
  summary: z.string().trim().min(1),
  recommendedActions: ExplanationTextArraySchema,
  startingXiReasoning: ExplanationTextArraySchema,
  captaincyReasoning: ExplanationTextArraySchema,
  transferReasoning: ExplanationTextArraySchema,
  risks: ExplanationTextArraySchema,
  alternatives: ExplanationTextArraySchema,
  dataLimitations: ExplanationTextArraySchema,
  constraintSummary: ExplanationTextArraySchema,
  disclaimer: z.string().trim().min(1)
}).strict();

export const RecommendationExplanationSchema = RecommendationExplanationCoreSchema.extend({
  provider: z.enum(['deterministic_fallback', 'openai', 'azure_openai']),
  usedFallback: z.boolean(),
  fallbackReason: z.string().trim().min(1).optional()
}).strict();

export const RecommendationExplanationJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    recommendedActions: { type: 'array', items: { type: 'string' } },
    startingXiReasoning: { type: 'array', items: { type: 'string' } },
    captaincyReasoning: { type: 'array', items: { type: 'string' } },
    transferReasoning: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    alternatives: { type: 'array', items: { type: 'string' } },
    dataLimitations: { type: 'array', items: { type: 'string' } },
    constraintSummary: { type: 'array', items: { type: 'string' } },
    disclaimer: { type: 'string' }
  },
  required: [
    'summary',
    'recommendedActions',
    'startingXiReasoning',
    'captaincyReasoning',
    'transferReasoning',
    'risks',
    'alternatives',
    'dataLimitations',
    'constraintSummary',
    'disclaimer'
  ]
} as const;

export type RecommendationExplanationInput = z.infer<typeof RecommendationExplanationInputSchema>;
export type ExplainRecommendationRequest = z.infer<typeof ExplainRecommendationRequestSchema>;
export type RecommendationExplanationCore = z.infer<typeof RecommendationExplanationCoreSchema>;
export type RecommendationExplanation = z.infer<typeof RecommendationExplanationSchema>;
