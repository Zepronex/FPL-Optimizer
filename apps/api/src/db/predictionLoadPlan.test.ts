import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  JsonObject,
  buildMissingPredictionArtifactsMessage,
  buildPredictionLoadPlan
} from './predictionLoadPlan';

describe('prediction load plan', () => {
  it('maps Day 5 prediction artifacts into deterministic serving rows', () => {
    const plan = buildPredictionLoadPlan(inputFixture());

    assert.equal(plan.predictionRun.modelName, 'expected_points');
    assert.equal(plan.predictionRun.modelVersion, 'expected-points-rule-baseline-v1');
    assert.equal(plan.predictionRun.targetGameweekId, 4);
    assert.equal(plan.predictionRun.predictionCount, 2);
    assert.equal(plan.predictionRun.runKey.length, 64);
    assert.equal(plan.predictionRun.sourceSnapshotHash, 'snapshot-a');
    assert.equal(plan.playerPredictions[0].playerId, 1);
    assert.equal(plan.playerPredictions[0].predictedPoints, 6.25);
    assert.equal(plan.playerPredictions[0].baselinePredictedPoints, 5.5);
    assert.equal(plan.playerPredictions[0].featureValues.expected_points, undefined);
    assert.equal(plan.modelEvaluation?.predictionCount, 8);
    assert.deepEqual(plan.modelEvaluation?.evaluatedGameweeks, [2, 3, 4]);
  });

  it('keeps the same run key for equivalent prediction files', () => {
    const firstPlan = buildPredictionLoadPlan(inputFixture());
    const secondPlan = buildPredictionLoadPlan({
      ...inputFixture(),
      predictionRows: [...inputFixture().predictionRows].reverse()
    });

    assert.equal(firstPlan.predictionRun.runKey, secondPlan.predictionRun.runKey);
  });

  it('rejects invalid prediction rows before database writes', () => {
    const { expected_points: _expectedPoints, ...invalidRow } = predictionRowFixture(1, 6.25);

    assert.throws(
      () => buildPredictionLoadPlan({
        ...inputFixture(),
        predictionRows: [invalidRow]
      }),
      /Prediction row 1 is invalid/
    );
  });

  it('prints the required setup commands when prediction output is missing', () => {
    const message = buildMissingPredictionArtifactsMessage('data/predictions/missing.jsonl');

    assert.match(message, /pnpm\.cmd run ingest:fpl:history/);
    assert.match(message, /pnpm\.cmd run pipeline:features/);
    assert.match(message, /pnpm\.cmd run model:train/);
    assert.match(message, /pnpm\.cmd run model:backtest/);
    assert.match(message, /pnpm\.cmd run model:predict/);
  });
});

function inputFixture(): Parameters<typeof buildPredictionLoadPlan>[0] {
  return {
    modelName: 'expected_points',
    predictionFilePath: 'data/predictions/expected_points_latest.jsonl',
    predictionFileHash: 'prediction-file-hash',
    predictionRows: [
      predictionRowFixture(1, 6.25),
      predictionRowFixture(2, 5.75)
    ],
    modelArtifactPath: 'data/models/expected_points_baseline.json',
    modelArtifactHash: 'model-file-hash',
    modelArtifact: {
      model_version: 'expected-points-rule-baseline-v1',
      training_row_count: 24,
      trained_from_gameweek: 1,
      trained_through_gameweek: 3,
      feature_columns: ['price', 'position', 'fixture_difficulty']
    },
    evaluationFilePath: 'data/evaluation/expected_points_backtest.json',
    evaluationFileHash: 'evaluation-file-hash',
    evaluationReport: {
      metrics: {
        count: 8,
        mae: 1.2,
        rmse: 1.5
      },
      baseline_metrics: {
        count: 8,
        mae: 1.4,
        rmse: 1.8
      },
      metrics_by_position: {
        FWD: {
          count: 2,
          mae: 1.0
        }
      },
      baseline_metrics_by_position: {},
      evaluated_gameweeks: [2, 3, 4],
      skipped_gameweeks: [1],
      prediction_count: 8
    }
  };
}

function predictionRowFixture(playerId: number, expectedPoints: number): JsonObject {
  return {
    player_id: playerId,
    player_name: `Player ${playerId}`,
    position: playerId === 1 ? 'FWD' : 'MID',
    team_id: 1,
    team_name: 'Arsenal',
    price: 9.5,
    fixture_id: 100 + playerId,
    opponent_team_id: 20,
    opponent_team: 'Wolves',
    fixture_difficulty: 2,
    home_away: 'H',
    upcoming_gameweek_id: 4,
    expected_points: expectedPoints,
    baseline_expected_points: 5.5,
    model_version: 'expected-points-rule-baseline-v1',
    source_snapshot_hash: 'snapshot-a',
    source_generated_at: '2026-08-14T17:55:00.000Z',
    feature_columns: ['price', 'position', 'fixture_difficulty']
  };
}
