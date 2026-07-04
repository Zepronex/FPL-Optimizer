import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OptimizerInputError } from './errors';
import { optimizeStartingXi } from './startingXi';
import { PlayerCandidate, Squad, SquadSlot } from './types';

describe('starting XI optimizer', () => {
  it('selects the highest projected valid formation and captaincy', () => {
    const result = optimizeStartingXi(squadFixture());

    assert.equal(result.formation, '3-4-3');
    assert.deepEqual(result.starters.map(player => player.playerName), [
      'Keeper A',
      'Def A',
      'Def B',
      'Def C',
      'Mid A',
      'Mid B',
      'Mid C',
      'Mid D',
      'Fwd A',
      'Fwd B',
      'Fwd C'
    ]);
    assert.deepEqual(result.bench.map(player => player.playerName), ['Mid E', 'Def D', 'Def E', 'Keeper B']);
    assert.equal(result.captaincy.captain.playerName, 'Fwd A');
    assert.equal(result.captaincy.viceCaptain.playerName, 'Mid A');
    assert.equal(result.totalPredictedPoints, 101);
    assert.equal(result.constraintSummary.valid, true);
  });

  it('uses deterministic player and formation tie-breakers', () => {
    const result = optimizeStartingXi(tieFixture());

    assert.equal(result.formation, '3-4-3');
    assert.deepEqual(result.starters.map(player => player.playerName), [
      'Alpha Keeper',
      'Alpha Defender',
      'Beta Defender',
      'Delta Defender',
      'Alpha Mid',
      'Beta Mid',
      'Delta Mid',
      'Epsilon Mid',
      'Alpha Forward',
      'Beta Forward',
      'Delta Forward'
    ]);
    assert.equal(result.captaincy.captain.playerName, 'Alpha Defender');
    assert.equal(result.captaincy.viceCaptain.playerName, 'Alpha Forward');
  });

  it('rejects invalid squads before producing recommendations', () => {
    const invalidSquad = {
      ...squadFixture(),
      slots: squadFixture().slots.slice(0, 14)
    };

    assert.throws(
      () => optimizeStartingXi(invalidSquad),
      (error: unknown) => error instanceof OptimizerInputError && error.code === 'invalid_squad'
    );
  });
});

function squadFixture(): Squad {
  return {
    slots: [
      slot(1, 'Keeper A', 'GK', 1, 5.0, 7),
      slot(2, 'Keeper B', 'GK', 2, 4.0, 3),
      slot(3, 'Def A', 'DEF', 1, 6.0, 8),
      slot(4, 'Def B', 'DEF', 2, 5.5, 7),
      slot(5, 'Def C', 'DEF', 3, 5.0, 6),
      slot(6, 'Def D', 'DEF', 4, 4.5, 2),
      slot(7, 'Def E', 'DEF', 5, 4.0, 1),
      slot(8, 'Mid A', 'MID', 6, 12.0, 10),
      slot(9, 'Mid B', 'MID', 7, 10.0, 9),
      slot(10, 'Mid C', 'MID', 8, 8.0, 8),
      slot(11, 'Mid D', 'MID', 9, 7.0, 7),
      slot(12, 'Mid E', 'MID', 10, 6.5, 4),
      slot(13, 'Fwd A', 'FWD', 11, 8.5, 11),
      slot(14, 'Fwd B', 'FWD', 12, 7.0, 9),
      slot(15, 'Fwd C', 'FWD', 13, 6.0, 8)
    ],
    budget: 100,
    bank: 1
  };
}

function tieFixture(): Squad {
  const players = [
    slot(1, 'Alpha Keeper', 'GK', 1, 4.5, 5),
    slot(2, 'Beta Keeper', 'GK', 2, 4.5, 5),
    slot(3, 'Alpha Defender', 'DEF', 3, 5.0, 6),
    slot(4, 'Beta Defender', 'DEF', 4, 5.0, 6),
    slot(5, 'Delta Defender', 'DEF', 5, 5.0, 6),
    slot(6, 'Epsilon Defender', 'DEF', 6, 5.0, 6),
    slot(7, 'Gamma Defender', 'DEF', 7, 5.0, 6),
    slot(8, 'Alpha Mid', 'MID', 8, 7.0, 6),
    slot(9, 'Beta Mid', 'MID', 9, 7.0, 6),
    slot(10, 'Delta Mid', 'MID', 10, 7.0, 6),
    slot(11, 'Epsilon Mid', 'MID', 11, 7.0, 6),
    slot(12, 'Gamma Mid', 'MID', 12, 7.0, 6),
    slot(13, 'Alpha Forward', 'FWD', 13, 7.0, 6),
    slot(14, 'Beta Forward', 'FWD', 14, 7.0, 6),
    slot(15, 'Delta Forward', 'FWD', 15, 7.0, 6)
  ];

  return {
    slots: players,
    budget: 100,
    bank: 9.5
  };
}

function slot(
  playerId: number,
  playerName: string,
  position: PlayerCandidate['position'],
  teamId: number,
  price: number,
  predictedPoints: number
): SquadSlot {
  return {
    slotIndex: playerId - 1,
    playerId,
    playerName,
    position,
    teamId,
    teamName: `Team ${teamId}`,
    teamShortName: `T${teamId}`,
    price,
    predictedPoints,
    availability: 'available'
  };
}
