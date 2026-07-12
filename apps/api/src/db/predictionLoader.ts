import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { TextDecoder } from 'node:util';
import { Pool } from 'pg';
import { Queryable, withTransaction } from './client';
import {
  JsonObject,
  ModelEvaluationRow,
  PlayerPredictionRow,
  PredictionLoadPlan,
  PredictionRunRow,
  MAX_PREDICTION_ROWS,
  buildMissingPredictionArtifactsMessage,
  buildPredictionLoadPlan
} from './predictionLoadPlan';

export const MAX_PREDICTION_FILE_BYTES = 16 * 1024 * 1024;
export const MAX_ARTIFACT_JSON_BYTES = 4 * 1024 * 1024;
export const MAX_PREDICTION_LINE_BYTES = 64 * 1024;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

export type PredictionArtifactPaths = {
  modelName: string;
  predictionFilePath: string;
  modelArtifactPath: string | null;
  evaluationFilePath: string | null;
};

export type PredictionLoadResult = {
  predictionRunId: number;
  runKey: string;
  targetGameweekId: number;
  predictionCount: number;
  evaluationId: number | null;
};

export async function loadPredictionArtifacts(
  pool: Pool,
  paths: PredictionArtifactPaths
): Promise<PredictionLoadResult> {
  const plan = await buildPredictionLoadPlanFromFiles(paths);
  return withTransaction(pool, client => loadPredictionLoadPlan(client, plan));
}

export async function buildPredictionLoadPlanFromFiles(
  paths: PredictionArtifactPaths
): Promise<PredictionLoadPlan> {
  if (!existsSync(paths.predictionFilePath)) {
    throw new Error(buildMissingPredictionArtifactsMessage(paths.predictionFilePath));
  }

  const predictionArtifact = await readJsonlArtifact(paths.predictionFilePath);
  const modelArtifact = await readOptionalJsonArtifact(paths.modelArtifactPath);
  const evaluationArtifact = await readOptionalJsonArtifact(paths.evaluationFilePath);

  return buildPredictionLoadPlan({
    modelName: paths.modelName,
    predictionFilePath: paths.predictionFilePath,
    predictionFileHash: predictionArtifact.hash,
    predictionRows: predictionArtifact.rows,
    modelArtifactPath: modelArtifact ? paths.modelArtifactPath : null,
    modelArtifactHash: modelArtifact?.hash ?? null,
    modelArtifact: modelArtifact?.value ?? null,
    evaluationFilePath: evaluationArtifact ? paths.evaluationFilePath : null,
    evaluationFileHash: evaluationArtifact?.hash ?? null,
    evaluationReport: evaluationArtifact?.value ?? null
  });
}

export async function loadPredictionLoadPlan(
  client: Queryable,
  plan: PredictionLoadPlan
): Promise<PredictionLoadResult> {
  const sourceRunId = await findSourceRunId(client, plan.predictionRun.sourceSnapshotHash);
  const predictionRunId = await upsertPredictionRun(client, plan.predictionRun, sourceRunId);

  for (const prediction of plan.playerPredictions) {
    await upsertPlayerPrediction(client, predictionRunId, prediction);
  }

  const loadedPredictionCount = await readLoadedPredictionCount(client, predictionRunId);
  if (loadedPredictionCount !== plan.playerPredictions.length) {
    throw new Error(
      `Loaded prediction counts do not match input: expected ${plan.playerPredictions.length}, received ${loadedPredictionCount}`
    );
  }

  const evaluationId = plan.modelEvaluation
    ? await upsertModelEvaluation(client, plan.modelEvaluation)
    : null;

  return {
    predictionRunId,
    runKey: plan.predictionRun.runKey,
    targetGameweekId: plan.predictionRun.targetGameweekId,
    predictionCount: loadedPredictionCount,
    evaluationId
  };
}

async function findSourceRunId(
  client: Queryable,
  sourceSnapshotHash: string | null
): Promise<number | null> {
  if (!sourceSnapshotHash) return null;

  const result = await client.query<{ id: string }>(
    'SELECT id FROM ingestion_runs WHERE snapshot_hash = $1 ORDER BY id DESC LIMIT 1',
    [sourceSnapshotHash]
  );
  const row = result.rows[0];
  return row ? Number(row.id) : null;
}

