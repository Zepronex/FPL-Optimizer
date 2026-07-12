import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import express from 'express';
import { QueryResult, QueryResultRow } from 'pg';
import { Queryable } from '../db/client';
import { PLAYER_CANDIDATE_REQUIRED_COMMANDS } from '../db/playerQueries';
import { createPlayersRouter } from './players';

describe('players route', () => {
  it('searches prediction-backed local candidates by partial name', async () => {
    const response = await getJson(
      fakeClient([
        playerRowFixture({ id: 1, displayName: 'Gabriel Martinelli', position: 'MID' }),
        playerRowFixture({ id: 2, displayName: 'Bukayo Saka', position: 'MID' }),
        playerRowFixture({ id: 3, displayName: 'Erling Haaland', position: 'FWD' })
      ]),
      '/api/players/search?name=martinelli'
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.count, 1);
    assert.equal(response.body.data[0].name, 'Gabriel Martinelli');
    assert.equal(response.body.data[0].pos, 'MID');
    assert.equal(response.body.data[0].teamShort, 'ARS');
    assert.equal(response.body.data[0].price, 7.5);
  });

  it('returns an explicit empty result when no player matches the search', async () => {
    const response = await getJson(
      fakeClient([
        playerRowFixture({ id: 1, displayName: 'Gabriel Martinelli', position: 'MID' })
      ]),
      '/api/players/search?name=zzzzzz'
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.count, 0);
    assert.deepEqual(response.body.data, []);
  });

  it('returns setup commands when prediction-backed candidates are missing', async () => {
    const response = await getJson(fakeClient([]), '/api/players/search?name=saka');

    assert.equal(response.status, 503);
    assert.equal(response.body.success, false);
    assert.match(response.body.error, /No prediction-backed player candidates are loaded/);
    assert.deepEqual(response.body.requiredCommands, PLAYER_CANDIDATE_REQUIRED_COMMANDS);
  });

  it('serves position routes before player id routes', async () => {
    const response = await getJson(
      fakeClient([
        playerRowFixture({ id: 1, displayName: 'Gabriel Martinelli', position: 'MID' }),
        playerRowFixture({ id: 2, displayName: 'Erling Haaland', position: 'FWD' })
      ]),
      '/api/players/position/MID'
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.count, 1);
    assert.equal(response.body.data[0].pos, 'MID');
  });

  it('rejects unknown query fields and non-canonical player IDs', async () => {
    const client = fakeClient([
      playerRowFixture({ id: 1, displayName: 'Gabriel Martinelli', position: 'MID' })
    ]);

    assert.equal((await getJson(client, '/api/players?extra=1')).status, 400);
    assert.equal((await getJson(client, '/api/players/search?name=saka&extra=1')).status, 400);
    assert.equal((await getJson(client, '/api/players/1e2')).status, 400);
    assert.equal((await getJson(client, '/api/players/01')).status, 400);
  });

  it('treats injection-shaped search text as data', async () => {
    let queryText = '';
    const client: Queryable = {
      async query<T extends QueryResultRow = QueryResultRow>(text: string): Promise<QueryResult<T>> {
        queryText = text;
        return {
          command: 'SELECT',
          rowCount: 1,
          oid: 0,
          fields: [],
          rows: [playerRowFixture({ id: 1, displayName: 'Gabriel Martinelli', position: 'MID' })] as unknown as T[]
        };
      }
    };
    const injectionText = "'; DROP TABLE players;--";
    const response = await getJson(
      client,
      `/api/players/search?name=${encodeURIComponent(injectionText)}`
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.count, 0);
    assert.doesNotMatch(queryText, /DROP TABLE/i);
  });
});

async function getJson(client: Queryable, routePath: string) {
  const app = express();
  app.use(express.json());
  app.use('/api/players', createPlayersRouter(client));

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

function playerRowFixture(overrides: {
  id?: number;
  displayName?: string;
  position?: PlayerCandidateTestRow['position'];
} = {}): PlayerCandidateTestRow {
  return {
    id: overrides.id ?? 1,
    display_name: overrides.displayName ?? 'Alpha Forward',
    team_id: 1,
    team_short: 'ARS',
    position: overrides.position ?? 'FWD',
    now_cost: 7.5,
    form: 5.2,
    status: 'a',
    expected_goals: 2.5,
    expected_assists: 1.5,
    minutes: 900,
    starts: 10,
    points_per_game: 4.5,
    value_season: 10.1,
    selected_by_percent: 12.3,
    next_3_ease: 2.7
  };
}
