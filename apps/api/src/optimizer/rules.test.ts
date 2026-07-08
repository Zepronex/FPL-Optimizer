import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FPL_RULES, getFormation, validateSquad, validateStartingXi } from './rules';
import { PlayerCandidate, Squad, SquadSlot } from './types';

describe('optimizer FPL rules', () => {
  it('defines the supported squad and formation constraints', () => {
    assert.equal(FPL_RULES.squadSize, 15);
    assert.equal(FPL_RULES.startingXiSize, 11);
    assert.deepEqual(FPL_RULES.squadPositionCounts, { GK: 2, DEF: 5, MID: 5, FWD: 3 });
    assert.deepEqual(Object.keys(FPL_RULES.validFormations), [
      '3-4-3',
      '3-5-2',
      '4-4-2',
      '4-3-3',
      '4-5-1',
      '5-2-3',
      '5-3-2',
      '5-4-1'
    ]);
  });

  it('validates squad size, budget, position counts, and max 3 per team', () => {
    const squad = squadFixture();
    const result = validateSquad(squad);

    assert.equal(result.valid, true);
    assert.equal(result.violations.length, 0);
  });

  it('rejects squads over budget and over the team limit', () => {
    const players = squadSlots([
      ['GK', 1, 5.0],
      ['GK', 1, 4.5],
      ['DEF', 1, 6.0],
      ['DEF', 1, 5.5],
      ['DEF', 2, 5.0],
      ['DEF', 3, 4.5],
      ['DEF', 4, 4.5],
      ['MID', 5, 12.0],
      ['MID', 6, 11.0],
      ['MID', 7, 9.0],
      ['MID', 8, 8.0],
      ['MID', 9, 7.0],
      ['FWD', 10, 11.0],
      ['FWD', 11, 9.5],
      ['FWD', 12, 8.0]
    ]);
    const result = validateSquad({ slots: players, budget: 100, bank: 0 });

    assert.equal(result.valid, false);
    assert.deepEqual(result.violations.map(violation => violation.code), [
      'max_players_per_team',
      'invalid_budget'
    ]);
    assert.equal(result.violations[0].teamId, 1);
  });

  it('identifies valid formations and captaincy constraints', () => {
    const starters = squadFixture().slots.slice(0, 11);
    const bench = squadFixture().slots.slice(11);
    const formation = getFormation(starters);

    const result = validateStartingXi({
      starters,
      bench,
      captainId: starters[0].playerId,
      viceCaptainId: starters[1].playerId
    });

    assert.equal(formation, '4-5-1');
    assert.equal(result.valid, true);
  });

  it('accepts a 5-2-3 starting XI as a valid FPL formation', () => {
    const squad = squadFixture();
    const starters = [
      squad.slots[0],
      squad.slots[1],
      squad.slots[2],
      squad.slots[3],
      squad.slots[4],
      squad.slots[12],
      squad.slots[5],
      squad.slots[6],
      squad.slots[10],
      squad.slots[13],
      squad.slots[14]
    ];
    const bench = [squad.slots[11], squad.slots[7], squad.slots[8], squad.slots[9]];

    const result = validateStartingXi({
      starters,
      bench,
      captainId: starters[0].playerId,
      viceCaptainId: starters[1].playerId
    });

    assert.equal(getFormation(starters), '5-2-3');
    assert.equal(result.valid, true);
  });

  it('rejects a starting XI with more than one goalkeeper', () => {
    const squad = squadFixture();
    const starters = [
      squad.slots[0],
      squad.slots[11],
      ...squad.slots.slice(1, 10)
    ];
    const bench = squad.slots.slice(10, 11).concat(squad.slots.slice(12));

    const result = validateStartingXi({
      starters,
      bench,
      captainId: starters[0].playerId,
      viceCaptainId: starters[2].playerId
    });

    assert.equal(result.valid, false);
    assert.ok(result.violations.some(violation => violation.key === 'starting_xi_goalkeepers'));
  });

  it('rejects invalid captaincy when captain and vice captain are the same player', () => {
    const starters = squadFixture().slots.slice(0, 11);
    const result = validateStartingXi({
      starters,
      bench: squadFixture().slots.slice(11),
      captainId: starters[0].playerId,
      viceCaptainId: starters[0].playerId
    });

    assert.equal(result.valid, false);
    assert.equal(result.violations.at(-1)?.code, 'invalid_captaincy');
  });
});

function squadFixture(): Squad {
  return {
    slots: squadSlots([
      ['GK', 1, 5.0],
      ['DEF', 1, 6.0],
      ['DEF', 2, 5.5],
      ['DEF', 3, 5.0],
      ['DEF', 4, 4.5],
      ['MID', 5, 12.0],
      ['MID', 6, 10.0],
      ['MID', 7, 8.0],
      ['MID', 8, 7.0],
      ['MID', 9, 6.5],
      ['FWD', 10, 8.5],
      ['GK', 2, 4.0],
      ['DEF', 11, 4.0],
      ['FWD', 12, 6.5],
      ['FWD', 13, 5.5]
    ]),
    budget: 100,
    bank: 2
  };
}

function squadSlots(input: Array<[PlayerCandidate['position'], number, number]>): SquadSlot[] {
  return input.map(([position, teamId, price], index) => ({
    slotIndex: index,
    playerId: index + 1,
    playerName: `Player ${index + 1}`,
    position,
    teamId,
    teamName: `Team ${teamId}`,
    teamShortName: `T${teamId}`,
    price,
    predictedPoints: 10 - index / 10,
    availability: 'available'
  }));
}
