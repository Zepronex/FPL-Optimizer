import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildDisplayScoreMap, decorateStartingXiScores } from './displayScores';
import { PlayerCandidate, SquadSlot, StartingXI } from './types';

describe('optimizer display scores', () => {
  it('uses a neutral contextual score when all position scores are equal', () => {
    const scores = buildDisplayScoreMap([
      player(1, 'GK', 2),
      player(2, 'GK', 2),
      player(3, 'GK', 2)
    ]);

    assert.equal(scores.get(1)?.contextualScoreOutOf10, 5);
    assert.equal(scores.get(2)?.contextualScoreOutOf10, 5);
    assert.equal(scores.get(3)?.contextualScoreOutOf10, 5);
  });

  it('keeps very low raw expected points comparable within position', () => {
    const scores = buildDisplayScoreMap([
      player(1, 'DEF', 0.1),
      player(2, 'DEF', 0.2),
      player(3, 'DEF', 0.3)
    ]);

    assert.equal(scores.get(1)?.contextualScoreOutOf10, 0);
    assert.equal(scores.get(2)?.contextualScoreOutOf10, 5);
    assert.equal(scores.get(3)?.contextualScoreOutOf10, 10);
  });

  it('keeps position comparisons separate', () => {
    const scores = buildDisplayScoreMap([
      player(1, 'GK', 5),
      player(2, 'GK', 6),
      player(3, 'FWD', 4),
      player(4, 'FWD', 5)
    ]);

    assert.equal(scores.get(1)?.contextualScoreOutOf10, 0);
    assert.equal(scores.get(4)?.contextualScoreOutOf10, 10);
  });

  it('handles missing prediction values without assigning fake scores', () => {
    const scores = buildDisplayScoreMap([
      { playerId: 1, position: 'MID' },
      player(2, 'MID', 3)
    ]);

    assert.equal(scores.get(1)?.rawExpectedPoints, null);
    assert.equal(scores.get(1)?.contextualScoreOutOf10, null);
    assert.equal(scores.get(2)?.contextualScoreOutOf10, 5);
  });

  it('adds team-level normalized scores without changing raw expected points', () => {
    const recommendation = decorateStartingXiScores(
      startingXiFixture(),
      Array.from({ length: 15 }, (_, index) => {
        const id = index + 1;
        if (id <= 2) return player(id, 'GK', 5);
        if (id <= 5) return player(id, 'DEF', 5);
        if (id <= 9) return player(id, 'MID', 5);
        return player(id, 'FWD', 5);
      })
    );

    assert.equal(recommendation.rawExpectedPoints, 32);
    assert.equal(recommendation.averagePlayerScoreOutOf10, 5);
    assert.equal(recommendation.normalizedTeamScoreOutOf100, 50);
    assert.equal(recommendation.starters[0].displayScore?.rawExpectedPoints, 5);
  });
});

function startingXiFixture(): StartingXI {
  const starters = [
    slot(1, 'GK', 5),
    slot(3, 'DEF', 1),
    slot(4, 'DEF', 2),
    slot(5, 'DEF', 3),
    slot(6, 'MID', 1),
    slot(7, 'MID', 2),
    slot(8, 'MID', 3),
    slot(9, 'MID', 4),
    slot(10, 'FWD', 1),
    slot(11, 'FWD', 2),
    slot(12, 'FWD', 8)
  ];
  const bench = [
    slot(2, 'GK', 6),
    slot(13, 'DEF', 4),
    slot(14, 'MID', 5),
    slot(15, 'FWD', 9)
  ];

  return {
    formation: '3-4-3',
    starters,
    bench,
    captaincy: {
      captain: starters[10],
      viceCaptain: starters[7],
      captainPredictedPoints: 8,
      viceCaptainPredictedPoints: 4
    },
    totalPredictedPoints: 32,
    constraintSummary: {
      valid: true,
      checks: [],
      violations: []
    }
  };
}

function slot(playerId: number, position: PlayerCandidate['position'], predictedPoints: number): SquadSlot {
  return {
    ...player(playerId, position, predictedPoints),
    playerName: `Player ${playerId}`,
    slotIndex: playerId - 1
  };
}

function player(playerId: number, position: PlayerCandidate['position'], predictedPoints: number): PlayerCandidate {
  return {
    playerId,
    playerName: `Player ${playerId}`,
    position,
    teamId: playerId,
    teamName: `Team ${playerId}`,
    teamShortName: `T${playerId}`,
    price: 5,
    predictedPoints,
    availability: 'available'
  };
}
