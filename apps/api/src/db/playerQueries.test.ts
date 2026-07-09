import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { QueryResult, QueryResultRow } from 'pg';
import { Queryable } from './client';
import { readSquadBuilderPlayers, searchEnrichedPlayers } from './playerQueries';

describe('player candidate queries', () => {
  it('maps prediction-backed database rows into squad-builder players', async () => {
    const players = await readSquadBuilderPlayers(fakeClient([
      playerRowFixture({
        id: 12,
        displayName: 'Gabriel Martinelli',
        position: 'MID',
        expectedGoals: 4.5,
        expectedAssists: 3.0,
        minutes: 900,
        starts: 10
      })
    ]));

    assert.equal(players.length, 1);
    assert.equal(players[0].id, 12);
    assert.equal(players[0].name, 'Gabriel Martinelli');
    assert.equal(players[0].pos, 'MID');
    assert.equal(players[0].teamShort, 'ARS');
    assert.equal(players[0].price, 7.5);
    assert.equal(players[0].xg90, 0.45);
    assert.equal(players[0].xa90, 0.3);
    assert.equal(players[0].expMin, 90);
  });

  it('searches player candidates by partial name case-insensitively', () => {
    const players = [
      playerFixture({ id: 1, name: 'Gabriel Martinelli' }),
      playerFixture({ id: 2, name: 'Bukayo Saka' }),
      playerFixture({ id: 3, name: 'Erling Haaland' })
    ];

    assert.deepEqual(searchEnrichedPlayers(players, 'martinelli').map(player => player.name), ['Gabriel Martinelli']);
    assert.deepEqual(searchEnrichedPlayers(players, 'SAK').map(player => player.name), ['Bukayo Saka']);
    assert.deepEqual(searchEnrichedPlayers(players, 'haal').map(player => player.name), ['Erling Haaland']);
  });

  it('returns an empty result for valid searches with no matching candidate', () => {
    const players = [
      playerFixture({ id: 1, name: 'Gabriel Martinelli' })
    ];

    assert.deepEqual(searchEnrichedPlayers(players, 'not a player'), []);
  });
});

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
  expectedGoals?: number;
  expectedAssists?: number;
  minutes?: number;
  starts?: number;
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
    expected_goals: overrides.expectedGoals ?? 0,
    expected_assists: overrides.expectedAssists ?? 0,
    minutes: overrides.minutes ?? 0,
    starts: overrides.starts ?? 0,
    points_per_game: 4.5,
    value_season: 10.1,
    selected_by_percent: 12.3,
    next_3_ease: 2.7
  };
}

function playerFixture(overrides: {
  id: number;
  name: string;
}) {
  return {
    id: overrides.id,
    name: overrides.name,
    teamId: 1,
    teamShort: 'ARS',
    pos: 'MID' as const,
    price: 7.5,
    form: 5,
    status: 'a' as const,
    xg90: 0.2,
    xa90: 0.3,
    expMin: 80,
    next3Ease: 2.5,
    avgPoints: 4.5,
    value: 10,
    ownership: 20
  };
}
