import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PlayerPrediction } from '../types';
import { predictionsToCandidates, toPlayerAvailability } from './predictionAdapter';

describe('prediction optimizer adapter', () => {
  it('aggregates per-fixture predictions into one player candidate', () => {
    const candidates = predictionsToCandidates([
      predictionFixture(1, 'Forward A', 'FWD', 5.25, 101),
      predictionFixture(1, 'Forward A', 'FWD', 4.75, 102),
      predictionFixture(2, 'Mid A', 'MID', 7, 103)
    ]);

    assert.equal(candidates.length, 2);
    assert.equal(candidates[0].playerName, 'Forward A');
    assert.equal(candidates[0].predictedPoints, 10);
    assert.equal(candidates[0].fixtureId, null);
    assert.equal(candidates[1].playerName, 'Mid A');
  });

  it('maps FPL status fields into optimizer availability', () => {
    assert.equal(toPlayerAvailability('a', 100), 'available');
    assert.equal(toPlayerAvailability('a', 50), 'doubtful');
    assert.equal(toPlayerAvailability('d', null), 'doubtful');
    assert.equal(toPlayerAvailability('i', null), 'unavailable');
    assert.equal(toPlayerAvailability('a', 0), 'unavailable');
  });
});

function predictionFixture(
  playerId: number,
  playerName: string,
  position: PlayerPrediction['position'],
  predictedPoints: number,
  fixtureId: number
): PlayerPrediction {
  return {
    id: fixtureId,
    predictionRunId: 42,
    playerId,
    playerName,
    position,
    teamId: playerId,
    teamName: `Team ${playerId}`,
    teamShortName: `T${playerId}`,
    price: position === 'FWD' ? 7.5 : 6.5,
    status: 'a',
    chanceOfPlayingNextRound: 100,
    chanceOfPlayingThisRound: 100,
    targetGameweekId: 4,
    fixtureId,
    predictedPoints,
    baselinePredictedPoints: null,
    confidence: null,
    uncertainty: null,
    sourceSnapshotHash: 'snapshot-a',
    featureSnapshotHash: null,
    featureValues: {},
    createdAt: '2026-08-14T18:00:00.000Z',
    updatedAt: '2026-08-14T18:05:00.000Z'
  };
}
