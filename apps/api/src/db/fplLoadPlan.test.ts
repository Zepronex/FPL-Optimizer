import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NormalizedFplDataset } from '../ingestion/schemas';
import { buildFplLoadPlan } from './fplLoadPlan';

function datasetFixture(): NormalizedFplDataset {
  return {
    manifest: {
      schemaVersion: 1,
      season: '2026-27',
      generatedAt: '2026-07-02T10:01:00.000Z',
      currentEventId: 1,
      sources: [
        {
          name: 'bootstrap-static',
          url: 'https://fantasy.premierleague.com/api/bootstrap-static/',
          fetchedAt: '2026-07-02T10:00:00.000Z',
          httpDate: null,
          etag: null,
          lastModified: null
        }
      ],
      recordCounts: {
        players: 2,
        teams: 2,
        events: 1,
        fixtures: 1
      }
    },
    players: [
      {
        id: 2,
        code: 200,
        firstName: 'Beta',
        secondName: 'Keeper',
        webName: 'Keeper',
        displayName: 'Beta Keeper',
        teamId: 20,
        position: 'GK',
        nowCost: 4.5,
        status: 'a',
        chanceOfPlayingNextRound: null,
        chanceOfPlayingThisRound: null,
        form: 0,
        selectedByPercent: 2.5,
        pointsPerGame: 1.1,
        valueSeason: 4.8,
        totalPoints: 11,
        minutes: 450,
        starts: 5,
        expectedGoals: 0,
        expectedAssists: 0,
        expectedGoalInvolvements: 0,
        expectedGoalsConceded: 7.5
      },
      {
        id: 1,
        code: 100,
        firstName: 'Alpha',
        secondName: 'Forward',
        webName: 'Alpha',
        displayName: 'Alpha Forward',
        teamId: 1,
        position: 'FWD',
        nowCost: 12.5,
        status: 'd',
        chanceOfPlayingNextRound: 75,
        chanceOfPlayingThisRound: 50,
        form: 6.2,
        selectedByPercent: 42.5,
        pointsPerGame: 7.1,
        valueSeason: 12.8,
        totalPoints: 181,
        minutes: 2420,
        starts: 28,
        expectedGoals: 19.45,
        expectedAssists: 7.15,
        expectedGoalInvolvements: 26.6,
        expectedGoalsConceded: 24
      }
    ],
    teams: [
      {
        id: 20,
        code: 20,
        name: 'Wolves',
        shortName: 'WOL',
        strength: 3,
        strengthOverallHome: 1040,
        strengthOverallAway: 1010
      },
      {
        id: 1,
        code: 1,
        name: 'Arsenal',
        shortName: 'ARS',
        strength: 5,
        strengthOverallHome: 1350,
        strengthOverallAway: 1320
      }
    ],
    events: [
      {
        id: 1,
        name: 'Gameweek 1',
        deadlineTime: '2026-08-14T17:30:00.000Z',
        averageEntryScore: 55,
        highestScore: 112,
        finished: false,
        dataChecked: false,
        isCurrent: true,
        isNext: false
      }
    ],
    fixtures: [
      {
        id: 10,
        code: 10,
        eventId: 1,
        kickoffTime: '2026-08-15T11:30:00.000Z',
        teamHId: 1,
        teamAId: 20,
        teamHScore: null,
        teamAScore: null,
        teamHDifficulty: 2,
        teamADifficulty: 4,
        started: false,
        finished: false
      }
    ]
  };
}

describe('FPL database load plan', () => {
  it('maps normalized ingestion records into deterministic database rows', () => {
    const plan = buildFplLoadPlan(datasetFixture());

    assert.deepEqual(plan.counts, {
      players: 2,
      teams: 2,
      gameweeks: 1,
      fixtures: 1
    });
    assert.deepEqual(plan.teams.map(team => team.id), [1, 20]);
    assert.deepEqual(plan.players.map(player => player.id), [1, 2]);
    assert.equal(plan.gameweeks[0].deadlineTime, '2026-08-14T17:30:00.000Z');
    assert.equal(plan.fixtures[0].eventId, 1);
    assert.equal(plan.ingestionRun.snapshotHash.length, 64);
  });

  it('keeps the same snapshot hash for equivalent record ordering', () => {
    const baseDataset = datasetFixture();
    const reorderedDataset: NormalizedFplDataset = {
      ...baseDataset,
      players: [...baseDataset.players].reverse(),
      teams: [...baseDataset.teams].reverse(),
      fixtures: [...baseDataset.fixtures].reverse()
    };

    assert.equal(
      buildFplLoadPlan(reorderedDataset).ingestionRun.snapshotHash,
      buildFplLoadPlan(baseDataset).ingestionRun.snapshotHash
    );
  });

  it('rejects normalized files that do not match manifest counts', () => {
    const dataset = datasetFixture();
    const invalidDataset: NormalizedFplDataset = {
      ...dataset,
      manifest: {
        ...dataset.manifest,
        recordCounts: {
          ...dataset.manifest.recordCounts,
          players: 3
        }
      }
    };

    assert.throws(
      () => buildFplLoadPlan(invalidDataset),
      /Manifest counts do not match normalized files/
    );
  });
});
