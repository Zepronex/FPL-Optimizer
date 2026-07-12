import assert from 'node:assert/strict';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { normalizeElementSummaryHistory } from './history';
import { NORMALIZED_FPL_FILE_LIMITS, readNormalizedFplJson } from './localJson';

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

  it('rejects oversized history arrays and out-of-range gameweeks', () => {
    assert.throws(
      () => normalizeElementSummaryHistory(1, { history: Array.from({ length: 201 }, () => ({})) }),
      /history row limit/
    );

    assert.throws(
      () => normalizeElementSummaryHistory(1, {
        history: [{
          fixture: 1,
          opponent_team: 2,
          total_points: 1,
          was_home: true,
          kickoff_time: '2026-08-14T17:30:00Z',
          round: 39,
          minutes: 90,
          value: 100,
          selected: 1
        }]
      }),
      /round to be between 1 and 38/
    );
  });

  it('bounds normalized FPL files before reading them', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'scoutiq-fpl-input-'));
    const filePath = path.join(directory, 'players.json');
    try {
      await writeFile(filePath, Buffer.alloc(NORMALIZED_FPL_FILE_LIMITS['players.json'] + 1));
      await assert.rejects(
        readNormalizedFplJson(filePath),
        /Local JSON input exceeds its byte limit: players\.json/
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects malformed JSON and invalid UTF-8 without exposing its directory', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'scoutiq-private-input-'));
    const filePath = path.join(directory, 'manifest.json');
    try {
      await writeFile(filePath, '{"schemaVersion":');
      const malformedError = await readError(readNormalizedFplJson(filePath));
      assert.match(malformedError, /not valid strict JSON: manifest\.json/);
      assert.doesNotMatch(malformedError, new RegExp(escapeRegExp(directory)));

      await writeFile(filePath, Buffer.from([0xc3, 0x28]));
      const utf8Error = await readError(readNormalizedFplJson(filePath));
      assert.match(utf8Error, /not valid strict JSON: manifest\.json/);
      assert.doesNotMatch(utf8Error, new RegExp(escapeRegExp(directory)));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects symlinked normalized FPL files', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'scoutiq-fpl-symlink-'));
    const target = path.join(directory, 'target.json');
    const link = path.join(directory, 'events.json');
    try {
      await writeFile(target, '[]');
      await symlink(target, link);
      await assert.rejects(
        readNormalizedFplJson(link),
        /regular non-symlink file: events\.json/
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

async function readError(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  assert.fail('Expected the promise to reject');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
