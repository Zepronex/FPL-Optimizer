import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OptimizerInputError } from './errors';
import { recommendTransfers } from './transfers';
import { PlayerCandidate, Squad, SquadSlot } from './types';

describe('transfer optimizer', () => {
  it('returns the best valid 1-transfer and 2-transfer recommendations', () => {
    const recommendations = recommendTransfers({
      currentSquad: squadFixture(),
      availablePlayers: availablePlayersFixture(),
      freeTransfers: 2
    });

    assert.equal(recommendations.length, 2);
    assert.equal(recommendations[0].transferCount, 1);
    assert.deepEqual(recommendations[0].moves.map(move => move.playerIn.playerName), ['Alpha Defender Upgrade']);
    assert.equal(recommendations[0].expectedPointsGain, 3);
    assert.equal(recommendations[0].pointsHit, 0);
    assert.equal(recommendations[0].netExpectedPointsGain, 3);
    assert.equal(recommendations[0].bankAfterTransfers, 0.5);
    assert.equal(recommendations[0].validation.valid, true);

    assert.equal(recommendations[1].transferCount, 2);
    assert.deepEqual(recommendations[1].moves.map(move => move.playerIn.playerName), [
      'Alpha Defender Upgrade',
      'Forward Upgrade'
    ]);
    assert.equal(recommendations[1].expectedPointsGain, 5);
    assert.equal(recommendations[1].bankAfterTransfers, 0);
    assert.equal(recommendations[1].validation.valid, true);
  });

  it('applies transfer-count and points-hit constraints', () => {
    const withoutHits = recommendTransfers({
      currentSquad: squadFixture(),
      availablePlayers: availablePlayersFixture(),
      freeTransfers: 1
    });
    const withOneHit = recommendTransfers({
      currentSquad: squadFixture(),
      availablePlayers: availablePlayersFixture(),
      freeTransfers: 1,
      maxHits: 1
    });

    assert.deepEqual(withoutHits.map(recommendation => recommendation.transferCount), [1]);
    assert.deepEqual(withOneHit.map(recommendation => recommendation.transferCount), [1, 2]);
    assert.equal(withOneHit[1].pointsHit, 4);
    assert.equal(withOneHit[1].netExpectedPointsGain, 1);
  });

  it('skips unaffordable, unavailable, duplicate, and invalid-team-limit candidates', () => {
    const recommendations = recommendTransfers({
      currentSquad: squadFixtureWithThreeTeamOnePlayers(),
      availablePlayers: [
        candidate(101, 'Unaffordable Forward', 'FWD', 14, 10.0, 12),
        candidate(102, 'Unavailable Forward', 'FWD', 14, 6.5, 12, 'unavailable'),
        candidate(103, 'Team Limit Forward', 'FWD', 1, 6.5, 12)
      ],
      freeTransfers: 1
    });

    assert.equal(recommendations.length, 0);
  });

  it('rejects invalid current squads', () => {
    assert.throws(
      () => recommendTransfers({
        currentSquad: { ...squadFixture(), slots: squadFixture().slots.slice(0, 14) },
        availablePlayers: availablePlayersFixture(),
        freeTransfers: 1
      }),
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

function squadFixtureWithThreeTeamOnePlayers(): Squad {
  const squad = squadFixture();
  return {
    ...squad,
    slots: squad.slots.map(slotValue =>
      slotValue.playerId === 8 ? { ...slotValue, teamId: 1, teamName: 'Team 1', teamShortName: 'T1' } : slotValue
    )
  };
}

function availablePlayersFixture(): PlayerCandidate[] {
  return [
    candidate(101, 'Alpha Defender Upgrade', 'DEF', 14, 5.5, 9),
    candidate(102, 'Beta Defender Upgrade', 'DEF', 15, 5.5, 8.5),
    candidate(103, 'Forward Upgrade', 'FWD', 16, 6.5, 10),
    candidate(104, 'Premium Forward', 'FWD', 17, 10.0, 12),
    candidate(15, 'Existing Forward', 'FWD', 13, 6.0, 12)
  ];
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

function candidate(
  playerId: number,
  playerName: string,
  position: PlayerCandidate['position'],
  teamId: number,
  price: number,
  predictedPoints: number,
  availability: PlayerCandidate['availability'] = 'available'
): PlayerCandidate {
  return {
    playerId,
    playerName,
    position,
    teamId,
    teamName: `Team ${teamId}`,
    teamShortName: `T${teamId}`,
    price,
    predictedPoints,
    availability
  };
}
