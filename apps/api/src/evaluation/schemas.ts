import { z } from 'zod';

const IsoDateTimeSchema = z.string().datetime();

export const EvaluationMetricComparisonSchema = z.object({
  metric: z.enum(['mae', 'rmse']),
  modelValue: z.number().nullable(),
  baselineValue: z.number().nullable(),
  differenceVsBaseline: z.number().nullable(),
  modelBeatsBaseline: z.boolean().nullable(),
  lowerIsBetter: z.literal(true)
});

export const EvaluationRunSummarySchema = z.object({
  id: z.number().int().positive(),
  evaluationKey: z.string().min(1),
  modelName: z.string().min(1),
  modelVersion: z.string().min(1),
  evaluationType: z.string().min(1),
  backtestRows: z.number().int().nonnegative().nullable(),
  predictionCount: z.number().int().nonnegative(),
  mae: EvaluationMetricComparisonSchema,
  rmse: EvaluationMetricComparisonSchema,
  evaluatedGameweeks: z.array(z.number().int().positive()),
  skippedGameweeks: z.array(z.number().int().positive()),
  evaluatedGameweekCount: z.number().int().nonnegative(),
  skippedGameweekCount: z.number().int().nonnegative(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  warnings: z.array(z.string())
});

export const EvaluationPredictionRunMetadataSchema = z.object({
  id: z.number().int().positive(),
  runKey: z.string().min(1),
  modelName: z.string().min(1),
  modelVersion: z.string().min(1),
  targetGameweekId: z.number().int().positive(),
  predictionCount: z.number().int().nonnegative(),
  sourceGeneratedAt: IsoDateTimeSchema.nullable(),
  sourceSnapshotHash: z.string().nullable(),
  featureSnapshotHash: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema
});

export const EvaluationLatestSchema = z.object({
  latestRun: EvaluationRunSummarySchema.nullable(),
  latestPredictionRun: EvaluationPredictionRunMetadataSchema.nullable(),
  requiredCommands: z.array(z.string().min(1)),
  limitations: z.array(z.string().min(1)),
  warnings: z.array(z.string())
});

export const EvaluationRunsSchema = z.object({
  runs: z.array(EvaluationRunSummarySchema),
  count: z.number().int().nonnegative(),
  warnings: z.array(z.string())
});

export const EvaluationDataCoverageCountsSchema = z.object({
  players: z.number().int().nonnegative(),
  teams: z.number().int().nonnegative(),
  gameweeks: z.number().int().nonnegative(),
  fixtures: z.number().int().nonnegative(),
  playerGameweekHistoryRows: z.number().int().nonnegative().nullable(),
  playerGameweekHistoryPlayers: z.number().int().nonnegative().nullable(),
  latestPredictionRows: z.number().int().nonnegative(),
  predictionRuns: z.number().int().nonnegative(),
  evaluationRuns: z.number().int().nonnegative()
});

export const PlayerGameweekHistoryArtifactSchema = z.object({
  path: z.string().min(1),
  generatedAt: IsoDateTimeSchema.nullable(),
  sourceName: z.string().nullable(),
  playerCount: z.number().int().nonnegative().nullable(),
  rowCount: z.number().int().nonnegative().nullable()
});

export const EvaluationDataHealthSchema = z.object({
  generatedAt: IsoDateTimeSchema,
  coverage: EvaluationDataCoverageCountsSchema,
  latestPredictionRun: EvaluationPredictionRunMetadataSchema.nullable(),
  playerGameweekHistory: PlayerGameweekHistoryArtifactSchema.nullable(),
  requiredCommands: z.array(z.string().min(1)),
  warnings: z.array(z.string())
});

export const EvaluationLatestApiResponseSchema = z.object({
  success: z.literal(true),
  data: EvaluationLatestSchema
});

export const EvaluationRunsApiResponseSchema = z.object({
  success: z.literal(true),
  data: EvaluationRunsSchema,
  count: z.number().int().nonnegative()
});

export const EvaluationDataHealthApiResponseSchema = z.object({
  success: z.literal(true),
  data: EvaluationDataHealthSchema
});
