import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AddressInfo } from 'node:net';
import { afterEach, describe, it } from 'node:test';
import express from 'express';
import { QueryResult, QueryResultRow } from 'pg';
import { Queryable } from '../db/client';
import {
  EvaluationDataHealthApiResponseSchema,
  EvaluationLatestApiResponseSchema,
  EvaluationRunsApiResponseSchema
} from '../evaluation/schemas';
import { createEvaluationRouter } from './evaluation';

type EvaluationRow = {
  id: string;
  evaluation_key: string;
  model_name: string;
  model_version: string;
  evaluation_type: string;
  prediction_count: number;
  metrics: Record<string, unknown>;
  baseline_metrics: Record<string, unknown> | null;
  metrics_by_position: Record<string, unknown> | null;
  baseline_metrics_by_position: Record<string, unknown> | null;
  evaluated_gameweeks: number[];
  skipped_gameweeks: number[];
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

type PredictionRunRow = {
  id: string;
  run_key: string;
  model_name: string;
  model_version: string;
  target_gameweek_id: number;
  prediction_file_hash: string;
  model_artifact_hash: string | null;
  feature_snapshot_hash: string | null;
  source_snapshot_hash: string | null;
  source_generated_at: Date | null;
  source_run_id: string | null;
  prediction_count: number;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

type FakeClientOptions = {
  evaluations?: EvaluationRow[];
  predictionRuns?: PredictionRunRow[];
  latestPredictionRows?: number;
  coverage?: {
    players: number;
    teams: number;
    gameweeks: number;
    fixtures: number;
    predictionRuns: number;
    evaluationRuns: number;
  };
};

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('evaluation route', () => {
  it('maps the latest evaluation into baseline comparison fields', async () => {
    const response = await getJson(
      createEvaluationRouter(fakeClient({
        evaluations: [evaluationRowFixture()],
        predictionRuns: [predictionRunRowFixture()]
      })),
      '/api/evaluation/latest'
    );
    const parsed = EvaluationLatestApiResponseSchema.parse(response.body);

    assert.equal(response.status, 200);
    assert.equal(parsed.data.latestRun?.backtestRows, 28352);
    assert.equal(parsed.data.latestRun?.mae.modelValue, 1.0925);
    assert.equal(parsed.data.latestRun?.mae.baselineValue, 1.0366);
    assert.equal(parsed.data.latestRun?.mae.differenceVsBaseline, 0.0559);
    assert.equal(parsed.data.latestRun?.mae.modelBeatsBaseline, false);
    assert.equal(parsed.data.latestRun?.rmse.differenceVsBaseline, -0.1212);
    assert.equal(parsed.data.latestRun?.rmse.modelBeatsBaseline, true);
    assert.match(parsed.data.warnings.join(' '), /not clearly better/);
  });

  it('returns an empty latest evaluation response with setup commands when evaluation data is missing', async () => {
    const response = await getJson(
      createEvaluationRouter(fakeClient({
        evaluations: [],
        predictionRuns: [predictionRunRowFixture()]
      })),
      '/api/evaluation/latest'
    );
    const parsed = EvaluationLatestApiResponseSchema.parse(response.body);

    assert.equal(response.status, 200);
    assert.equal(parsed.data.latestRun, null);
    assert.ok(parsed.data.requiredCommands.includes('pnpm.cmd run model:backtest'));
    assert.match(parsed.data.warnings.join(' '), /No model evaluation data is loaded/);
  });

  it('reports missing prediction run data without hiding the latest evaluation', async () => {
    const response = await getJson(
      createEvaluationRouter(fakeClient({
        evaluations: [evaluationRowFixture()],
        predictionRuns: []
      })),
      '/api/evaluation/latest'
    );
    const parsed = EvaluationLatestApiResponseSchema.parse(response.body);

    assert.equal(response.status, 200);
    assert.equal(parsed.data.latestRun?.id, 8);
    assert.equal(parsed.data.latestPredictionRun, null);
    assert.match(parsed.data.warnings.join(' '), /No prediction run is loaded/);
  });

  it('returns data-health coverage with local player-gameweek history metadata', async () => {
    const historyPath = await writeHistoryArtifact();
    const response = await getJson(
      createEvaluationRouter(
        fakeClient({
          evaluations: [evaluationRowFixture()],
          predictionRuns: [predictionRunRowFixture()],
          latestPredictionRows: 841,
          coverage: {
            players: 841,
            teams: 20,
            gameweeks: 38,
            fixtures: 380,
            predictionRuns: 1,
            evaluationRuns: 1
          }
        }),
        {
          playerGameweekHistoryPath: historyPath,
          now: () => new Date('2026-07-06T12:00:00.000Z')
        }
      ),
      '/api/evaluation/data-health'
    );
    const parsed = EvaluationDataHealthApiResponseSchema.parse(response.body);

    assert.equal(response.status, 200);
    assert.equal(parsed.data.generatedAt, '2026-07-06T12:00:00.000Z');
    assert.equal(parsed.data.coverage.players, 841);
    assert.equal(parsed.data.coverage.teams, 20);
    assert.equal(parsed.data.coverage.gameweeks, 38);
    assert.equal(parsed.data.coverage.fixtures, 380);
    assert.equal(parsed.data.coverage.latestPredictionRows, 841);
    assert.equal(parsed.data.coverage.playerGameweekHistoryRows, 29747);
    assert.equal(parsed.data.playerGameweekHistory?.sourceName, 'element-summary');
  });

  it('does not return misleading model-improved language', async () => {
    const response = await getJson(
      createEvaluationRouter(fakeClient({
        evaluations: [evaluationRowFixture()],
        predictionRuns: [predictionRunRowFixture()]
      })),
      '/api/evaluation/latest'
    );
    const responseText = JSON.stringify(response.body).toLowerCase();

    assert.doesNotMatch(responseText, /model improved/);
    assert.doesNotMatch(responseText, /model improvement/);
    assert.doesNotMatch(responseText, /outperforms the baseline/);
    assert.doesNotMatch(responseText, /model superiority/);
  });

  it('lists evaluation runs in deterministic newest-first order', async () => {
    const response = await getJson(
      createEvaluationRouter(fakeClient({
        evaluations: [
          evaluationRowFixture({ id: '1', createdAt: new Date('2026-07-04T12:00:00.000Z') }),
          evaluationRowFixture({ id: '3', createdAt: new Date('2026-07-05T12:00:00.000Z') }),
          evaluationRowFixture({ id: '2', createdAt: new Date('2026-07-05T12:00:00.000Z') })
        ],
        predictionRuns: [predictionRunRowFixture()]
      })),
      '/api/evaluation/runs'
    );
    const parsed = EvaluationRunsApiResponseSchema.parse(response.body);

    assert.equal(response.status, 200);
    assert.deepEqual(parsed.data.runs.map(run => run.id), [3, 2, 1]);
    assert.equal(parsed.count, 3);
  });
});

async function getJson(router: ReturnType<typeof createEvaluationRouter>, routePath: string) {
  const app = express();
  app.use(express.json());
  app.use('/api/evaluation', router);

  const server = app.listen(0);
  const address = server.address() as AddressInfo;

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${routePath}`);
    return {
      status: response.status,
      body: await response.json()
    };
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

function fakeClient(options: FakeClientOptions): Queryable {
  const evaluations = [...(options.evaluations ?? [])];
  const predictionRuns = [...(options.predictionRuns ?? [])];

  return {
    async query<T extends QueryResultRow = QueryResultRow>(
      text: string,
      values?: readonly unknown[]
    ): Promise<QueryResult<T>> {
      const normalizedSql = text.replace(/\s+/g, ' ');

      if (normalizedSql.includes('WITH latest_prediction_run')) {
        return result<T>([{
          players: String(options.coverage?.players ?? 0),
          teams: String(options.coverage?.teams ?? 0),
          gameweeks: String(options.coverage?.gameweeks ?? 0),
          fixtures: String(options.coverage?.fixtures ?? 0),
          latest_prediction_rows: String(options.latestPredictionRows ?? 0),
          prediction_runs: String(options.coverage?.predictionRuns ?? predictionRuns.length),
          evaluation_runs: String(options.coverage?.evaluationRuns ?? evaluations.length)
        }]);
      }

      if (normalizedSql.includes('FROM model_evaluations')) {
        const sorted = sortEvaluationRows(evaluations);
        const limit = normalizedSql.includes('LIMIT $1') ? Number(values?.[0] ?? 25) : 1;
        return result<T>(sorted.slice(0, limit));
      }

      if (normalizedSql.includes('FROM prediction_runs')) {
        return result<T>(sortPredictionRunRows(predictionRuns).slice(0, 1));
      }

      throw new Error(`Unexpected query in evaluation route test: ${normalizedSql}`);
    }
  };
}

function result<T extends QueryResultRow>(rows: unknown[]): QueryResult<T> {
  return {
    command: 'SELECT',
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows: rows as T[]
  };
}

function sortEvaluationRows(rows: EvaluationRow[]): EvaluationRow[] {
  return [...rows].sort((left, right) => {
    const createdAtComparison = right.created_at.getTime() - left.created_at.getTime();
    if (createdAtComparison !== 0) return createdAtComparison;
    return Number(right.id) - Number(left.id);
  });
}

function sortPredictionRunRows(rows: PredictionRunRow[]): PredictionRunRow[] {
  return [...rows].sort((left, right) => {
    const createdAtComparison = right.created_at.getTime() - left.created_at.getTime();
    if (createdAtComparison !== 0) return createdAtComparison;
    return Number(right.id) - Number(left.id);
  });
}

function evaluationRowFixture(overrides: {
  id?: string;
  createdAt?: Date;
} = {}): EvaluationRow {
  const createdAt = overrides.createdAt ?? new Date('2026-07-05T12:00:00.000Z');
  return {
    id: overrides.id ?? '8',
    evaluation_key: `evaluation-key-${overrides.id ?? '8'}`,
    model_name: 'expected_points',
    model_version: 'expected-points-rule-baseline-v1',
    evaluation_type: 'walk_forward_backtest',
    prediction_count: 28352,
    metrics: {
      count: 28352,
      mae: 1.0925,
      rmse: 2.0246
    },
    baseline_metrics: {
      count: 28352,
      mae: 1.0366,
      rmse: 2.1458
    },
    metrics_by_position: null,
    baseline_metrics_by_position: null,
    evaluated_gameweeks: [3, 4, 5],
    skipped_gameweeks: [1, 2],
    metadata: {
      rowCount: 28352
    },
    created_at: createdAt,
    updated_at: createdAt
  };
}

function predictionRunRowFixture(): PredictionRunRow {
  return {
    id: '42',
    run_key: 'prediction-run-key',
    model_name: 'expected_points',
    model_version: 'expected-points-rule-baseline-v1',
    target_gameweek_id: 38,
    prediction_file_hash: 'prediction-file-hash',
    model_artifact_hash: 'model-artifact-hash',
    feature_snapshot_hash: 'feature-snapshot-hash',
    source_snapshot_hash: 'source-snapshot-hash',
    source_generated_at: new Date('2026-07-04T14:09:05.035Z'),
    source_run_id: '7',
    prediction_count: 841,
    metadata: {},
    created_at: new Date('2026-07-05T13:00:00.000Z'),
    updated_at: new Date('2026-07-05T13:00:00.000Z')
  };
}

async function writeHistoryArtifact(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'evaluation-route-'));
  tmpDirs.push(dir);
  const filePath = path.join(dir, 'player_gameweek_history.json');
  await writeFile(
    filePath,
    JSON.stringify({
      schemaVersion: 1,
      generatedAt: '2026-07-04T14:09:52.867Z',
      source: {
        name: 'element-summary'
      },
      playerCount: 841,
      rowCount: 29747,
      rows: []
    }),
    'utf8'
  );
  return filePath;
}
