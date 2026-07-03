import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { Queryable, withTransaction } from './client';
import {
  JsonObject,
  ModelEvaluationRow,
  PlayerPredictionRow,
  PredictionLoadPlan,
  PredictionRunRow,
  buildMissingPredictionArtifactsMessage,
  buildPredictionLoadPlan
} from './predictionLoadPlan';

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

  const predictionRows = await readJsonl(paths.predictionFilePath);
  const predictionFileHash = await hashFile(paths.predictionFilePath);
  const modelArtifact = await readOptionalJson(paths.modelArtifactPath);
  const modelArtifactHash = paths.modelArtifactPath && existsSync(paths.modelArtifactPath)
    ? await hashFile(paths.modelArtifactPath)
    : null;
  const evaluationReport = await readOptionalJson(paths.evaluationFilePath);
  const evaluationFileHash = paths.evaluationFilePath && existsSync(paths.evaluationFilePath)
    ? await hashFile(paths.evaluationFilePath)
    : null;

  return buildPredictionLoadPlan({
    modelName: paths.modelName,
    predictionFilePath: paths.predictionFilePath,
    predictionFileHash,
    predictionRows,
    modelArtifactPath: modelArtifact ? paths.modelArtifactPath : null,
    modelArtifactHash,
    modelArtifact,
    evaluationFilePath: evaluationReport ? paths.evaluationFilePath : null,
    evaluationFileHash,
    evaluationReport
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

async function readJsonl(filePath: string): Promise<JsonObject[]> {
  const text = await readFile(filePath, 'utf8');
  const rows: JsonObject[] = [];

  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const value = JSON.parse(line) as unknown;
    if (!isJsonObject(value)) {
      throw new Error(`${filePath}:${index + 1} must contain a JSON object`);
    }
    rows.push(value);
  }

  return rows;
}

async function readOptionalJson(filePath: string | null): Promise<JsonObject | null> {
  if (!filePath || !existsSync(filePath)) return null;

  const value = JSON.parse(await readFile(filePath, 'utf8')) as unknown;
  if (!isJsonObject(value)) {
    throw new Error(`${filePath} must contain a JSON object`);
  }
  return value;
}

async function hashFile(filePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

function optionalJson(value: JsonObject | null): string | null {
  return value === null ? null : JSON.stringify(value);
}

function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
