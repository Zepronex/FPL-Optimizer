import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  ExplainRecommendationRequestSchema,
  RecommendationExplanationCoreSchema,
  RecommendationExplanationJsonSchema
} from './schemas';

describe('recommendation explanation schemas', () => {
  it('validates optimizer-backed explanation input', () => {
    const parsed = ExplainRecommendationRequestSchema.parse({
      optimizerResult: {
        startingXi: startingXiFixture(),
        transferRecommendations: [],
        predictionRunIds: [42],
        targetGameweekId: 3
      }
    });

    assert.equal(parsed.optimizerResult.startingXi.formation, '3-4-3');
    assert.equal(parsed.optimizerResult.startingXi.starters.length, 11);
  });

  it('accepts optimizer display score metadata on explanation input', () => {
    const startingXi = startingXiFixture();
    const parsed = ExplainRecommendationRequestSchema.parse({
      optimizerResult: {
        startingXi: {
          ...startingXi,
          starters: startingXi.starters.map(player => ({ ...player, displayScore: displayScoreFixture() })),
          bench: startingXi.bench.map(player => ({ ...player, displayScore: displayScoreFixture() })),
          captaincy: {
            ...startingXi.captaincy,
            captain: { ...startingXi.captaincy.captain, displayScore: displayScoreFixture() },
            viceCaptain: { ...startingXi.captaincy.viceCaptain, displayScore: displayScoreFixture() }
          },
          rawExpectedPoints: 73,
          averagePlayerScoreOutOf10: 6.4,
          normalizedTeamScoreOutOf100: 64
        },
        transferRecommendations: [],
        predictionRunIds: [42],
        targetGameweekId: 3
      }
    });

    assert.equal(parsed.optimizerResult.startingXi.normalizedTeamScoreOutOf100, 64);
    assert.equal(parsed.optimizerResult.startingXi.starters[0].displayScore?.contextualScoreOutOf10, 6.4);
  });

  it('validates the local demo explanation request fixture', () => {
    const fixture = JSON.parse(readFileSync(resolveFixturePath(), 'utf8')) as unknown;
    const parsed = ExplainRecommendationRequestSchema.parse(fixture);

    assert.equal(parsed.optimizerResult.startingXi.starters.length, 11);
    assert.equal(parsed.optimizerResult.transferRecommendations.length, 1);
  });

  it('rejects unstructured explanation output', () => {
    const result = RecommendationExplanationCoreSchema.safeParse({
      summary: 'Valid summary',
      recommendedActions: ['Keep the optimizer recommendation.'],
      startingXiReasoning: [],
      captaincyReasoning: [],
      transferReasoning: [],
      risks: [],
      alternatives: [],
      dataLimitations: [],
      constraintSummary: [],
      disclaimer: 'The optimizer remains the source of truth.',
      freeform: 'not allowed'
    });

    assert.equal(result.success, false);
  });

  it('keeps the provider JSON schema aligned with the validated output keys', () => {
    const schemaKeys = Object.keys(RecommendationExplanationJsonSchema.properties).sort();
    const zodKeys = Object.keys(RecommendationExplanationCoreSchema.shape).sort();

    assert.deepEqual(schemaKeys, zodKeys);
    assert.deepEqual([...RecommendationExplanationJsonSchema.required].sort(), zodKeys);
  });
});

function resolveFixturePath(): string {
  const candidates = [
    path.resolve(process.cwd(), 'fixtures/agent/recommendation-explanation-request.json'),
    path.resolve(process.cwd(), '../../fixtures/agent/recommendation-explanation-request.json')
  ];
  const fixturePath = candidates.find(candidate => existsSync(candidate));
  assert.ok(fixturePath, 'Local demo explanation fixture was not found.');
  return fixturePath;
}

function startingXiFixture() {
  const players = [
    slot(1, 'Keeper A', 'GK', 1, 5, 5),
    slot(2, 'Def A', 'DEF', 2, 5, 6),
    slot(3, 'Def B', 'DEF', 3, 5, 5.5),
    slot(4, 'Def C', 'DEF', 4, 5, 5),
    slot(5, 'Mid A', 'MID', 5, 8, 8),
    slot(6, 'Mid B', 'MID', 6, 8, 7),
    slot(7, 'Mid C', 'MID', 7, 7, 6.5),
    slot(8, 'Mid D', 'MID', 8, 7, 6),
    slot(9, 'Fwd A', 'FWD', 9, 9, 9),
    slot(10, 'Fwd B', 'FWD', 10, 8, 8),
    slot(11, 'Fwd C', 'FWD', 11, 7, 7),
    slot(12, 'Keeper B', 'GK', 12, 4, 3),
    slot(13, 'Def D', 'DEF', 13, 4.5, 4),
    slot(14, 'Def E', 'DEF', 14, 4.5, 3.5),
    slot(15, 'Mid E', 'MID', 15, 6, 4.5)
  ];

  return {
    formation: '3-4-3',
    starters: players.slice(0, 11),
    bench: players.slice(11),
    captaincy: {
      captain: players[8],
      viceCaptain: players[4],
      captainPredictedPoints: 9,
      viceCaptainPredictedPoints: 8
    },
    totalPredictedPoints: 73,
    constraintSummary: validationFixture()
  };
}

function slot(
  playerId: number,
  playerName: string,
  position: 'GK' | 'DEF' | 'MID' | 'FWD',
  teamId: number,
  price: number,
  predictedPoints: number
) {
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
    predictionRunId: 42,
    targetGameweekId: 3,
    availability: 'available'
  };
}

function validationFixture() {
  return {
    valid: true,
    checks: [
      {
        key: 'starting_xi_size',
        passed: true,
        expected: 11,
        actual: 11
      }
    ],
    violations: []
  };
}

function displayScoreFixture() {
  return {
    rawExpectedPoints: 5,
    contextualScoreOutOf10: 6.4,
    positionPercentile: 64,
    positionPoolSize: 150
  };
}