async function upsertPredictionRun(
  client: Queryable,
  run: PredictionRunRow,
  sourceRunId: number | null
): Promise<number> {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO prediction_runs (
        run_key,
        model_name,
        model_version,
        target_gameweek_id,
        prediction_file_path,
        prediction_file_hash,
        model_artifact_path,
        model_artifact_hash,
        feature_snapshot_hash,
        source_snapshot_hash,
        source_generated_at,
        source_run_id,
        prediction_count,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
      ON CONFLICT (run_key) DO UPDATE SET
        model_name = EXCLUDED.model_name,
        model_version = EXCLUDED.model_version,
        target_gameweek_id = EXCLUDED.target_gameweek_id,
        prediction_file_path = EXCLUDED.prediction_file_path,
        prediction_file_hash = EXCLUDED.prediction_file_hash,
        model_artifact_path = EXCLUDED.model_artifact_path,
        model_artifact_hash = EXCLUDED.model_artifact_hash,
        feature_snapshot_hash = EXCLUDED.feature_snapshot_hash,
        source_snapshot_hash = EXCLUDED.source_snapshot_hash,
        source_generated_at = EXCLUDED.source_generated_at,
        source_run_id = EXCLUDED.source_run_id,
        prediction_count = EXCLUDED.prediction_count,
        metadata = EXCLUDED.metadata,
        updated_at = now()
      RETURNING id
    `,
    [
      run.runKey,
      run.modelName,
      run.modelVersion,
      run.targetGameweekId,
      run.predictionFilePath,
      run.predictionFileHash,
      run.modelArtifactPath,
      run.modelArtifactHash,
      run.featureSnapshotHash,
      run.sourceSnapshotHash,
      run.sourceGeneratedAt,
      sourceRunId,
      run.predictionCount,
      JSON.stringify(run.metadata)
    ]
  );

  return Number(result.rows[0].id);
}

async function upsertPlayerPrediction(
  client: Queryable,
  predictionRunId: number,
  prediction: PlayerPredictionRow
): Promise<void> {
  await client.query(
    `
      INSERT INTO player_predictions (
        prediction_run_id,
        player_id,
        target_gameweek_id,
        fixture_id,
        predicted_points,
        baseline_predicted_points,
        confidence,
        uncertainty,
        source_snapshot_hash,
        feature_snapshot_hash,
        feature_values
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
      ON CONFLICT (prediction_run_id, player_id, target_gameweek_id, fixture_id) DO UPDATE SET
        predicted_points = EXCLUDED.predicted_points,
        baseline_predicted_points = EXCLUDED.baseline_predicted_points,
        confidence = EXCLUDED.confidence,
        uncertainty = EXCLUDED.uncertainty,
        source_snapshot_hash = EXCLUDED.source_snapshot_hash,
        feature_snapshot_hash = EXCLUDED.feature_snapshot_hash,
        feature_values = EXCLUDED.feature_values,
        updated_at = now()
    `,
    [
      predictionRunId,
      prediction.playerId,
      prediction.targetGameweekId,
      prediction.fixtureId,
      prediction.predictedPoints,
      prediction.baselinePredictedPoints,
      prediction.confidence,
      prediction.uncertainty,
      prediction.sourceSnapshotHash,
      prediction.featureSnapshotHash,
      JSON.stringify(prediction.featureValues)
    ]
  );
}

async function upsertModelEvaluation(
  client: Queryable,
  evaluation: ModelEvaluationRow
): Promise<number> {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO model_evaluations (
        evaluation_key,
        model_name,
        model_version,
        evaluation_type,
        evaluation_file_path,
        evaluation_file_hash,
        prediction_count,
        metrics,
        baseline_metrics,
        metrics_by_position,
        baseline_metrics_by_position,
        evaluated_gameweeks,
        skipped_gameweeks,
        metadata
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb,
        $12::jsonb, $13::jsonb, $14::jsonb
      )
      ON CONFLICT (evaluation_key) DO UPDATE SET
        model_name = EXCLUDED.model_name,
        model_version = EXCLUDED.model_version,
        evaluation_type = EXCLUDED.evaluation_type,
        evaluation_file_path = EXCLUDED.evaluation_file_path,
        evaluation_file_hash = EXCLUDED.evaluation_file_hash,
        prediction_count = EXCLUDED.prediction_count,
        metrics = EXCLUDED.metrics,
        baseline_metrics = EXCLUDED.baseline_metrics,
        metrics_by_position = EXCLUDED.metrics_by_position,
        baseline_metrics_by_position = EXCLUDED.baseline_metrics_by_position,
        evaluated_gameweeks = EXCLUDED.evaluated_gameweeks,
        skipped_gameweeks = EXCLUDED.skipped_gameweeks,
        metadata = EXCLUDED.metadata,
        updated_at = now()
      RETURNING id
    `,
    [
      evaluation.evaluationKey,
      evaluation.modelName,
      evaluation.modelVersion,
      evaluation.evaluationType,
      evaluation.evaluationFilePath,
      evaluation.evaluationFileHash,
      evaluation.predictionCount,
      JSON.stringify(evaluation.metrics),
      optionalJson(evaluation.baselineMetrics),
      optionalJson(evaluation.metricsByPosition),
      optionalJson(evaluation.baselineMetricsByPosition),
      JSON.stringify(evaluation.evaluatedGameweeks),
      JSON.stringify(evaluation.skippedGameweeks),
      JSON.stringify(evaluation.metadata)
    ]
  );

  return Number(result.rows[0].id);
}

async function readLoadedPredictionCount(
  client: Queryable,
  predictionRunId: number
): Promise<number> {
  const result = await client.query<{ count: string }>(
    'SELECT count(*) FROM player_predictions WHERE prediction_run_id = $1',
    [predictionRunId]
  );
  return Number(result.rows[0].count);
}

async function readJsonlArtifact(filePath: string): Promise<{ rows: JsonObject[]; hash: string }> {
  const buffer = await readBoundedFile(filePath, MAX_PREDICTION_FILE_BYTES);
  const text = decodeUtf8(buffer);
  const rows: JsonObject[] = [];

  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    if (Buffer.byteLength(line, 'utf8') > MAX_PREDICTION_LINE_BYTES) {
      throw new Error(`Prediction artifact line ${index + 1} exceeds the byte limit`);
    }
    if (rows.length >= MAX_PREDICTION_ROWS) {
      throw new Error(`Prediction artifact exceeds the ${MAX_PREDICTION_ROWS}-row limit`);
    }
    let value: unknown;
    try {
      value = JSON.parse(line) as unknown;
    } catch {
      throw new Error(`Prediction artifact line ${index + 1} contains malformed JSON`);
    }
    if (!isJsonObject(value)) {
      throw new Error(`Prediction artifact line ${index + 1} must contain a JSON object`);
    }
    rows.push(value);
  }

  return { rows, hash: hashBuffer(buffer) };
}

