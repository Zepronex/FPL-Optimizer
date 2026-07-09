import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSquadFromCandidates } from './squadBuilder';
import { PlayerCandidate } from './types';

describe('squad builder', () => {
  it('builds a valid 15-player squad under budget and team limits', () => {
    const squad = buildSquadFromCandidates({
      candidates: candidatesFixture(),
      budget: 100
    });

    assert.equal(squad.slots.length, 15);
    assert.equal(squad.bank >= 0, true);
    assert.deepEqual(countPositions(squad.slots), { GK: 2, DEF: 5, MID: 5, FWD: 3 });
    assert.equal(Math.max(...countTeams(squad.slots).values()) <= 3, true);
  });

  it('keeps a requested reserve bank when generating a squad', () => {
    const squad = buildSquadFromCandidates({
      candidates: candidatesFixture(),
      budget: 100,
      reservedBank: 2
    });

    assert.equal(squad.bank >= 2, true);
  });
});

function candidatesFixture(): PlayerCandidate[] {
  return [
    candidate(1, 'Keeper A', 'GK', 1, 5.0, 8),
    candidate(2, 'Keeper B', 'GK', 2, 4.5, 7),
    candidate(3, 'Keeper C', 'GK', 3, 4.0, 2),
    candidate(4, 'Def A', 'DEF', 1, 6.0, 9),
    candidate(5, 'Def B', 'DEF', 2, 5.5, 8),
    candidate(6, 'Def C', 'DEF', 3, 5.0, 7),
    candidate(7, 'Def D', 'DEF', 4, 4.5, 6),
    candidate(8, 'Def E', 'DEF', 5, 4.0, 5),
    candidate(9, 'Def F', 'DEF', 6, 4.0, 4),
    candidate(10, 'Mid A', 'MID', 7, 12.0, 10),
    candidate(11, 'Mid B', 'MID', 8, 10.0, 9),
    candidate(12, 'Mid C', 'MID', 9, 8.0, 8),
    candidate(13, 'Mid D', 'MID', 10, 7.0, 7),
    candidate(14, 'Mid E', 'MID', 11, 6.5, 6),
    candidate(15, 'Mid F', 'MID', 12, 5.0, 4),
    candidate(16, 'Fwd A', 'FWD', 13, 9.0, 10),
    candidate(17, 'Fwd B', 'FWD', 14, 8.0, 9),
    candidate(18, 'Fwd C', 'FWD', 15, 7.0, 8),
    candidate(19, 'Fwd D', 'FWD', 16, 5.5, 4)
  ];
}

function candidate(
  playerId: number,
  playerName: string,
  position: PlayerCandidate['position'],
  teamId: number,
  price: number,
  predictedPoints: number
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
    availability: 'available'
  };
}

function countPositions(players: readonly PlayerCandidate[]): Record<PlayerCandidate['position'], number> {
  return players.reduce<Record<PlayerCandidate['position'], number>>(
    (counts, player) => ({
      ...counts,
      [player.position]: counts[player.position] + 1
    }),
    { GK: 0, DEF: 0, MID: 0, FWD: 0 }
  );
}

function countTeams(players: readonly PlayerCandidate[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const player of players) {
    counts.set(player.teamId, (counts.get(player.teamId) ?? 0) + 1);
  }
  return counts;
}
