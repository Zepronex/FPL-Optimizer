import { z } from 'zod';

const MAX_DATABASE_ID = 2_147_483_647;
const MAX_GAMEWEEK_ID = 38;
const MAX_PLAYER_NAME_LENGTH = 100;
const MAX_TEAM_NAME_LENGTH = 100;
const MAX_TEAM_SHORT_NAME_LENGTH = 10;
const MAX_CONSTRAINT_ENTRIES = 32;
const MAX_EXPLANATION_TEXT_LENGTH = 2_000;

const PositionSchema = z.enum(['GK', 'DEF', 'MID', 'FWD']);
const AvailabilitySchema = z.enum(['available', 'doubtful', 'unavailable', 'unknown']);
const PositiveIdSchema = z.number().finite().int().min(1).max(MAX_DATABASE_ID);
const GameweekIdSchema = z.number().finite().int().min(1).max(MAX_GAMEWEEK_ID);
const MoneySchema = z.number().finite().min(0).max(200);
const BudgetSchema = z.number().finite().min(1).max(200);
const PlayerPriceSchema = z.number().finite().positive().max(25);
const PredictedPointsSchema = z.number().finite().min(0).max(100);
const SignedMetricSchema = z.number().finite().min(-1_000).max(1_000);
const ConstraintKeySchema = z.string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
const ConstraintRecordSchema = z.record(ConstraintKeySchema, SignedMetricSchema)
  .superRefine((record, context) => {
    if (Object.keys(record).length > MAX_CONSTRAINT_ENTRIES) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Constraint records may contain at most ${MAX_CONSTRAINT_ENTRIES} entries`
      });
    }

    for (const unsafeKey of ['__proto__', 'prototype', 'constructor']) {
      if (Object.prototype.hasOwnProperty.call(record, unsafeKey)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [unsafeKey],
          message: 'Unsafe object key is not allowed'
        });
      }
    }
  });
const ConstraintValueSchema = z.union([
  SignedMetricSchema,
  z.string().trim().min(1).max(256),
  ConstraintRecordSchema
]);
const OptimizerDisplayScoreSchema = z.object({
  rawExpectedPoints: PredictedPointsSchema.nullable(),
  contextualScoreOutOf10: z.number().finite().min(0).max(10).nullable(),
  positionPercentile: z.number().finite().min(0).max(100).nullable(),
  positionPoolSize: z.number().finite().int().min(0).max(2_000)
}).strict();

export const PlayerCandidateSchema = z.object({
  playerId: PositiveIdSchema,
  playerName: z.string().trim().min(1).max(MAX_PLAYER_NAME_LENGTH),
  position: PositionSchema,
  teamId: PositiveIdSchema,
  teamName: z.string().trim().min(1).max(MAX_TEAM_NAME_LENGTH).optional(),
  teamShortName: z.string().trim().min(1).max(MAX_TEAM_SHORT_NAME_LENGTH).optional(),
  price: PlayerPriceSchema,
  predictedPoints: PredictedPointsSchema,
  predictionRunId: PositiveIdSchema.optional(),
  targetGameweekId: GameweekIdSchema.optional(),
  fixtureId: PositiveIdSchema.nullable().optional(),
  availability: AvailabilitySchema.optional(),
  displayScore: OptimizerDisplayScoreSchema.optional()
}).strict();

export const SquadSlotSchema = PlayerCandidateSchema.extend({
  slotIndex: z.number().finite().int().min(0).max(14)
}).strict();

export const SquadSchema = z.object({
  slots: z.array(SquadSlotSchema).length(15),
  budget: BudgetSchema,
  bank: MoneySchema
}).strict().superRefine((squad, context) => {
  addUniqueNumberIssue(
    squad.slots.map(player => player.playerId),
    context,
    ['slots'],
    'Squad player IDs must be unique'
  );
  addUniqueNumberIssue(
    squad.slots.map(player => player.slotIndex),
    context,
    ['slots'],
    'Squad slot indexes must be unique'
  );
  if (squad.bank > squad.budget) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['bank'],
      message: 'Bank cannot exceed budget'
    });
  }
});

export const ConstraintCheckSchema = z.object({
  key: ConstraintKeySchema,
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
  key: ConstraintKeySchema,
  expected: ConstraintValueSchema,
  actual: ConstraintValueSchema,
  playerIds: z.array(PositiveIdSchema).max(15).superRefine((ids, context) => {
    addUniqueNumberIssue(ids, context, [], 'Violation player IDs must be unique');
  }).optional(),
  teamId: PositiveIdSchema.optional()
}).strict();

export const ConstraintValidationResultSchema = z.object({
  valid: z.boolean(),
  checks: z.array(ConstraintCheckSchema).max(MAX_CONSTRAINT_ENTRIES),
  violations: z.array(ConstraintViolationSchema).max(16)
}).strict().superRefine((result, context) => {
  addUniqueStringIssue(
    result.checks.map(check => check.key),
    context,
    ['checks'],
    'Constraint check keys must be unique'
  );
  if (result.valid !== (result.violations.length === 0)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['valid'],
      message: 'Constraint validity must agree with the violations list'
    });
  }
});

export const CaptaincyRecommendationSchema = z.object({
  captain: SquadSlotSchema,
  viceCaptain: SquadSlotSchema,
  captainPredictedPoints: PredictedPointsSchema,
  viceCaptainPredictedPoints: PredictedPointsSchema
}).strict();

export const StartingXISchema = z.object({
  formation: z.enum(['3-4-3', '3-5-2', '4-4-2', '4-3-3', '4-5-1', '5-2-3', '5-3-2', '5-4-1']),
  starters: z.array(SquadSlotSchema).length(11),
  bench: z.array(SquadSlotSchema).length(4),
  captaincy: CaptaincyRecommendationSchema,
  totalPredictedPoints: z.number().finite().min(0).max(500),
  rawExpectedPoints: z.number().finite().min(0).max(500).optional(),
  averagePlayerScoreOutOf10: z.number().finite().min(0).max(10).nullable().optional(),
  normalizedTeamScoreOutOf100: z.number().finite().min(0).max(100).nullable().optional(),
  constraintSummary: ConstraintValidationResultSchema
}).strict().superRefine((startingXi, context) => {
  const players = [...startingXi.starters, ...startingXi.bench];
  addUniqueNumberIssue(
    players.map(player => player.playerId),
    context,
    ['starters'],
    'Starting XI and bench player IDs must be unique'
  );
  addUniqueNumberIssue(
    players.map(player => player.slotIndex),
    context,
    ['starters'],
    'Starting XI and bench slot indexes must be unique'
  );

  const starterIds = new Set(startingXi.starters.map(player => player.playerId));
  const captainId = startingXi.captaincy.captain.playerId;
  const viceCaptainId = startingXi.captaincy.viceCaptain.playerId;
  if (!starterIds.has(captainId) || !starterIds.has(viceCaptainId) || captainId === viceCaptainId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['captaincy'],
      message: 'Captain and vice-captain must be distinct starting players'
    });
  }
});

export const TransferMoveSchema = z.object({
  playerOut: SquadSlotSchema,
  playerIn: PlayerCandidateSchema,
  predictedPointsDelta: SignedMetricSchema,
  costDelta: z.number().finite().min(-200).max(200)
}).strict();

export const TransferRecommendationSchema = z.object({
  transferCount: z.union([z.literal(1), z.literal(2)]),
  moves: z.array(TransferMoveSchema).min(1).max(2),
  expectedPointsGain: SignedMetricSchema,
  pointsHit: z.number().finite().int().min(0).max(60),
  netExpectedPointsGain: SignedMetricSchema,
  budgetImpact: z.number().finite().min(-200).max(200),
  bankAfterTransfers: MoneySchema,
  squadAfterTransfers: SquadSchema,
  startingXi: StartingXISchema,
  validation: ConstraintValidationResultSchema
}).strict().superRefine((recommendation, context) => {
  if (recommendation.moves.length !== recommendation.transferCount) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['moves'],
      message: 'Transfer move count must match transferCount'
    });
  }
  addUniqueNumberIssue(
    recommendation.moves.map(move => move.playerOut.playerId),
    context,
    ['moves'],
    'Outgoing player IDs must be unique'
  );
  addUniqueNumberIssue(
    recommendation.moves.map(move => move.playerIn.playerId),
    context,
    ['moves'],
    'Incoming player IDs must be unique'
  );
});

export const RecommendationExplanationInputSchema = z.object({
  startingXi: StartingXISchema,
  transferRecommendations: z.array(TransferRecommendationSchema).max(2).default([]),
  predictionRunIds: z.array(PositiveIdSchema).max(10).default([]),
  targetGameweekId: GameweekIdSchema.optional()
}).strict().superRefine((input, context) => {
  addUniqueNumberIssue(
    input.predictionRunIds,
    context,
    ['predictionRunIds'],
    'Prediction run IDs must be unique'
  );
  addUniqueStringIssue(
    input.transferRecommendations.map(recommendation => recommendation.moves
      .map(move => `${move.playerOut.playerId}:${move.playerIn.playerId}`)
      .join('|')),
    context,
    ['transferRecommendations'],
    'Transfer recommendations must be unique'
  );
});

export const ExplainRecommendationRequestSchema = z.object({
  optimizerResult: RecommendationExplanationInputSchema
}).strict();

const ExplanationTextSchema = z.string().trim().min(1).max(MAX_EXPLANATION_TEXT_LENGTH);
const ExplanationTextArraySchema = z.array(ExplanationTextSchema).max(12);

export const RecommendationExplanationCoreSchema = z.object({
  summary: ExplanationTextSchema,
  recommendedActions: ExplanationTextArraySchema,
  startingXiReasoning: ExplanationTextArraySchema,
  captaincyReasoning: ExplanationTextArraySchema,
  transferReasoning: ExplanationTextArraySchema,
  risks: ExplanationTextArraySchema,
  alternatives: ExplanationTextArraySchema,
  dataLimitations: ExplanationTextArraySchema,
  constraintSummary: ExplanationTextArraySchema,
  disclaimer: ExplanationTextSchema
}).strict();

export const AgentExplanationModeSchema = z.enum(['deterministic_fallback', 'live_provider']);
export const AgentFallbackReasonCodeSchema = z.enum([
  'agent_disabled',
  'missing_openai_config',
  'missing_azure_openai_config',
  'missing_provider_config',
  'provider_error',
  'schema_validation_failed',
  'hallucination_guard_failed'
]);

export const AgentExplanationStatusSchema = z.object({
  mode: AgentExplanationModeSchema,
  provider: z.enum(['deterministic_fallback', 'openai', 'azure_openai']),
  providerConfigured: z.boolean(),
  fallbackReasonCode: AgentFallbackReasonCodeSchema.optional(),
  message: z.string().trim().min(1).max(500)
}).strict();

export const RecommendationExplanationSchema = RecommendationExplanationCoreSchema.extend({
  provider: z.enum(['deterministic_fallback', 'openai', 'azure_openai']),
  usedFallback: z.boolean(),
  fallbackReason: z.string().trim().min(1).max(500).optional(),
  agentStatus: AgentExplanationStatusSchema
}).strict();

function addUniqueNumberIssue(
  values: readonly number[],
  context: z.RefinementCtx,
  path: Array<string | number>,
  message: string
): void {
  if (new Set(values).size === values.length) return;
  context.addIssue({
    code: z.ZodIssueCode.custom,
    path,
    message
  });
}

function addUniqueStringIssue(
  values: readonly string[],
  context: z.RefinementCtx,
  path: Array<string | number>,
  message: string
): void {
  if (new Set(values).size === values.length) return;
  context.addIssue({
    code: z.ZodIssueCode.custom,
    path,
    message
  });
}

export const RecommendationExplanationJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string', minLength: 1, maxLength: MAX_EXPLANATION_TEXT_LENGTH },
    recommendedActions: explanationTextArrayJsonSchema(),
    startingXiReasoning: explanationTextArrayJsonSchema(),
    captaincyReasoning: explanationTextArrayJsonSchema(),
    transferReasoning: explanationTextArrayJsonSchema(),
    risks: explanationTextArrayJsonSchema(),
    alternatives: explanationTextArrayJsonSchema(),
    dataLimitations: explanationTextArrayJsonSchema(),
    constraintSummary: explanationTextArrayJsonSchema(),
    disclaimer: { type: 'string', minLength: 1, maxLength: MAX_EXPLANATION_TEXT_LENGTH }
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

function explanationTextArrayJsonSchema() {
  return {
    type: 'array',
    maxItems: 12,
    items: {
      type: 'string',
      minLength: 1,
      maxLength: MAX_EXPLANATION_TEXT_LENGTH
    }
  } as const;
}

export type RecommendationExplanationInput = z.infer<typeof RecommendationExplanationInputSchema>;
export type ExplainRecommendationRequest = z.infer<typeof ExplainRecommendationRequestSchema>;
export type RecommendationExplanationCore = z.infer<typeof RecommendationExplanationCoreSchema>;
export type AgentFallbackReasonCode = z.infer<typeof AgentFallbackReasonCodeSchema>;
export type RecommendationExplanation = z.infer<typeof RecommendationExplanationSchema>;
