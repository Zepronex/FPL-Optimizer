import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildNormalizedFplDataset,
  normalizeBootstrapStatic,
  normalizeFixtures,
  validateNormalizedFplDataset
} from './normalizers';
import {
  MAX_FIXTURE_SCORE,
  MAX_FPL_GAMEWEEK,
  MAX_POSTGRES_INTEGER
} from './schemas';

const sourceMetadata = [
  {
    name: 'bootstrap-static',
    url: 'https://fantasy.premierleague.com/api/bootstrap-static/',
    fetchedAt: '2026-07-02T10:00:00.000Z',
    httpDate: null,
    etag: null,
    lastModified: null
  },
  {
    name: 'fixtures',
    url: 'https://fantasy.premierleague.com/api/fixtures/',
    fetchedAt: '2026-07-02T10:00:01.000Z',
    httpDate: null,
    etag: null,
    lastModified: null
  }
];

function bootstrapFixture() {
  return {
    current_event: 1,
    elements: [
      {
        id: 2,
        code: 200,
        first_name: 'Beta',
        second_name: 'Keeper',
        web_name: 'Keeper',
        team: 20,
        element_type: 1,
        now_cost: 45,
        status: 'a',
        chance_of_playing_next_round: null,
        chance_of_playing_this_round: null,
        form: '0.0',
        selected_by_percent: '2.5',
        points_per_game: '1.1',
        value_season: '4.8',
        total_points: 11,
        minutes: 450,
        starts: 5,
        expected_goals: '0.00',
        expected_assists: '0.00',
        expected_goal_involvements: '0.00',
        expected_goals_conceded: '7.50'
      },
      {
        id: 1,
        code: 100,
        first_name: 'Alpha',
        second_name: 'Forward',
        web_name: 'Alpha',
        team: 1,
        element_type: 4,
        now_cost: 125,
        status: 'd',
        chance_of_playing_next_round: 75,
        chance_of_playing_this_round: 50,
        form: '6.2',
        selected_by_percent: '42.5',
        points_per_game: '7.1',
        value_season: '12.8',
        total_points: 181,
        minutes: 2420,
        starts: 28,
        expected_goals: '19.45',
        expected_assists: '7.15',
        expected_goal_involvements: '26.60',
        expected_goals_conceded: '24.00'
      }
    ],
    teams: [
      {
        id: 20,
        code: 20,
        name: 'Wolves',
        short_name: 'WOL',
        strength: 3,
        strength_overall_home: 1040,
        strength_overall_away: 1010
      },
      {
        id: 1,
        code: 1,
        name: 'Arsenal',
        short_name: 'ARS',
        strength: 5,
        strength_overall_home: 1350,
        strength_overall_away: 1320
      }
    ],
    events: [
      {
        id: 1,
        name: 'Gameweek 1',
        deadline_time: '2026-08-14T17:30:00Z',
        average_entry_score: 55,
        highest_score: 112,
        finished: false,
        data_checked: false,
        is_current: true,
        is_next: false
      }
    ]
  };
}

function fixturesFixture() {
  return [
    {
      id: 10,
      code: 10,
      event: 1,
      kickoff_time: '2026-08-15T11:30:00Z',
      team_h: 1,
      team_a: 20,
      team_h_score: null,
      team_a_score: null,
      team_h_difficulty: 2,
      team_a_difficulty: 4,
      started: false,
      finished: false
    },
    {
      id: 9,
      code: 9,
      event: null,
      kickoff_time: null,
      team_h: 20,
      team_a: 1,
      team_h_score: null,
      team_a_score: null,
      team_h_difficulty: 3,
      team_a_difficulty: 3,
      started: false,
      finished: false
    }
  ];
}

