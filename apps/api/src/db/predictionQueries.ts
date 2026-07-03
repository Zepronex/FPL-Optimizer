import { Queryable } from './client';
import {
  ModelEvaluation,
  PlayerPrediction,
  Pos,
  PredictionRun,
  PredictionSummary
} from '../types';

export type TopPredictionFilters = {
  gameweekId?: number;
  position?: Pos;
  limit: number;
};

type PredictionRunDbRow = {
  id: string;
  run_key: string;
  model_name: string;
  model_version: string;
  target_gameweek_id: number;
  prediction_file_hash: string;
  model_artifact_hash: string | null;
  feature_snapshot_hash: string | null;
  source_snapshot_hash: string | null;
  source_generated_at: Date | string | null;
  source_run_id: string | null;
  prediction_count: number;
  metadata: unknown;
  created_at: Date | string;
  updated_at: Date | string;
};

type PlayerPredictionDbRow = {
  id: string;
  prediction_run_id: string;
  player_id: number;
  player_name: string;
  position: Pos;
  team_id: number;
  team_name: string;
  team_short_name: string;
  target_gameweek_id: number;
  fixture_id: number | null;
  predicted_points: number;
  baseline_predicted_points: number | null;
  confidence: number | null;
  uncertainty: number | null;
  source_snapshot_hash: string | null;
  feature_snapshot_hash: string | null;
  feature_values: unknown;
  created_at: Date | string;
  updated_at: Date | string;
};

type ModelEvaluationDbRow = {
  id: string;
  evaluation_key: string;
  model_name: string;
  model_version: string;
  evaluation_type: string;
  prediction_count: number;
  metrics: unknown;
  baseline_metrics: unknown;
  metrics_by_position: unknown;
  baseline_metrics_by_position: unknown;
  evaluated_gameweeks: unknown;
  skipped_gameweeks: unknown;
  metadata: unknown;
  created_at: Date | string;
  updated_at: Date | string;
};

export async function readLatestPredictionSummary(
  client: Queryable
): Promise<PredictionSummary | null> {
  const run = await readLatestPredictionRun(client);
  if (!run) return null;

  const predictions = await readPredictionsForRun(client, run.id, { limit: run.predictionCount });
  return {
    run,
    predictions,
    count: predictions.length
  };
}

export async function readPlayerPredictions(
  client: Queryable,
  playerId: number
): Promise<PlayerPrediction[]> {
  const result = await client.query<PlayerPredictionDbRow>(
    `
      ${predictionSelectSql()}
      WHERE pp.player_id = $1
      ORDER BY pr.created_at DESC, pr.id DESC, pp.target_gameweek_id DESC, pp.predicted_points DESC
    `,
    [playerId]
  );
  return result.rows.map(toPlayerPrediction);
}

export async function readGameweekPredictionSummary(
  client: Queryable,
  gameweekId: number
): Promise<PredictionSummary | null> {
  const run = await readLatestPredictionRunForGameweek(client, gameweekId);
  if (!run) return null;

  const predictions = await readPredictionsForRun(client, run.id, { limit: run.predictionCount });
  return {
    run,
    predictions,
    count: predictions.length
  };
}

export async function readTopPredictions(
  client: Queryable,
  filters: TopPredictionFilters
): Promise<PredictionSummary | null> {
  const run = filters.gameweekId
    ? await readLatestPredictionRunForGameweek(client, filters.gameweekId)
    : await readLatestPredictionRun(client);
  if (!run) return null;

  const predictions = await readPredictionsForRun(client, run.id, {
    position: filters.position,
    limit: filters.limit
  });
  return {
    run,
    predictions,
    count: predictions.length
  };
}

export async function readLatestModelEvaluation(
  client: Queryable
): Promise<ModelEvaluation | null> {
  const result = await client.query<ModelEvaluationDbRow>(
    `
      SELECT
        id,
        evaluation_key,
        model_name,
        model_version,
        evaluation_type,
        prediction_count,
        metrics,
        baseline_metrics,
        metrics_by_position,
        baseline_metrics_by_position,
        evaluated_gameweeks,
        skipped_gameweeks,
        metadata,
        created_at,
        updated_at
      FROM model_evaluations
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `
  );

  const row = result.rows[0];
  return row ? toModelEvaluation(row) : null;
}

async function readLatestPredictionRun(client: Queryable): Promise<PredictionRun | null> {
  const result = await client.query<PredictionRunDbRow>(
    `
      ${predictionRunSelectSql()}
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `
  );

  const row = result.rows[0];
  return row ? toPredictionRun(row) : null;
}

