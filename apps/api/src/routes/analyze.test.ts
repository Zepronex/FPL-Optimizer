import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import express from 'express';
import { QueryResult, QueryResultRow } from 'pg';
import { Queryable } from '../db/client';
import { PLAYER_CANDIDATE_REQUIRED_COMMANDS } from '../db/playerQueries';
import { createAnalyzeRouter } from './analyze';

describe('analyze route', () => {
  it('analyzes a complete squad from prediction-backed local player data without the optional ML service', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('localhost:3002')) {
        throw Object.assign(new Error('fetch failed'), { code: 'ECONNREFUSED' });
      }

      return originalFetch(input, init);
    }) as typeof fetch;

    try {
      const response = await postAnalyze(candidateRowsFixture(), squadPayload());

      assert.equal(response.status, 200);
      assert.equal(response.body.success, true);
      assert.equal(response.body.data.results.length, 15);
      assert.equal(response.body.data.results[0].player.name, 'Player 1');
      assert.equal(response.body.data.results[0].player.pos, 'GK');
      assert.equal(typeof response.body.data.averageScore, 'number');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('treats frontend display fields as non-authoritative and enriches selected IDs from PostgreSQL rows', async () => {
    const response = await postAnalyze(candidateRowsFixture(), squadPayload({
      corruptDisplayFields: true
    }));

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.results[0].player.name, 'Player 1');
    assert.equal(response.body.data.results[0].player.pos, 'GK');
    assert.equal(response.body.data.results[0].player.price, 5);
  });

  it('returns setup guidance when prediction-backed player data is missing', async () => {
    const response = await postAnalyze([], squadPayload());

    assert.equal(response.status, 503);
    assert.equal(response.body.success, false);
    assert.match(response.body.error, /Prediction data is missing/);
    assert.deepEqual(response.body.requiredCommands, PLAYER_CANDIDATE_REQUIRED_COMMANDS);
  });

  it('returns a 400 with unknown player ids when selected players are not in prediction rows', async () => {
    const response = await postAnalyze(candidateRowsFixture().filter(row => row.id !== 15), squadPayload());

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
    assert.match(response.body.error, /do not have prediction rows/);
    assert.deepEqual(response.body.details.playerIds, [15]);
  });
});

async function postAnalyze(rows: PlayerCandidateTestRow[], payload: unknown) {
  const app = express();
  app.use(express.json());
  app.use('/api/analyze', createAnalyzeRouter(fakeClient(rows)));

  const server = app.listen(0);
  const address = server.address() as AddressInfo;

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/analyze`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    return {
      status: response.status,
      body: await response.json()
    };
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

function fakeClient(rows: PlayerCandidateTestRow[]): Queryable {
  return {
    async query<T extends QueryResultRow = QueryResultRow>(): Promise<QueryResult<T>> {
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

function squadPayload(options: { corruptDisplayFields?: boolean } = {}) {
  const slot = (id: number, pos: 'GK' | 'DEF' | 'MID' | 'FWD') => ({
    id,
    pos: options.corruptDisplayFields ? 'FWD' : pos,
    price: options.corruptDisplayFields ? 14.9 : 5,
    name: 'Frontend Display Name',
    teamShort: 'XXX'
  });

  return {
    squad: {
      startingXI: [
        slot(1, 'GK'),
        slot(2, 'DEF'),
        slot(3, 'DEF'),
        slot(4, 'DEF'),
        slot(5, 'DEF'),
        slot(6, 'MID'),
        slot(7, 'MID'),
        slot(8, 'MID'),
        slot(9, 'MID'),
        slot(10, 'FWD'),
        slot(11, 'FWD')
      ],
      bench: [
        slot(12, 'GK'),
        slot(13, 'DEF'),
        slot(14, 'MID'),
        slot(15, 'FWD')
      ],
      bank: 0
    },
    weights: {
      form: 0.2,
      xg90: 0.15,
      xa90: 0.15,
      expMin: 0.15,
      next3Ease: 0.1,
      avgPoints: 0.15,
      value: 0.05,
      ownership: 0.05
    }
  };
}

function candidateRowsFixture(): PlayerCandidateTestRow[] {
  return [
    playerRowFixture(1, 'GK'),
    playerRowFixture(2, 'DEF'),
    playerRowFixture(3, 'DEF'),
    playerRowFixture(4, 'DEF'),
    playerRowFixture(5, 'DEF'),
    playerRowFixture(6, 'MID'),
    playerRowFixture(7, 'MID'),
    playerRowFixture(8, 'MID'),
    playerRowFixture(9, 'MID'),
    playerRowFixture(10, 'FWD'),
    playerRowFixture(11, 'FWD'),
    playerRowFixture(12, 'GK'),
    playerRowFixture(13, 'DEF'),
    playerRowFixture(14, 'MID'),
    playerRowFixture(15, 'FWD'),
    playerRowFixture(16, 'MID', { displayName: 'Suggestion Candidate' })
  ];
}

type PlayerCandidateTestRow = {
  id: number;
  display_name: string;
  team_id: number;
  team_short: string;
  position: 'GK' | 'DEF' | 'MID' | 'FWD';
  now_cost: number;
  form: number;
  status: 'a';
  expected_goals: number;
  expected_assists: number;
  minutes: number;
  starts: number;
  points_per_game: number;
  value_season: number;
  selected_by_percent: number;
  next_3_ease: number;
};

function playerRowFixture(
  id: number,
  position: PlayerCandidateTestRow['position'],
  overrides: { displayName?: string } = {}
): PlayerCandidateTestRow {
  return {
    id,
    display_name: overrides.displayName ?? `Player ${id}`,
    team_id: 1,
    team_short: 'ARS',
    position,
    now_cost: 5,
    form: 5,
    status: 'a',
    expected_goals: 2.5,
    expected_assists: 1.5,
    minutes: 900,
    starts: 10,
    points_per_game: 4.5,
    value_season: 10,
    selected_by_percent: 20,
    next_3_ease: 2.5
  };
}
