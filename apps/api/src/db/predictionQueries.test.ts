import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import { PlayerPrediction, PredictionSummary } from '../types';
import {
  filterSortLimitPredictions,
  toModelEvaluation,
  toPlayerPrediction,
  toPredictionRun
} from './predictionQueries';

const PredictionSummaryResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    run: z.object({
      id: z.number(),
      modelName: z.string(),
      modelVersion: z.string(),
      targetGameweekId: z.number(),
      predictionCount: z.number()
    }),
    predictions: z.array(z.object({
      playerId: z.number(),
      playerName: z.string(),
      position: z.enum(['GK', 'DEF', 'MID', 'FWD']),
      predictedPoints: z.number(),
      baselinePredictedPoints: z.number().nullable()
    })),
    count: z.number()
  }),
  count: z.number()
});

describe('prediction query mapping', () => {
  it('maps prediction run rows into API-safe JSON fields', () => {
    const run = toPredictionRun({
      id: '42',
      run_key: 'run-key',
      model_name: 'expected_points',
      model_version: 'expected-points-rule-baseline-v1',
      target_gameweek_id: 4,
      prediction_file_hash: 'prediction-hash',
      model_artifact_hash: 'model-hash',
      feature_snapshot_hash: null,
      source_snapshot_hash: 'snapshot-a',
      source_generated_at: new Date('2026-08-14T17:55:00.000Z'),
      source_run_id: '7',
      prediction_count: 2,
      metadata: { featureColumns: ['price'] },
      created_at: new Date('2026-08-14T18:00:00.000Z'),
      updated_at: new Date('2026-08-14T18:05:00.000Z')
    });

    assert.equal(run.id, 42);
    assert.equal(run.sourceRunId, 7);
    assert.equal(run.sourceGeneratedAt, '2026-08-14T17:55:00.000Z');
    assert.deepEqual(run.metadata, { featureColumns: ['price'] });
  });

  it('maps player prediction rows into the public response schema', () => {
    const prediction = toPlayerPrediction({
      id: '5',
      prediction_run_id: '42',
      player_id: 1,
      player_name: 'Alpha Forward',
      position: 'FWD',
      team_id: 1,
      team_name: 'Arsenal',
      team_short_name: 'ARS',
      target_gameweek_id: 4,
      fixture_id: 101,
      predicted_points: 6.25,
      baseline_predicted_points: 5.5,
      confidence: null,
      uncertainty: null,
      source_snapshot_hash: 'snapshot-a',
      feature_snapshot_hash: null,
      feature_values: { fixture_difficulty: 2 },
      created_at: new Date('2026-08-14T18:00:00.000Z'),
      updated_at: new Date('2026-08-14T18:05:00.000Z')
    });

    assert.equal(prediction.id, 5);
    assert.equal(prediction.predictionRunId, 42);
    assert.equal(prediction.predictedPoints, 6.25);
    assert.deepEqual(prediction.featureValues, { fixture_difficulty: 2 });
  });

  it('sorts, filters, and limits top predictions deterministically', () => {
    const input = [
      predictionFixture('Charlie', 'MID', 7.1, 103),
      predictionFixture('Alpha', 'FWD', 8.2, 101),
      predictionFixture('Beta', 'FWD', 8.2, 102),
      predictionFixture('Delta', 'FWD', 6.5, 104)
    ];

    const result = filterSortLimitPredictions(input, {
      position: 'FWD',
      limit: 2
    });

    assert.deepEqual(result.map(prediction => prediction.playerName), ['Alpha', 'Beta']);
    assert.deepEqual(input.map(prediction => prediction.playerName), ['Charlie', 'Alpha', 'Beta', 'Delta']);
  });

  it('maps model evaluation rows into typed API output', () => {
    const evaluation = toModelEvaluation({
      id: '8',
      evaluation_key: 'evaluation-key',
      model_name: 'expected_points',
      model_version: 'expected-points-rule-baseline-v1',
      evaluation_type: 'walk_forward_backtest',
      prediction_count: 24,
      metrics: { mae: 1.2 },
      baseline_metrics: { mae: 1.4 },
      metrics_by_position: { FWD: { mae: 1.0 } },
      baseline_metrics_by_position: {},
      evaluated_gameweeks: [2, 3, 4],
      skipped_gameweeks: [1],
      metadata: { rowCount: 24 },
      created_at: new Date('2026-08-14T18:00:00.000Z'),
      updated_at: new Date('2026-08-14T18:05:00.000Z')
    });

    assert.equal(evaluation.id, 8);
    assert.deepEqual(evaluation.evaluatedGameweeks, [2, 3, 4]);
    assert.deepEqual(evaluation.metrics, { mae: 1.2 });
  });

  it('keeps latest prediction responses consumable by API clients', () => {
    const summary: PredictionSummary = {
      run: toPredictionRun({
        id: '42',
        run_key: 'run-key',
        model_name: 'expected_points',
        model_version: 'expected-points-rule-baseline-v1',
        target_gameweek_id: 4,
        prediction_file_hash: 'prediction-hash',
        model_artifact_hash: null,
        feature_snapshot_hash: null,
        source_snapshot_hash: 'snapshot-a',
        source_generated_at: null,
        source_run_id: null,
        prediction_count: 1,
        metadata: {},
        created_at: new Date('2026-08-14T18:00:00.000Z'),
        updated_at: new Date('2026-08-14T18:05:00.000Z')
      }),
      predictions: [predictionFixture('Alpha', 'FWD', 8.2, 101)],
      count: 1
    };
    const response = {
      success: true,
      data: summary,
      count: summary.count
    };

    assert.doesNotThrow(() => PredictionSummaryResponseSchema.parse(response));
  });
});

function predictionFixture(
  playerName: string,
  position: PlayerPrediction['position'],
  predictedPoints: number,
  fixtureId: number
): PlayerPrediction {
  return {
    id: fixtureId,
    predictionRunId: 42,
    playerId: fixtureId,
    playerName,
    position,
    teamId: 1,
    teamName: 'Arsenal',
    teamShortName: 'ARS',
    targetGameweekId: 4,
    fixtureId,
    predictedPoints,
    baselinePredictedPoints: 5.5,
    confidence: null,
    uncertainty: null,
    sourceSnapshotHash: 'snapshot-a',
    featureSnapshotHash: null,
    featureValues: {},
    createdAt: '2026-08-14T18:00:00.000Z',
    updatedAt: '2026-08-14T18:05:00.000Z'
  };
}
