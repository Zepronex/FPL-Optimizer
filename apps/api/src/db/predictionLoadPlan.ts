import { createHash } from 'node:crypto';
import { z } from 'zod';

export type JsonObject = Record<string, unknown>;

export type PredictionRunRow = {
  runKey: string;
  modelName: string;
  modelVersion: string;
  targetGameweekId: number;
  predictionFilePath: string;
  predictionFileHash: string;
  modelArtifactPath: string | null;
  modelArtifactHash: string | null;
  featureSnapshotHash: string | null;
  sourceSnapshotHash: string | null;
  sourceGeneratedAt: string | null;
  predictionCount: number;
  metadata: JsonObject;
};

export type PlayerPredictionRow = {
  playerId: number;
  targetGameweekId: number;
  fixtureId: number;
  predictedPoints: number;
  baselinePredictedPoints: number | null;
  confidence: number | null;
  uncertainty: number | null;
  sourceSnapshotHash: string | null;
  featureSnapshotHash: string | null;
  featureValues: JsonObject;
};

export type ModelEvaluationRow = {
  evaluationKey: string;
  modelName: string;
  modelVersion: string;
  evaluationType: string;
  evaluationFilePath: string;
  evaluationFileHash: string;
  predictionCount: number;
  metrics: JsonObject;
  baselineMetrics: JsonObject | null;
  metricsByPosition: JsonObject | null;
  baselineMetricsByPosition: JsonObject | null;
  evaluatedGameweeks: number[];
  skippedGameweeks: number[];
  metadata: JsonObject;
};

export type PredictionLoadPlan = {
  predictionRun: PredictionRunRow;
  playerPredictions: PlayerPredictionRow[];
  modelEvaluation: ModelEvaluationRow | null;
};

export type PredictionArtifactInput = {
  modelName: string;
  predictionFilePath: string;
  predictionFileHash: string;
  predictionRows: JsonObject[];
  modelArtifactPath: string | null;
  modelArtifactHash: string | null;
  modelArtifact: JsonObject | null;
  evaluationFilePath: string | null;
  evaluationFileHash: string | null;
  evaluationReport: JsonObject | null;
};

const PositionSchema = z.enum(['GK', 'DEF', 'MID', 'FWD']);
const MAX_POSTGRES_INTEGER = 2_147_483_647;
const MAX_GAMEWEEK = 38;
export const MAX_PREDICTION_ROWS = 5_000;
const MAX_PREDICTION_FIELDS = 100;
const DatabaseIdSchema = z.number().finite().int().min(1).max(MAX_POSTGRES_INTEGER);
const GameweekSchema = z.number().finite().int().min(1).max(MAX_GAMEWEEK);
const HashSchema = z.string().regex(/^[a-f0-9]{64}$/i);
const FeatureColumnSchema = boundedString(100);
const FeatureColumnsSchema = z.array(FeatureColumnSchema).max(64).refine(
  values => new Set(values).size === values.length,
  'Feature columns must be unique'
);
const MetricNumberSchema = z.number().finite().min(-1_000_000).max(1_000_000);
const MetricSummarySchema = z.object({
  count: z.number().finite().int().min(0).max(1_000_000),
  mae: z.number().finite().min(0).max(100).optional(),
  rmse: z.number().finite().min(0).max(100).optional(),
  mean_error: z.number().finite().min(-100).max(100).optional()
}).catchall(MetricNumberSchema);
const MetricsByPositionSchema = z.record(PositionSchema, MetricSummarySchema);
const FeatureValueSchema = z.union([
  z.number().finite().min(-1_000_000).max(1_000_000),
  z.string().max(1_000).refine(value => !/[\r\n\0]/.test(value), 'Unsafe feature string'),
  z.boolean(),
  z.null()
]);

