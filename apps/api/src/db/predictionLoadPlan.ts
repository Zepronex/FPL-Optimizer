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

const PredictionArtifactRowSchema = z.object({
  player_id: z.coerce.number().int().positive(),
  player_name: z.string().min(1),
  position: PositionSchema,
  team_id: z.coerce.number().int().positive(),
  team_name: z.string().min(1),
  price: z.coerce.number().nonnegative(),
  fixture_id: z.coerce.number().int().positive(),
  opponent_team_id: z.coerce.number().int().positive(),
  opponent_team: z.string().min(1),
  fixture_difficulty: z.coerce.number().int().min(1).max(5),
  home_away: z.enum(['H', 'A']),
  upcoming_gameweek_id: z.coerce.number().int().positive(),
  expected_points: z.coerce.number().nonnegative(),
  baseline_expected_points: z.coerce.number().nonnegative().optional().nullable(),
  confidence: z.coerce.number().min(0).max(1).optional().nullable(),
  uncertainty: z.coerce.number().nonnegative().optional().nullable(),
  model_version: z.string().min(1),
  source_snapshot_hash: z.string().min(1).optional().nullable(),
  source_generated_at: z.string().min(1).optional().nullable(),
  feature_snapshot_hash: z.string().min(1).optional().nullable(),
  feature_columns: z.array(z.string()).optional()
}).passthrough();

type PredictionArtifactRow = z.infer<typeof PredictionArtifactRowSchema>;

const ModelArtifactSchema = z.object({
  model_version: z.string().min(1).optional(),
  training_row_count: z.coerce.number().int().nonnegative().optional(),
  trained_from_gameweek: z.coerce.number().int().positive().optional().nullable(),
  trained_through_gameweek: z.coerce.number().int().positive().optional().nullable(),
  feature_columns: z.array(z.string()).optional()
}).passthrough();

const EvaluationReportSchema = z.object({
  metrics: z.record(z.unknown()),
  baseline_metrics: z.record(z.unknown()).optional().nullable(),
  metrics_by_position: z.record(z.unknown()).optional().nullable(),
  baseline_metrics_by_position: z.record(z.unknown()).optional().nullable(),
  evaluated_gameweeks: z.array(z.coerce.number().int().positive()).optional(),
  skipped_gameweeks: z.array(z.coerce.number().int().positive()).optional(),
  prediction_count: z.coerce.number().int().nonnegative()
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
  return rows.map((row, index) => {
    const result = PredictionArtifactRowSchema.safeParse(row);
    if (!result.success) {
      throw new Error(`Prediction row ${index + 1} is invalid: ${result.error.message}`);
    }
    return result.data;
  });
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
  if (modelArtifact?.feature_columns) {
    return modelArtifact.feature_columns;
  }

  const firstRowColumns = predictionRows[0].feature_columns;
  return firstRowColumns ? [...firstRowColumns] : [];
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
  const uniqueValues = [...new Set(values.filter((value): value is string => Boolean(value)))];
  if (uniqueValues.length > 1) {
    throw new Error(`Prediction output must contain at most one ${fieldName}; received ${uniqueValues.join(', ')}`);
  }
  return uniqueValues[0] ?? null;
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