async function readLatestPredictionRunForGameweek(
  client: Queryable,
  gameweekId: number
): Promise<PredictionRun | null> {
  const result = await client.query<PredictionRunDbRow>(
    `
      ${predictionRunSelectSql()}
      WHERE target_gameweek_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [gameweekId]
  );

  const row = result.rows[0];
  return row ? toPredictionRun(row) : null;
}

async function readPredictionsForRun(
  client: Queryable,
  predictionRunId: number,
  options: { position?: Pos; limit: number }
): Promise<PlayerPrediction[]> {
  const values: Array<number | string> = [predictionRunId];
  const conditions = ['pp.prediction_run_id = $1'];

  if (options.position) {
    values.push(options.position);
    conditions.push(`p.position = $${values.length}`);
  }

  values.push(options.limit);
  const result = await client.query<PlayerPredictionDbRow>(
    `
      ${predictionSelectSql()}
      WHERE ${conditions.join(' AND ')}
      ORDER BY pp.predicted_points DESC, p.display_name ASC, pp.fixture_id ASC
      LIMIT $${values.length}
    `,
    values
  );

  return result.rows.map(toPlayerPrediction);
}

function predictionRunSelectSql(): string {
  return `
    SELECT
      id,
      run_key,
      model_name,
      model_version,
      target_gameweek_id,
      prediction_file_hash,
      model_artifact_hash,
      feature_snapshot_hash,
      source_snapshot_hash,
      source_generated_at,
      source_run_id,
      prediction_count,
      metadata,
      created_at,
      updated_at
    FROM prediction_runs
  `;
}

function predictionSelectSql(): string {
  return `
    SELECT
      pp.id,
      pp.prediction_run_id,
      pp.player_id,
      p.display_name AS player_name,
      p.position,
      p.team_id,
      t.name AS team_name,
      t.short_name AS team_short_name,
      pp.target_gameweek_id,
      pp.fixture_id,
      pp.predicted_points::float8 AS predicted_points,
      pp.baseline_predicted_points::float8 AS baseline_predicted_points,
      pp.confidence::float8 AS confidence,
      pp.uncertainty::float8 AS uncertainty,
      pp.source_snapshot_hash,
      pp.feature_snapshot_hash,
      pp.feature_values,
      pp.created_at,
      pp.updated_at
    FROM player_predictions pp
    JOIN prediction_runs pr ON pr.id = pp.prediction_run_id
    JOIN players p ON p.id = pp.player_id
    JOIN teams t ON t.id = p.team_id
  `;
}

export function toPredictionRun(row: PredictionRunDbRow): PredictionRun {
  return {
    id: Number(row.id),
    runKey: row.run_key,
    modelName: row.model_name,
    modelVersion: row.model_version,
    targetGameweekId: row.target_gameweek_id,
    predictionFileHash: row.prediction_file_hash,
    modelArtifactHash: row.model_artifact_hash,
    featureSnapshotHash: row.feature_snapshot_hash,
    sourceSnapshotHash: row.source_snapshot_hash,
    sourceGeneratedAt: toNullableIsoString(row.source_generated_at),
    sourceRunId: row.source_run_id === null ? null : Number(row.source_run_id),
    predictionCount: row.prediction_count,
    metadata: toJsonObject(row.metadata),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  };
}

export function toPlayerPrediction(row: PlayerPredictionDbRow): PlayerPrediction {
  return {
    id: Number(row.id),
    predictionRunId: Number(row.prediction_run_id),
    playerId: row.player_id,
    playerName: row.player_name,
    position: row.position,
    teamId: row.team_id,
    teamName: row.team_name,
    teamShortName: row.team_short_name,
    targetGameweekId: row.target_gameweek_id,
    fixtureId: row.fixture_id,
    predictedPoints: row.predicted_points,
    baselinePredictedPoints: row.baseline_predicted_points,
    confidence: row.confidence,
    uncertainty: row.uncertainty,
    sourceSnapshotHash: row.source_snapshot_hash,
    featureSnapshotHash: row.feature_snapshot_hash,
    featureValues: toJsonObject(row.feature_values),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  };
}

export function toModelEvaluation(row: ModelEvaluationDbRow): ModelEvaluation {
  return {
    id: Number(row.id),
    evaluationKey: row.evaluation_key,
    modelName: row.model_name,
    modelVersion: row.model_version,
    evaluationType: row.evaluation_type,
    predictionCount: row.prediction_count,
    metrics: toJsonObject(row.metrics),
    baselineMetrics: toNullableJsonObject(row.baseline_metrics),
    metricsByPosition: toNullableJsonObject(row.metrics_by_position),
    baselineMetricsByPosition: toNullableJsonObject(row.baseline_metrics_by_position),
    evaluatedGameweeks: toNumberArray(row.evaluated_gameweeks),
    skippedGameweeks: toNumberArray(row.skipped_gameweeks),
    metadata: toJsonObject(row.metadata),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toNullableIsoString(value: Date | string | null): string | null {
  return value === null ? null : toIsoString(value);
}

function toJsonObject(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toNullableJsonObject(value: unknown): Record<string, unknown> | null {
  if (value === null) return null;
  return toJsonObject(value);
}

function toNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => Number(item)).filter(item => Number.isFinite(item));
}
