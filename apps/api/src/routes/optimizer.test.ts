import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import express from 'express';
import { QueryResult, QueryResultRow } from 'pg';
import { Queryable } from '../db/client';
import { buildSquadFromCandidates } from '../optimizer/squadBuilder';
import { boundDatabaseCandidates, createOptimizerRouter } from './optimizer';
import { MAX_AVAILABLE_PLAYERS } from './validation';

describe('optimizer route validation', () => {
  it('accepts a bounded, strict 15-player squad payload', async () => {
    const response = await postJson('/api/optimizer/starting-xi', {
      squad: squadInput()
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.startingXi.starters.length, 11);
  });

  it('rejects unknown fields and unexpected query parameters', async () => {
    const unknownBody = await postJson('/api/optimizer/starting-xi', {
      squad: squadInput(),
      unexpected: true
    });
    assert.equal(unknownBody.status, 400);

    const unknownQuery = await postJson('/api/optimizer/starting-xi?debug=true', {
      squad: squadInput()
    });
    assert.equal(unknownQuery.status, 400);
  });

  it('rejects coerced IDs, duplicate squad entries, and ambiguous squad forms', async () => {
    const coercedId = squadInput() as any;
    coercedId.slots[0].playerId = '1';
    assert.equal((await postJson('/api/optimizer/starting-xi', { squad: coercedId })).status, 400);

    const duplicateId = squadInput();
    duplicateId.slots[1].playerId = duplicateId.slots[0].playerId;
    assert.equal((await postJson('/api/optimizer/starting-xi', { squad: duplicateId })).status, 400);

    const ambiguous = {
      ...squadInput(),
      playerIds: Array.from({ length: 15 }, (_, index) => index + 1)
    };
    assert.equal((await postJson('/api/optimizer/starting-xi', { squad: ambiguous })).status, 400);
  });

  it('bounds transfer cost controls and available-player work', async () => {
    const currentSquad = squadInput();
    assert.equal((await postJson('/api/optimizer/transfers', {
      currentSquad,
      freeTransfers: 6
    })).status, 400);

    const oversizedPool = Array.from(
      { length: MAX_AVAILABLE_PLAYERS + 1 },
      (_, index) => candidate(1_000 + index, 'MID', 100 + index)
    );
    assert.equal((await postJson('/api/optimizer/transfers', {
      currentSquad,
      availablePlayers: oversizedPool,
      freeTransfers: 1,
      maxHits: 0
    })).status, 400);

    const duplicate = candidate(2_000, 'MID', 200);
    assert.equal((await postJson('/api/optimizer/transfers', {
      currentSquad,
      availablePlayers: [duplicate, duplicate],
      freeTransfers: 1,
      maxHits: 0
    })).status, 400);
  });

  it('rejects undersized squad pools and invalid reserved-bank ranges', async () => {
    const undersizedPool = squadInput().slots.slice(0, 14);
    assert.equal((await postJson('/api/optimizer/squad', {
      availablePlayers: undersizedPool,
      budget: 100
    })).status, 400);

    assert.equal((await postJson('/api/optimizer/squad', {
      budget: 100,
      reservedBank: 100
    })).status, 400);

    assert.equal((await postJson('/api/optimizer/squad', {
      budget: 0
    })).status, 400);
  });

  it('bounds DB-derived optimizer candidates while preserving required players and positions', () => {
    const positions = ['GK', 'DEF', 'MID', 'FWD'] as const;
    const databaseCandidates = Array.from({ length: 841 }, (_, index) => ({
      ...candidate(index + 1, positions[index % positions.length], (index % 20) + 1),
      predictedPoints: 100 - index / 10
    }));
    const requiredPlayerId = databaseCandidates.at(-1)?.playerId as number;

    const bounded = boundDatabaseCandidates(databaseCandidates, [requiredPlayerId]);

    assert.equal(bounded.length, MAX_AVAILABLE_PLAYERS);
    assert.ok(bounded.some(player => player.playerId === requiredPlayerId));
    assert.ok(bounded.filter(player => player.position === 'GK').length >= 2);
    assert.ok(bounded.filter(player => player.position === 'DEF').length >= 5);
    assert.ok(bounded.filter(player => player.position === 'MID').length >= 5);
    assert.ok(bounded.filter(player => player.position === 'FWD').length >= 3);
  });

  it('retains a feasible squad when 100 higher-projection DB candidates are unavailable', () => {
    const unavailable = Array.from({ length: 100 }, (_, index) => ({
      ...candidate(index + 1, 'MID', index + 1),
      predictedPoints: 100 - index / 100,
      availability: 'unavailable' as const
    }));
    const feasible = feasibleSquadCandidates(1_000, 5, 1);

    const bounded = boundDatabaseCandidates([...unavailable, ...feasible], [], { budget: 100 });
    const squad = buildSquadFromCandidates({ candidates: bounded, budget: 100 });

    assert.equal(bounded.length, MAX_AVAILABLE_PLAYERS);
    assert.ok(feasible.every(player => bounded.some(candidate => candidate.playerId === player.playerId)));
    assert.deepEqual(
      squad.slots.map(player => player.playerId).sort((left, right) => left - right),
      feasible.map(player => player.playerId).sort((left, right) => left - right)
    );
  });

  it('retains a feasible lower-priced squad under the requested budget and reserve', () => {
    const expensive = Array.from({ length: 100 }, (_, index) => ({
      ...candidate(index + 1, 'MID', index + 1),
      price: 25,
      predictedPoints: 100 - index / 100
    }));
    const feasible = feasibleSquadCandidates(2_000, 5, 1);

    const bounded = boundDatabaseCandidates([...expensive, ...feasible], [], {
      budget: 80,
      reservedBank: 5
    });
    const squad = buildSquadFromCandidates({
      candidates: bounded,
      budget: 80,
      reservedBank: 5
    });

    assert.equal(bounded.length, MAX_AVAILABLE_PLAYERS);
    assert.ok(feasible.every(player => bounded.some(candidate => candidate.playerId === player.playerId)));
    assert.ok(squad.bank >= 5);
    assert.equal(squad.slots.reduce((sum, player) => sum + player.price, 0), 75);
  });
});

async function postJson(routePath: string, body: unknown) {
  const app = express();
  app.use(express.json());
  app.use('/api/optimizer', createOptimizerRouter(failingClient()));

  const server = app.listen(0);
  const address = server.address() as AddressInfo;

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${routePath}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    return {
      status: response.status,
      body: await response.json()
    };
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

function failingClient(): Queryable {
  return {
    async query<T extends QueryResultRow = QueryResultRow>(): Promise<QueryResult<T>> {
      throw new Error('Database access was not expected for this optimizer route test');
    }
  };
}

function squadInput() {
  const positions = [
    'GK', 'GK',
    'DEF', 'DEF', 'DEF', 'DEF', 'DEF',
    'MID', 'MID', 'MID', 'MID', 'MID',
    'FWD', 'FWD', 'FWD'
  ] as const;
  return {
    slots: positions.map((position, index) => ({
      ...candidate(index + 1, position, index + 1),
      ...(index === 0 ? {
        displayScore: {
          rawExpectedPoints: 5,
          contextualScoreOutOf10: 6,
          positionPercentile: 60,
          positionPoolSize: 100
        }
      } : {})
    })),
    bank: 25,
    budget: 100
  };
}

function candidate(
  playerId: number,
  position: 'GK' | 'DEF' | 'MID' | 'FWD',
  teamId: number
) {
  return {
    playerId,
    playerName: `Player ${playerId}`,
    position,
    teamId,
    teamName: `Team ${teamId}`,
    teamShortName: `T${teamId}`,
    price: 5,
    predictedPoints: 10 - (playerId % 5),
    predictionRunId: 42,
    targetGameweekId: 3,
    availability: 'available' as const
  };
}

function feasibleSquadCandidates(firstPlayerId: number, price: number, firstTeamId: number) {
  const positions = [
    'GK', 'GK',
    'DEF', 'DEF', 'DEF', 'DEF', 'DEF',
    'MID', 'MID', 'MID', 'MID', 'MID',
    'FWD', 'FWD', 'FWD'
  ] as const;
  return positions.map((position, index) => ({
    ...candidate(firstPlayerId + index, position, firstTeamId + index),
    price,
    predictedPoints: 1 + index / 100
  }));
}