async function readOptionalJsonArtifact(
  filePath: string | null
): Promise<{ value: JsonObject; hash: string } | null> {
  if (!filePath || !existsSync(filePath)) return null;

  const buffer = await readBoundedFile(filePath, MAX_ARTIFACT_JSON_BYTES);
  let value: unknown;
  try {
    value = JSON.parse(decodeUtf8(buffer)) as unknown;
  } catch (error) {
    if (error instanceof Error && error.message.includes('byte limit')) throw error;
    throw new Error('Artifact JSON is malformed');
  }
  if (!isJsonObject(value)) {
    throw new Error('Artifact JSON must contain an object');
  }
  return { value, hash: hashBuffer(buffer) };
}

function hashBuffer(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function decodeUtf8(value: Buffer): string {
  try {
    return UTF8_DECODER.decode(value);
  } catch {
    throw new Error('Artifact contains malformed UTF-8');
  }
}

async function readBoundedFile(filePath: string, maximumBytes: number): Promise<Buffer> {
  const metadata = await stat(filePath);
  if (!metadata.isFile() || metadata.size > maximumBytes) {
    throw new Error('Artifact file exceeds the byte limit or is not a regular file');
  }
  const value = await readFile(filePath);
  if (value.byteLength > maximumBytes) throw new Error('Artifact file exceeds the byte limit');
  return value;
}

function optionalJson(value: JsonObject | null): string | null {
  return value === null ? null : JSON.stringify(value);
}

function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
