import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeElementSummaryHistory } from './history';

describe('FPL player history ingestion', () => {
  it('normalizes official element-summary history rows into deterministic gameweek records', () => {
    const rows = normalizeElementSummaryHistory(1, {
      history: [
        {
          element: 1,
          fixture: 102,
          opponent_team: 20,
          total_points: 7,
          was_home: true,
          kickoff_time: '2026-08-21T17:30:00Z',
          round: 2,
          minutes: 80,
          value: 126,
          selected: 1100000
        },
        {
          element: 1,
          fixture: 101,
          opponent_team: 20,
          total_points: 5,
          was_home: true,
          kickoff_time: '2026-08-14T17:30:00Z',
          round: 1,
          minutes: 90,
          value: 125,
          selected: 1000000
        }
      ]
    });

    assert.deepEqual(rows.map(row => row.fixtureId), [101, 102]);
    assert.equal(rows[0].playerId, 1);
    assert.equal(rows[0].gameweekId, 1);
    assert.equal(rows[0].price, 12.5);
    assert.equal(rows[1].selected, 1100000);
  });

  it('rejects malformed element-summary payloads', () => {
    assert.throws(
      () => normalizeElementSummaryHistory(1, { history: [{ fixture: 1 }] }),
      /Expected round to be an integer/
    );
  });
});