const PredictionArtifactRowSchema = z.object({
  player_id: DatabaseIdSchema,
  player_name: boundedString(100),
  position: PositionSchema,
  team_id: DatabaseIdSchema,
  team_name: boundedString(100),
  price: z.number().finite().min(0).max(100),
  fixture_id: DatabaseIdSchema,
  opponent_team_id: DatabaseIdSchema,
  opponent_team: boundedString(100),
  fixture_difficulty: z.number().finite().int().min(1).max(5),
  home_away: z.enum(['H', 'A']),
  upcoming_gameweek_id: GameweekSchema,
  expected_points: z.number().finite().min(0).max(100),
  baseline_expected_points: z.number().finite().min(0).max(100).optional().nullable(),
  confidence: z.number().finite().min(0).max(1).optional().nullable(),
  uncertainty: z.number().finite().min(0).max(100).optional().nullable(),
  model_version: boundedString(200),
  source_snapshot_hash: HashSchema.optional().nullable(),
  source_generated_at: z.string().datetime({ offset: true }).optional().nullable(),
  feature_snapshot_hash: HashSchema.optional().nullable(),
  feature_columns: FeatureColumnsSchema.optional()
}).catchall(FeatureValueSchema).superRefine((value, context) => {
  const keys = Object.keys(value);
  if (keys.length > MAX_PREDICTION_FIELDS) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Prediction rows may contain at most ${MAX_PREDICTION_FIELDS} fields`
    });
  }
  if (keys.some(key => key.length > 100 || ['__proto__', 'prototype', 'constructor'].includes(key))) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Prediction row contains an unsafe field name'
    });
  }
});

type PredictionArtifactRow = z.infer<typeof PredictionArtifactRowSchema>;

const ModelArtifactSchema = z.object({
  model_version: boundedString(200).optional(),
  training_row_count: z.number().finite().int().min(0).max(1_000_000).optional(),
  trained_from_gameweek: GameweekSchema.optional().nullable(),
  trained_through_gameweek: GameweekSchema.optional().nullable(),
  feature_columns: FeatureColumnsSchema.optional()
}).passthrough();

const EvaluationReportSchema = z.object({
  metrics: MetricSummarySchema,
  baseline_metrics: MetricSummarySchema.optional().nullable(),
  metrics_by_position: MetricsByPositionSchema.optional().nullable(),
  baseline_metrics_by_position: MetricsByPositionSchema.optional().nullable(),
  evaluated_gameweeks: uniqueGameweeksSchema(),
  skipped_gameweeks: uniqueGameweeksSchema(),
  prediction_count: z.number().finite().int().min(0).max(1_000_000)
}).passthrough();

export const PREDICTION_ARTIFACT_COMMANDS = [
  'pnpm.cmd run ingest:fpl:history',
  'pnpm.cmd run pipeline:features',
  'pnpm.cmd run model:train',
  'pnpm.cmd run model:backtest',
  'pnpm.cmd run model:predict'
] as const;

export function buildMissingPredictionArtifactsMessage(predictionFilePath: string): string {
  return [
    `Missing prediction output file: ${predictionFilePath}`,
    'Run these commands first:',
    ...PREDICTION_ARTIFACT_COMMANDS.map(command => `  ${command}`)
  ].join('\n');
}

export function buildPredictionLoadPlan(input: PredictionArtifactInput): PredictionLoadPlan {
  if (input.predictionRows.length === 0) {
    throw new Error(`Prediction output file is empty: ${input.predictionFilePath}`);
  }
  if (input.predictionRows.length > MAX_PREDICTION_ROWS) {
    throw new Error(`Prediction output exceeds the ${MAX_PREDICTION_ROWS}-row limit`);
  }
  validateArtifactInput(input);

  const predictionRows = parsePredictionRows(input.predictionRows);
  const modelArtifact = parseModelArtifact(input.modelArtifact, input.modelArtifactPath);
  const modelVersion = resolveModelVersion(predictionRows, modelArtifact);
  const targetGameweekId = requireSingleNumber(
    predictionRows.map(row => row.upcoming_gameweek_id),
    'upcoming_gameweek_id'
  );
  const sourceSnapshotHash = requireSingleOptionalString(
    predictionRows.map(row => row.source_snapshot_hash ?? null),
    'source_snapshot_hash'
  );
  const sourceGeneratedAt = requireSingleOptionalString(
    predictionRows.map(row => row.source_generated_at ?? null),
    'source_generated_at'
  );
  const featureSnapshotHash = requireSingleOptionalString(
    predictionRows.map(row => row.feature_snapshot_hash ?? null),
    'feature_snapshot_hash'
  );
  const featureColumns = resolveFeatureColumns(predictionRows, modelArtifact);
  const runKey = sha256(stableStringify({
    modelName: input.modelName,
    modelVersion,
    targetGameweekId,
    predictionFileHash: input.predictionFileHash,
    modelArtifactHash: input.modelArtifactHash,
    sourceSnapshotHash
  }));

  return {
    predictionRun: {
      runKey,
      modelName: input.modelName,
      modelVersion,
      targetGameweekId,
      predictionFilePath: input.predictionFilePath,
      predictionFileHash: input.predictionFileHash,
      modelArtifactPath: input.modelArtifactPath,
      modelArtifactHash: input.modelArtifactHash,
      featureSnapshotHash,
      sourceSnapshotHash,
      sourceGeneratedAt,
      predictionCount: predictionRows.length,
      metadata: {
        featureColumns,
        modelArtifact: modelArtifactMetadata(modelArtifact),
        rowCount: predictionRows.length
      }
    },
    playerPredictions: predictionRows.map(row => toPlayerPredictionRow(row)),
    modelEvaluation: buildModelEvaluationRow({
      modelName: input.modelName,
      modelVersion,
      evaluationFilePath: input.evaluationFilePath,
      evaluationFileHash: input.evaluationFileHash,
      evaluationReport: input.evaluationReport
    })
  };
}

function parsePredictionRows(rows: JsonObject[]): PredictionArtifactRow[] {
  const parsed = rows.map((row, index) => {
    const result = PredictionArtifactRowSchema.safeParse(row);
    if (!result.success) {
      throw new Error(`Prediction row ${index + 1} is invalid: ${result.error.message}`);
    }
    return result.data;
  });
  const keys = parsed.map(row => `${row.player_id}:${row.upcoming_gameweek_id}:${row.fixture_id}`);
  if (new Set(keys).size !== keys.length) {
    throw new Error('Prediction output contains duplicate player/gameweek/fixture rows');
  }
  return parsed;
}

function parseModelArtifact(
  value: JsonObject | null,
  filePath: string | null
): z.infer<typeof ModelArtifactSchema> | null {
  if (value === null) return null;

  const result = ModelArtifactSchema.safeParse(value);
  if (!result.success) {
    throw new Error(`Model artifact is invalid at ${filePath ?? 'unknown path'}: ${result.error.message}`);
  }
  return result.data;
}

function resolveModelVersion(
  predictionRows: PredictionArtifactRow[],
  modelArtifact: z.infer<typeof ModelArtifactSchema> | null
): string {
  const predictionModelVersion = requireSingleString(
    predictionRows.map(row => row.model_version),
    'model_version'
  );

  if (modelArtifact?.model_version && modelArtifact.model_version !== predictionModelVersion) {
    throw new Error(
      `Model artifact version ${modelArtifact.model_version} does not match prediction output version ${predictionModelVersion}`
    );
  }

  return predictionModelVersion;
}

function resolveFeatureColumns(
  predictionRows: PredictionArtifactRow[],
  modelArtifact: z.infer<typeof ModelArtifactSchema> | null
): string[] {
  const rowColumns = requireSingleOptionalStringArray(
    predictionRows.map(row => row.feature_columns),
    'feature_columns'
  );
  const modelColumns = modelArtifact?.feature_columns;
  if (modelColumns && rowColumns && !arraysEqual(modelColumns, rowColumns)) {
    throw new Error('Model artifact feature columns do not match prediction rows');
  }
  return [...(modelColumns ?? rowColumns ?? [])];
}

function toPlayerPredictionRow(row: PredictionArtifactRow): PlayerPredictionRow {
  const sourceSnapshotHash = row.source_snapshot_hash ?? null;
  const featureSnapshotHash = row.feature_snapshot_hash ?? null;

  return {
    playerId: row.player_id,
    targetGameweekId: row.upcoming_gameweek_id,
    fixtureId: row.fixture_id,
    predictedPoints: row.expected_points,
    baselinePredictedPoints: row.baseline_expected_points ?? null,
    confidence: row.confidence ?? null,
    uncertainty: row.uncertainty ?? null,
    sourceSnapshotHash,
    featureSnapshotHash,
    featureValues: toFeatureValues(row)
  };
}

function toFeatureValues(row: PredictionArtifactRow): JsonObject {
  const excluded = new Set([
    'expected_points',
    'baseline_expected_points',
    'confidence',
    'uncertainty',
    'model_version',
    'feature_columns'
  ]);
  const entries = Object.entries(row)
    .filter(([key]) => !excluded.has(key))
    .sort(([left], [right]) => left.localeCompare(right));
  return Object.fromEntries(entries);
}

function buildModelEvaluationRow(input: {
  modelName: string;
  modelVersion: string;
  evaluationFilePath: string | null;
  evaluationFileHash: string | null;
  evaluationReport: JsonObject | null;
}): ModelEvaluationRow | null {
  if (!input.evaluationReport || !input.evaluationFilePath || !input.evaluationFileHash) {
    return null;
  }

  const result = EvaluationReportSchema.safeParse(input.evaluationReport);
  if (!result.success) {
    throw new Error(`Evaluation report is invalid at ${input.evaluationFilePath}: ${result.error.message}`);
  }

  const report = result.data;
  const evaluationType = 'walk_forward_backtest';
  const evaluationKey = sha256(stableStringify({
    modelName: input.modelName,
    modelVersion: input.modelVersion,
    evaluationType,
    evaluationFileHash: input.evaluationFileHash
  }));

  return {
    evaluationKey,
    modelName: input.modelName,
    modelVersion: input.modelVersion,
    evaluationType,
    evaluationFilePath: input.evaluationFilePath,
    evaluationFileHash: input.evaluationFileHash,
    predictionCount: report.prediction_count,
    metrics: report.metrics,
    baselineMetrics: report.baseline_metrics ?? null,
    metricsByPosition: report.metrics_by_position ?? null,
    baselineMetricsByPosition: report.baseline_metrics_by_position ?? null,
    evaluatedGameweeks: report.evaluated_gameweeks ?? [],
    skippedGameweeks: report.skipped_gameweeks ?? [],
    metadata: {
      rowCount: report.prediction_count
    }
  };
}

function modelArtifactMetadata(
  modelArtifact: z.infer<typeof ModelArtifactSchema> | null
): JsonObject | null {
  if (!modelArtifact) return null;
  return {
    trainingRowCount: modelArtifact.training_row_count ?? null,
    trainedFromGameweek: modelArtifact.trained_from_gameweek ?? null,
    trainedThroughGameweek: modelArtifact.trained_through_gameweek ?? null
  };
}

function requireSingleNumber(values: number[], fieldName: string): number {
  const uniqueValues = [...new Set(values)];
  if (uniqueValues.length !== 1) {
    throw new Error(`Prediction output must contain exactly one ${fieldName}; received ${uniqueValues.join(', ')}`);
  }
  return uniqueValues[0];
}

function requireSingleString(values: string[], fieldName: string): string {
  const uniqueValues = [...new Set(values)];
  if (uniqueValues.length !== 1) {
    throw new Error(`Prediction output must contain exactly one ${fieldName}; received ${uniqueValues.join(', ')}`);
  }
  return uniqueValues[0];
}

function requireSingleOptionalString(
  values: Array<string | null>,
  fieldName: string
): string | null {
  const uniqueValues = [...new Set(values)];
  if (uniqueValues.length !== 1) {
    throw new Error(`Prediction output rows must contain the same ${fieldName}, including null`);
  }
  return uniqueValues[0];
}

function requireSingleOptionalStringArray(
  values: Array<string[] | undefined>,
  fieldName: string
): string[] | undefined {
  const serialized = values.map(value => value === undefined ? null : JSON.stringify(value));
  if (new Set(serialized).size !== 1) {
    throw new Error(`Prediction output rows must contain the same ${fieldName}`);
  }
  return values[0];
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validateArtifactInput(input: PredictionArtifactInput): void {
  const metadataResult = z.object({
    modelName: boundedString(100),
    predictionFilePath: boundedString(4_096),
    predictionFileHash: HashSchema,
    modelArtifactPath: boundedString(4_096).nullable(),
    modelArtifactHash: HashSchema.nullable(),
    evaluationFilePath: boundedString(4_096).nullable(),
    evaluationFileHash: HashSchema.nullable()
  }).strict().safeParse({
    modelName: input.modelName,
    predictionFilePath: input.predictionFilePath,
    predictionFileHash: input.predictionFileHash,
    modelArtifactPath: input.modelArtifactPath,
    modelArtifactHash: input.modelArtifactHash,
    evaluationFilePath: input.evaluationFilePath,
    evaluationFileHash: input.evaluationFileHash
  });
  if (!metadataResult.success) throw new Error('Prediction artifact metadata is invalid');

  const hasModelArtifact = input.modelArtifact !== null;
  if (
    hasModelArtifact !== (input.modelArtifactPath !== null) ||
    hasModelArtifact !== (input.modelArtifactHash !== null)
  ) {
    throw new Error('Model artifact content, path, and hash must be supplied together');
  }

  const hasEvaluation = input.evaluationReport !== null;
  if (
    hasEvaluation !== (input.evaluationFilePath !== null) ||
    hasEvaluation !== (input.evaluationFileHash !== null)
  ) {
    throw new Error('Evaluation content, path, and hash must be supplied together');
  }
}

function boundedString(maximumLength: number): z.ZodEffects<z.ZodString, string, string> {
  return z.string().min(1).max(maximumLength).refine(
    value => value === value.trim() && !/[\r\n\0]/.test(value),
    'String contains surrounding whitespace or control characters'
  );
}

function uniqueGameweeksSchema() {
  return z.array(GameweekSchema).max(MAX_GAMEWEEK).refine(
    values => new Set(values).size === values.length,
    'Gameweeks must be unique'
  ).optional();
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right));

  return `{${entries
    .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableStringify(nestedValue)}`)
    .join(',')}}`;
}
