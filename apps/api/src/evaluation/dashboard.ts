import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  EvaluationDataCoverageCounts,
  EvaluationDataHealth,
  EvaluationLatest,
  EvaluationMetricComparison,
  EvaluationMetricName,
  EvaluationPredictionRunMetadata,
  EvaluationRunSummary,
  EvaluationRuns,
  ModelEvaluation,
  PlayerGameweekHistoryArtifact,
  PredictionRun
} from '../types';

export const EVALUATION_SETUP_COMMANDS = [
  'pnpm.cmd run ingest:fpl',
  'pnpm.cmd run db:migrate',
  'pnpm.cmd run db:load:fpl',
  'pnpm.cmd run ingest:fpl:history',
  'pnpm.cmd run pipeline:features',
  'pnpm.cmd run model:train',
  'pnpm.cmd run model:backtest',
  'pnpm.cmd run model:predict',
  'pnpm.cmd run db:load:predictions'
] as const;

export const MAX_PLAYER_HISTORY_ARTIFACT_BYTES = 32 * 1024 * 1024;

const LIMITATIONS = [
  'Model quality is evaluated against a recent-points baseline.',
  'The current model should not be treated as clearly better unless it beats the baseline on both MAE and RMSE.',
  'Optimizer recommendations use deterministic constraints and loaded prediction rows.',
  'Predictions are decision support estimates, not certainty.'
] as const;

export type HistoryArtifactReadResult = {
  artifact: PlayerGameweekHistoryArtifact | null;
  warnings: string[];
};

export function buildEvaluationLatest(input: {
  evaluation: ModelEvaluation | null;
  latestPredictionRun: PredictionRun | null;
}): EvaluationLatest {
  const latestRun = input.evaluation ? toEvaluationRunSummary(input.evaluation) : null;
  const warnings: string[] = [];

  if (!latestRun) {
    warnings.push('No model evaluation data is loaded. Run the backtest and load predictions into PostgreSQL.');
  }

  if (!input.latestPredictionRun) {
    warnings.push('No prediction run is loaded. Generate predictions and load them into PostgreSQL.');
  }

  if (latestRun && !(latestRun.mae.modelBeatsBaseline === true && latestRun.rmse.modelBeatsBaseline === true)) {
    warnings.push('The current model is not clearly better than the baseline across MAE and RMSE.');
  }

  return {
    latestRun,
    latestPredictionRun: toPredictionRunMetadata(input.latestPredictionRun),
    requiredCommands: [...EVALUATION_SETUP_COMMANDS],
    limitations: [...LIMITATIONS],
    warnings: [...warnings, ...(latestRun?.warnings ?? [])]
  };
}

export function buildEvaluationRuns(evaluations: ModelEvaluation[]): EvaluationRuns {
  const runs = evaluations
    .map(toEvaluationRunSummary)
    .sort((left, right) => {
      const createdAtComparison = Date.parse(right.createdAt) - Date.parse(left.createdAt);
      if (createdAtComparison !== 0) return createdAtComparison;
      return right.id - left.id;
    });

  return {
    runs,
    count: runs.length,
    warnings: runs.length === 0
      ? ['No model evaluation runs are loaded. Run the backtest and load predictions into PostgreSQL.']
      : []
  };
}

export function buildEvaluationDataHealth(input: {
  coverage: Omit<
    EvaluationDataCoverageCounts,
    'playerGameweekHistoryRows' | 'playerGameweekHistoryPlayers'
  >;
  latestPredictionRun: PredictionRun | null;
  historyArtifact: HistoryArtifactReadResult;
  now?: Date;
}): EvaluationDataHealth {
  const coverage: EvaluationDataCoverageCounts = {
    ...input.coverage,
    playerGameweekHistoryRows: input.historyArtifact.artifact?.rowCount ?? null,
    playerGameweekHistoryPlayers: input.historyArtifact.artifact?.playerCount ?? null
  };
  const warnings = [...input.historyArtifact.warnings];

  if (coverage.players === 0 || coverage.teams === 0 || coverage.gameweeks === 0 || coverage.fixtures === 0) {
    warnings.push('Normalized FPL data is missing from PostgreSQL. Run database migration and FPL load commands.');
  }

  if (coverage.latestPredictionRows === 0) {
    warnings.push('No latest prediction rows are loaded. Generate predictions and load them into PostgreSQL.');
  }

  if (coverage.evaluationRuns === 0) {
    warnings.push('No model evaluation rows are loaded. Run the backtest and load predictions into PostgreSQL.');
  }

  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    coverage,
    latestPredictionRun: toPredictionRunMetadata(input.latestPredictionRun),
    playerGameweekHistory: input.historyArtifact.artifact,
    requiredCommands: [...EVALUATION_SETUP_COMMANDS],
    warnings
  };
}

