import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  JsonObject,
  buildMissingPredictionArtifactsMessage,
  buildPredictionLoadPlan
} from './predictionLoadPlan';
import {
  MAX_PREDICTION_FILE_BYTES,
  MAX_PREDICTION_LINE_BYTES,
  buildPredictionLoadPlanFromFiles
} from './predictionLoader';

describe('prediction load plan', () => {
  it('maps Day 5 prediction artifacts into deterministic serving rows', () => {
    const plan = buildPredictionLoadPlan(inputFixture());

    assert.equal(plan.predictionRun.modelName, 'expected_points');
    assert.equal(plan.predictionRun.modelVersion, 'expected-points-rule-baseline-v1');
    assert.equal(plan.predictionRun.targetGameweekId, 4);
    assert.equal(plan.predictionRun.predictionCount, 2);
    assert.equal(plan.predictionRun.runKey.length, 64);
    assert.equal(plan.predictionRun.sourceSnapshotHash, 'a'.repeat(64));
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

  it('rejects boolean, numeric-string, non-finite, and out-of-range prediction fields', () => {
    const invalidValues: Array<[string, unknown]> = [
      ['player_id', '1'],
      ['team_id', true],
      ['price', Number.POSITIVE_INFINITY],
      ['fixture_id', 2_147_483_648],
      ['upcoming_gameweek_id', 39],
      ['expected_points', '6.25'],
      ['confidence', Number.NaN]
    ];

    for (const [field, value] of invalidValues) {
      assert.throws(
        () => buildPredictionLoadPlan({
          ...inputFixture(),
          predictionRows: [{ ...predictionRowFixture(1, 6.25), [field]: value }]
        }),
        /Prediction row 1 is invalid/,
        field
      );
    }
  });

  it('bounds prediction rows, feature fields, artifact numbers, and gameweek arrays', () => {
    assert.throws(
      () => buildPredictionLoadPlan({
        ...inputFixture(),
        predictionRows: Array.from({ length: 5_001 }, () => predictionRowFixture(1, 6.25))
      }),
      /5000-row limit/
    );

    assert.throws(
      () => buildPredictionLoadPlan({
        ...inputFixture(),
        predictionRows: [{
          ...predictionRowFixture(1, 6.25),
          feature_columns: Array.from({ length: 65 }, (_, index) => `feature_${index}`)
        }]
      }),
      /Prediction row 1 is invalid/
    );

    assert.throws(
      () => buildPredictionLoadPlan({
        ...inputFixture(),
        modelArtifact: { ...inputFixture().modelArtifact, training_row_count: true }
      }),
      /Model artifact is invalid/
    );

    assert.throws(
      () => buildPredictionLoadPlan({
        ...inputFixture(),
        evaluationReport: {
          ...inputFixture().evaluationReport,
          prediction_count: '8',
          evaluated_gameweeks: [2, 2]
        }
      }),
      /Evaluation report is invalid/
    );
  });

  it('requires complete cross-row lineage and identical feature-column contracts', () => {
    for (const field of ['source_snapshot_hash', 'source_generated_at'] as const) {
      const secondRow = predictionRowFixture(2, 5.75);
      secondRow[field] = null;
      assert.throws(
        () => buildPredictionLoadPlan({
          ...inputFixture(),
          predictionRows: [predictionRowFixture(1, 6.25), secondRow]
        }),
        new RegExp(field)
      );
    }

    const firstWithFeatureHash = {
      ...predictionRowFixture(1, 6.25),
      feature_snapshot_hash: 'b'.repeat(64)
    };
    assert.throws(
      () => buildPredictionLoadPlan({
        ...inputFixture(),
        predictionRows: [firstWithFeatureHash, predictionRowFixture(2, 5.75)]
      }),
      /feature_snapshot_hash/
    );

    assert.throws(
      () => buildPredictionLoadPlan({
        ...inputFixture(),
        predictionRows: [
          predictionRowFixture(1, 6.25),
          { ...predictionRowFixture(2, 5.75), feature_columns: ['price'] }
        ]
      }),
      /feature_columns/
    );

    assert.throws(
      () => buildPredictionLoadPlan({
        ...inputFixture(),
        modelArtifact: { ...inputFixture().modelArtifact, feature_columns: ['different_feature'] }
      }),
      /Model artifact feature columns/
    );
  });

  it('rejects oversized prediction files and individual JSONL rows before parsing', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'scoutiq-prediction-loader-'));
    const predictionFilePath = path.join(directory, 'predictions.jsonl');
    try {
      await writeFile(predictionFilePath, Buffer.alloc(MAX_PREDICTION_FILE_BYTES + 1, 0x20));
      await assert.rejects(
        () => buildPredictionLoadPlanFromFiles({
          modelName: 'expected_points',
          predictionFilePath,
          modelArtifactPath: null,
          evaluationFilePath: null
        }),
        /byte limit/
      );

      await writeFile(
        predictionFilePath,
        `${JSON.stringify({ padding: 'x'.repeat(MAX_PREDICTION_LINE_BYTES) })}\n`,
        'utf8'
      );
      await assert.rejects(
        () => buildPredictionLoadPlanFromFiles({
          modelName: 'expected_points',
          predictionFilePath,
          modelArtifactPath: null,
          evaluationFilePath: null
        }),
        /line 1 exceeds the byte limit/
      );

      await writeFile(predictionFilePath, Buffer.from([0xff, 0x0a]));
      await assert.rejects(
        () => buildPredictionLoadPlanFromFiles({
          modelName: 'expected_points',
          predictionFilePath,
          modelArtifactPath: null,
          evaluationFilePath: null
        }),
        /malformed UTF-8/
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
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
    predictionFileHash: '1'.repeat(64),
    predictionRows: [
      predictionRowFixture(1, 6.25),
      predictionRowFixture(2, 5.75)
    ],
    modelArtifactPath: 'data/models/expected_points_baseline.json',
    modelArtifactHash: '2'.repeat(64),
    modelArtifact: {
      model_version: 'expected-points-rule-baseline-v1',
      training_row_count: 24,
      trained_from_gameweek: 1,
      trained_through_gameweek: 3,
      feature_columns: ['price', 'position', 'fixture_difficulty']
    },
    evaluationFilePath: 'data/evaluation/expected_points_backtest.json',
    evaluationFileHash: '3'.repeat(64),
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
    source_snapshot_hash: 'a'.repeat(64),
    source_generated_at: '2026-08-14T17:55:00.000Z',
    feature_columns: ['price', 'position', 'fixture_difficulty']
  };
}
