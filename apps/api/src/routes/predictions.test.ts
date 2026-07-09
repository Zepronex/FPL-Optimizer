import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import express from 'express';
import { QueryResult, QueryResultRow } from 'pg';
import { Queryable } from '../db/client';
import { PLAYER_CANDIDATE_REQUIRED_COMMANDS } from '../db/playerQueries';
import { createPredictionsRouter } from './predictions';

describe('predictions route', () => {
  it('serves top predictions from PostgreSQL rows without calling the legacy ranking service', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('localhost:3002')) {
        throw Object.assign(new Error('fetch failed'), { code: 'ECONNREFUSED' });
      }

      return originalFetch(input, init);
    }) as typeof fetch;

    try {
      const response = await getJson(
        fakeClient({
          runRows: [predictionRunRowFixture()],
          predictionRows: [
            predictionRowFixture({ playerId: 1, playerName: 'Charlie Midfielder', position: 'MID', predictedPoints: 5.8 }),
            predictionRowFixture({ playerId: 2, playerName: 'Alpha Forward', position: 'FWD', predictedPoints: 8.4 }),
            predictionRowFixture({ playerId: 3, playerName: 'Beta Forward', position: 'FWD', predictedPoints: 7.9 })
          ]
        }),
        '/api/predictions/top?limit=2'
      );

      assert.equal(response.status, 200);
      assert.equal(response.body.success, true);
      assert.equal(response.body.count, 2);
      assert.deepEqual(
        response.body.data.predictions.map((prediction: { playerName: string }) => prediction.playerName),
        ['Alpha Forward', 'Beta Forward']
      );
      assert.equal(response.body.data.predictions[0].teamShortName, 'ARS');
      assert.equal(response.body.data.run.targetGameweekId, 4);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('returns setup commands when top prediction data is missing', async () => {
    const response = await getJson(
      fakeClient({ runRows: [], predictionRows: [] }),
      '/api/predictions/top?limit=10'
    );

    assert.equal(response.status, 404);
    assert.equal(response.body.success, false);
    assert.match(response.body.error, /No prediction runs loaded/);
    assert.deepEqual(response.body.requiredCommands, PLAYER_CANDIDATE_REQUIRED_COMMANDS);
  });
});

async function getJson(client: Queryable, routePath: string) {
  const app = express();
  app.use(express.json());
  app.use('/api/predictions', createPredictionsRouter(client));

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

function fakeClient(fixtures: {
  runRows: PredictionRunTestRow[];
  predictionRows: PlayerPredictionTestRow[];
}): Queryable {
  return {
    async query<T extends QueryResultRow = QueryResultRow>(queryText: string): Promise<QueryResult<T>> {
      const rows = queryText.includes('FROM player_predictions')
        ? fixtures.predictionRows
        : fixtures.runRows;

      return {
        command: 'SELECT',
        rowCount: rows.length,
        oid: 0,
        fields: [],
        rows: rows as unknown as T[]
      };
    }
  };
}

type PredictionRunTestRow = {
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
  metadata: Record<string, unknown>;
  created_at: Date | string;
  updated_at: Date | string;
};

type PlayerPredictionTestRow = {
  id: string;
  prediction_run_id: string;
  player_id: number;
  player_name: string;
  position: 'GK' | 'DEF' | 'MID' | 'FWD';
  team_id: number;
  team_name: string;
  team_short_name: string;
  price: number;
  status: 'a';
  chance_of_playing_next_round: number | null;
  chance_of_playing_this_round: number | null;
  target_gameweek_id: number;
  fixture_id: number | null;
  predicted_points: number;
  baseline_predicted_points: number | null;
  confidence: number | null;
  uncertainty: number | null;
  source_snapshot_hash: string | null;
  feature_snapshot_hash: string | null;
  feature_values: Record<string, unknown>;
  created_at: Date | string;
  updated_at: Date | string;
};

function predictionRunRowFixture(): PredictionRunTestRow {
  return {
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
    prediction_count: 3,
    metadata: {},
    created_at: new Date('2026-08-14T18:00:00.000Z'),
    updated_at: new Date('2026-08-14T18:05:00.000Z')
  };
}

function predictionRowFixture(overrides: {
  playerId: number;
  playerName: string;
  position: PlayerPredictionTestRow['position'];
  predictedPoints: number;
}): PlayerPredictionTestRow {
  return {
    id: String(overrides.playerId),
    prediction_run_id: '42',
    player_id: overrides.playerId,
    player_name: overrides.playerName,
    position: overrides.position,
    team_id: 1,
    team_name: 'Arsenal',
    team_short_name: 'ARS',
    price: 9.5,
    status: 'a',
    chance_of_playing_next_round: 100,
    chance_of_playing_this_round: 100,
    target_gameweek_id: 4,
    fixture_id: 100 + overrides.playerId,
    predicted_points: overrides.predictedPoints,
    baseline_predicted_points: 5.5,
    confidence: null,
    uncertainty: null,
    source_snapshot_hash: 'snapshot-a',
    feature_snapshot_hash: null,
    feature_values: {},
    created_at: new Date('2026-08-14T18:00:00.000Z'),
    updated_at: new Date('2026-08-14T18:05:00.000Z')
  };
}