export async function readPlayerGameweekHistoryArtifact(
  filePath: string
): Promise<HistoryArtifactReadResult> {
  try {
    const fileStats = await stat(filePath);
    if (!fileStats.isFile() || fileStats.size > MAX_PLAYER_HISTORY_ARTIFACT_BYTES) {
      return {
        artifact: null,
        warnings: ['Player-gameweek history artifact is invalid or exceeds the supported size.']
      };
    }

    const contents = await readFile(filePath);
    if (contents.byteLength > MAX_PLAYER_HISTORY_ARTIFACT_BYTES) {
      return {
        artifact: null,
        warnings: ['Player-gameweek history artifact is invalid or exceeds the supported size.']
      };
    }

    const value = JSON.parse(contents.toString('utf8')) as unknown;
    if (!isRecord(value)) {
      return {
        artifact: null,
        warnings: ['Player-gameweek history artifact is not a JSON object.']
      };
    }

    const source = isRecord(value.source) ? value.source : {};
    return {
      artifact: {
        path: path.basename(filePath),
        generatedAt: readOptionalString(value.generatedAt),
        sourceName: readOptionalString(source.name),
        playerCount: readOptionalNumber(value.playerCount),
        rowCount: readOptionalNumber(value.rowCount)
      },
      warnings: []
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return {
        artifact: null,
        warnings: ['Player-gameweek history artifact is missing.']
      };
    }

    return {
      artifact: null,
      warnings: ['Player-gameweek history artifact could not be read.']
    };
  }
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export function toEvaluationRunSummary(evaluation: ModelEvaluation): EvaluationRunSummary {
  const mae = metricComparison('mae', evaluation.metrics, evaluation.baselineMetrics);
  const rmse = metricComparison('rmse', evaluation.metrics, evaluation.baselineMetrics);
  const warnings = buildMetricWarnings(mae, rmse);

  return {
    id: evaluation.id,
    evaluationKey: evaluation.evaluationKey,
    modelName: evaluation.modelName,
    modelVersion: evaluation.modelVersion,
    evaluationType: evaluation.evaluationType,
    backtestRows: readMetric(evaluation.metrics, 'count') ?? evaluation.predictionCount,
    predictionCount: evaluation.predictionCount,
    mae,
    rmse,
    evaluatedGameweeks: evaluation.evaluatedGameweeks,
    skippedGameweeks: evaluation.skippedGameweeks,
    evaluatedGameweekCount: evaluation.evaluatedGameweeks.length,
    skippedGameweekCount: evaluation.skippedGameweeks.length,
    createdAt: evaluation.createdAt,
    updatedAt: evaluation.updatedAt,
    warnings
  };
}

function metricComparison(
  metric: EvaluationMetricName,
  metrics: Record<string, unknown>,
  baselineMetrics: Record<string, unknown> | null
): EvaluationMetricComparison {
  const modelValue = readMetric(metrics, metric);
  const baselineValue = baselineMetrics ? readMetric(baselineMetrics, metric) : null;
  const differenceVsBaseline =
    modelValue === null || baselineValue === null
      ? null
      : roundMetric(modelValue - baselineValue);

  return {
    metric,
    modelValue,
    baselineValue,
    differenceVsBaseline,
    modelBeatsBaseline: differenceVsBaseline === null ? null : differenceVsBaseline < 0,
    lowerIsBetter: true
  };
}

function buildMetricWarnings(
  mae: EvaluationMetricComparison,
  rmse: EvaluationMetricComparison
): string[] {
  const warnings: string[] = [];

  if (mae.modelValue === null) warnings.push('Evaluation metrics are missing MAE.');
  if (rmse.modelValue === null) warnings.push('Evaluation metrics are missing RMSE.');
  if (mae.baselineValue === null) warnings.push('Baseline metrics are missing MAE.');
  if (rmse.baselineValue === null) warnings.push('Baseline metrics are missing RMSE.');
  if (mae.modelBeatsBaseline === false) {
    warnings.push('Model MAE is higher than the baseline MAE. Lower is better.');
  }
  if (rmse.modelBeatsBaseline === false) {
    warnings.push('Model RMSE is higher than the baseline RMSE. Lower is better.');
  }

  return warnings;
}

function toPredictionRunMetadata(
  run: PredictionRun | null
): EvaluationPredictionRunMetadata | null {
  if (!run) return null;

  return {
    id: run.id,
    runKey: run.runKey,
    modelName: run.modelName,
    modelVersion: run.modelVersion,
    targetGameweekId: run.targetGameweekId,
    predictionCount: run.predictionCount,
    sourceGeneratedAt: run.sourceGeneratedAt,
    sourceSnapshotHash: run.sourceSnapshotHash,
    featureSnapshotHash: run.featureSnapshotHash,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt
  };
}

function readMetric(record: Record<string, unknown>, key: string): number | null {
  return readOptionalNumber(record[key]);
}

function readOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function roundMetric(value: number): number {
  return Number(value.toFixed(4));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
