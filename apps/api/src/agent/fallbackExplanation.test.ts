import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildFallbackExplanation } from './fallbackExplanation';
import { RecommendationExplanationInput } from './schemas';

describe('deterministic recommendation explanation fallback', () => {
  it('summarizes optimizer output without adding recommendation decisions', () => {
    const input = explanationInputFixture();
    const explanation = buildFallbackExplanation(input, 'LLM provider is not configured.');

    assert.equal(explanation.provider, 'deterministic_fallback');
    assert.equal(explanation.usedFallback, true);
    assert.equal(explanation.fallbackReason, 'LLM provider is not configured.');
    assert.match(explanation.summary, /3-4-3/);
    assert.match(explanation.summary, /\+3 pts/);
    assert.ok(explanation.recommendedActions.some(action => action.includes('Captain Fwd A')));
    assert.ok(explanation.transferReasoning.some(reason => reason.includes('Def E to Upgrade Defender')));
  });

  it('reports missing prediction metadata and invalid constraints clearly', () => {
    const input = explanationInputFixture({
      predictionRunIds: [],
      targetGameweekId: undefined,
      startingXiConstraintValid: false
    });

    const explanation = buildFallbackExplanation(input);

    assert.ok(explanation.dataLimitations.some(entry => entry.includes('No prediction run id')));
    assert.ok(explanation.dataLimitations.some(entry => entry.includes('No target gameweek id')));
    assert.ok(explanation.risks.some(entry => entry.includes('Starting XI constraints are invalid')));
    assert.ok(explanation.constraintSummary.some(entry => entry.includes('Starting XI constraints failed')));
  });

  it('keeps player names grounded in the optimizer payload', () => {
    const input = explanationInputFixture();
    const explanation = buildFallbackExplanation(input);
    const allowedNames = new Set(collectInputPlayerNames(input));
    const explanationText = Object.values(explanation)
      .flatMap(value => Array.isArray(value) ? value : [value])
      .filter((value): value is string => typeof value === 'string')
      .join(' ');

    for (const name of ['Fwd A', 'Mid A', 'Def E', 'Upgrade Defender']) {
      assert.ok(allowedNames.has(name));
      assert.match(explanationText, new RegExp(name));
    }

    assert.doesNotMatch(explanationText, /Invented Player/);
  });
});

type FixtureOptions = {
  predictionRunIds?: number[];
  targetGameweekId?: number;
  startingXiConstraintValid?: boolean;
};

function explanationInputFixture(options: FixtureOptions = {}): RecommendationExplanationInput {
  const squad = squadFixture();
  const replacement = candidate(101, 'Upgrade Defender', 'DEF', 16, 5, 7);
  const squadAfterTransfers = {
    ...squad,
    bank: 1,
    slots: squad.slots.map(player => player.playerId === 15 ? { ...replacement, slotIndex: player.slotIndex } : player)
  };
  const startingXi = startingXiFixture(
    squad,
    options.startingXiConstraintValid ?? true
  );
  const transferStartingXi = startingXiFixture(squadAfterTransfers, true);

  const input: RecommendationExplanationInput = {
    startingXi,
    transferRecommendations: [
      {
        transferCount: 1,
        moves: [
          {
            playerOut: squad.slots[14],
            playerIn: replacement,
            predictedPointsDelta: 3,
            costDelta: 0
          }
        ],
        expectedPointsGain: 3,
        pointsHit: 0,
        netExpectedPointsGain: 3,
        budgetImpact: 0,
        bankAfterTransfers: 1,
        squadAfterTransfers,
        startingXi: transferStartingXi,
        validation: validationFixture(true)
      }
    ],
    predictionRunIds: options.predictionRunIds ?? [42],
    targetGameweekId: Object.prototype.hasOwnProperty.call(options, 'targetGameweekId')
      ? options.targetGameweekId
      : 3
  };

  return input;
}

function startingXiFixture(squad: ReturnType<typeof squadFixture>, valid: boolean) {
  return {
    formation: '3-4-3' as const,
    starters: squad.slots.slice(0, 11),
    bench: squad.slots.slice(11),
    captaincy: {
      captain: squad.slots[8],
      viceCaptain: squad.slots[4],
      captainPredictedPoints: squad.slots[8].predictedPoints,
      viceCaptainPredictedPoints: squad.slots[4].predictedPoints
    },
    totalPredictedPoints: squad.slots.slice(0, 11).reduce((total, player) => total + player.predictedPoints, 0),
    constraintSummary: validationFixture(valid)
  };
}

function squadFixture() {
  return {
    slots: [
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
      slot(14, 'Mid E', 'MID', 14, 6, 4.5),
      slot(15, 'Def E', 'DEF', 15, 4.5, 4)
    ],
    budget: 100,
    bank: 1
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
    availability: 'available' as const
  };
}

function candidate(
  playerId: number,
  playerName: string,
  position: 'GK' | 'DEF' | 'MID' | 'FWD',
  teamId: number,
  price: number,
  predictedPoints: number
) {
  return {
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
    availability: 'available' as const
  };
}

function validationFixture(valid: boolean) {
  return {
    valid,
    checks: [
      {
        key: 'starting_xi_size',
        passed: valid,
        expected: 11,
        actual: valid ? 11 : 10
      }
    ],
    violations: valid
      ? []
      : [
          {
            code: 'invalid_starting_xi_size' as const,
            key: 'starting_xi_size',
            expected: 11,
            actual: 10
          }
        ]
  };
}

function collectInputPlayerNames(input: RecommendationExplanationInput): string[] {
  return [
    ...input.startingXi.starters,
    ...input.startingXi.bench,
    ...input.transferRecommendations.flatMap(recommendation => [
      ...recommendation.moves.flatMap(move => [move.playerOut, move.playerIn]),
      ...recommendation.squadAfterTransfers.slots
    ])
  ].map(player => player.playerName);
}