describe('FPL ingestion normalization', () => {
  it('normalizes players, teams, and events into stable records', () => {
    const normalized = normalizeBootstrapStatic(bootstrapFixture());

    assert.equal(normalized.currentEventId, 1);
    assert.deepEqual(normalized.players.map(player => player.id), [1, 2]);
    assert.equal(normalized.players[0].displayName, 'Alpha Forward');
    assert.equal(normalized.players[0].position, 'FWD');
    assert.equal(normalized.players[0].nowCost, 12.5);
    assert.equal(normalized.players[0].selectedByPercent, 42.5);
    assert.equal(normalized.teams[0].shortName, 'ARS');
    assert.equal(normalized.events[0].deadlineTime, '2026-08-14T17:30:00.000Z');
  });

  it('normalizes fixtures and preserves unscheduled gameweeks', () => {
    const normalized = normalizeFixtures(fixturesFixture());

    assert.deepEqual(normalized.map(fixture => fixture.id), [9, 10]);
    assert.equal(normalized[0].eventId, null);
    assert.equal(normalized[1].kickoffTime, '2026-08-15T11:30:00.000Z');
    assert.equal(normalized[1].teamHDifficulty, 2);
  });

  it('builds a validated dataset with source metadata and counts', () => {
    const dataset = buildNormalizedFplDataset({
      rawBootstrap: bootstrapFixture(),
      rawFixtures: fixturesFixture(),
      generatedAt: '2026-07-02T10:01:00Z',
      season: '2026-27',
      sources: sourceMetadata
    });

    assert.equal(dataset.manifest.schemaVersion, 1);
    assert.equal(dataset.manifest.season, '2026-27');
    assert.deepEqual(dataset.manifest.recordCounts, {
      players: 2,
      teams: 2,
      events: 1,
      fixtures: 2
    });
  });

  it('rejects invalid team or event references', () => {
    const dataset = buildNormalizedFplDataset({
      rawBootstrap: bootstrapFixture(),
      rawFixtures: fixturesFixture(),
      generatedAt: '2026-07-02T10:01:00Z',
      sources: sourceMetadata
    });

    const invalidDataset = {
      ...dataset,
      fixtures: [
        {
          ...dataset.fixtures[0],
          eventId: 2
        }
      ]
    };

    assert.throws(
      () => validateNormalizedFplDataset(invalidDataset),
      /Fixture 9 failed team\/event reference validation/
    );
  });

  it('rejects oversized external collections before normalization work', () => {
    const bootstrap = bootstrapFixture();
    assert.throws(
      () => normalizeBootstrapStatic({
        ...bootstrap,
        elements: Array.from({ length: 2_001 }, () => bootstrap.elements[0])
      }),
      /must contain at most 2000 element/
    );

    assert.throws(
      () => normalizeFixtures(Array.from({ length: 5_001 }, () => fixturesFixture()[0])),
      /must contain at most 5000 element/
    );
  });

  it('rejects external identifiers and gameweeks outside storage bounds', () => {
    const invalidPlayer = bootstrapFixture();
    invalidPlayer.elements[0].id = MAX_POSTGRES_INTEGER + 1;

    const invalidTeam = bootstrapFixture();
    invalidTeam.teams[0].id = MAX_POSTGRES_INTEGER + 1;

    const invalidEvent = bootstrapFixture();
    invalidEvent.events[0].id = MAX_FPL_GAMEWEEK + 1;

    const invalidCurrentEvent = bootstrapFixture();
    invalidCurrentEvent.current_event = MAX_FPL_GAMEWEEK + 1;

    const invalidFixture = fixturesFixture();
    invalidFixture[0].id = MAX_POSTGRES_INTEGER + 1;

    const invalidFixtureEvent = fixturesFixture();
    invalidFixtureEvent[0].event = MAX_FPL_GAMEWEEK + 1;

    for (const [label, action] of [
      ['player id', () => normalizeBootstrapStatic(invalidPlayer)],
      ['team id', () => normalizeBootstrapStatic(invalidTeam)],
      ['event id', () => normalizeBootstrapStatic(invalidEvent)],
      ['current event', () => normalizeBootstrapStatic(invalidCurrentEvent)],
      ['fixture id', () => normalizeFixtures(invalidFixture)],
      ['fixture event', () => normalizeFixtures(invalidFixtureEvent)]
    ] as const) {
      assert.throws(action, undefined, label);
    }
  });

  it('rejects non-finite and implausibly large normalized statistics', () => {
    const invalidMutations: Array<[
      string,
      (dataset: ReturnType<typeof buildNormalizedFplDataset>) => void
    ]> = [
      ['non-finite form', dataset => { dataset.players[0].form = Number.POSITIVE_INFINITY; }],
      ['percentage above 100', dataset => { dataset.players[0].selectedByPercent = 100.1; }],
      ['excessive minutes', dataset => { dataset.players[0].minutes = 10_001; }],
      ['excessive team strength', dataset => { dataset.teams[0].strength = 10_001; }],
      ['excessive gameweek score', dataset => { dataset.events[0].highestScore = 1_001; }],
      ['excessive fixture score', dataset => { dataset.fixtures[0].teamHScore = MAX_FIXTURE_SCORE + 1; }]
    ];

    for (const [label, mutate] of invalidMutations) {
      const dataset = buildNormalizedFplDataset({
        rawBootstrap: bootstrapFixture(),
        rawFixtures: fixturesFixture(),
        generatedAt: '2026-07-02T10:01:00Z',
        sources: sourceMetadata
      });
      mutate(dataset);
      assert.throws(() => validateNormalizedFplDataset(dataset), undefined, label);
    }
  });

  it('rejects unsafe numeric strings without echoing raw external values', () => {
    const rejectedNumericValue = ['untrusted', 'numeric', 'marker'].join('-');
    const bootstrap = bootstrapFixture();
    bootstrap.elements[0].form = rejectedNumericValue;

    assert.throws(
      () => normalizeBootstrapStatic(bootstrap),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /finite decimal numeric string/);
        assert.equal(error.message.includes(rejectedNumericValue), false);
        return true;
      }
    );

    const rejectedDateValue = ['untrusted', 'date', 'marker'].join('-');
    assert.throws(
      () => buildNormalizedFplDataset({
        rawBootstrap: bootstrapFixture(),
        rawFixtures: fixturesFixture(),
        generatedAt: rejectedDateValue,
        sources: sourceMetadata
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /Invalid date-time value/);
        assert.equal(error.message.includes(rejectedDateValue), false);
        return true;
      }
    );
  });
});
