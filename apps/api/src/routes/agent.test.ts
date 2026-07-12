import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import { afterEach, describe, it } from 'node:test';
import express from 'express';
import { createAgentRouter } from './agent';
import { buildFallbackExplanation } from '../agent/fallbackExplanation';
import { RecommendationExplanationInput } from '../agent/schemas';

const envSnapshot = { ...process.env };

afterEach(() => {
  process.env = { ...envSnapshot };
});

describe('agent explanation route', () => {
  it('returns safe fallback status without an API key', async () => {
    process.env.SCOUTIQ_AGENT_ENABLED = 'true';
    process.env.SCOUTIQ_AGENT_PROVIDER = 'auto';
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
    delete process.env.AZURE_OPENAI_API_KEY;
    delete process.env.AZURE_OPENAI_ENDPOINT;
    delete process.env.AZURE_OPENAI_DEPLOYMENT;

    const response = await getJson(createAgentRouter(), '/api/agent/status');

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.enabled, true);
    assert.equal(response.body.data.provider, null);
    assert.equal(response.body.data.requiredConfigPresent, false);
    assert.equal(response.body.data.activeMode, 'deterministic_fallback');
    assert.equal(response.body.data.fallbackReasonCode, 'missing_provider_config');
  });

  it('returns safe provider-ready status when OpenAI config is present', async () => {
    process.env.SCOUTIQ_AGENT_ENABLED = 'true';
    process.env.SCOUTIQ_AGENT_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'unit-test-openai-placeholder';
    process.env.OPENAI_MODEL = 'gpt-test-model';

    const response = await getJson(createAgentRouter(), '/api/agent/status');
    const responseText = JSON.stringify(response.body);

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.enabled, true);
    assert.equal(response.body.data.providerPreference, 'openai');
    assert.equal(response.body.data.provider, 'openai');
    assert.equal(response.body.data.requiredConfigPresent, true);
    assert.equal(response.body.data.activeMode, 'provider_ready');
    assert.equal(response.body.data.model, 'gpt-test-model');
    assert.doesNotMatch(responseText, /unit-test-openai-placeholder/);
  });

  it('returns deterministic fallback when no provider is configured', async () => {
    process.env.SCOUTIQ_AGENT_ENABLED = 'false';
    delete process.env.OPENAI_API_KEY;
    delete process.env.AZURE_OPENAI_API_KEY;

    const response = await postJson(createAgentRouter(), {
      optimizerResult: explanationInputFixture()
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.provider, 'deterministic_fallback');
    assert.equal(response.body.data.usedFallback, true);
    assert.equal(response.body.data.agentStatus.mode, 'deterministic_fallback');
    assert.equal(response.body.data.agentStatus.fallbackReasonCode, 'agent_disabled');
  });

  it('passes valid optimizer payloads to the explanation service', async () => {
    const response = await postJson(createAgentRouter({
      explainRecommendation: async input => buildFallbackExplanation(input, 'Injected service used.')
    }), {
      optimizerResult: explanationInputFixture()
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.fallbackReason, 'Injected service used.');
  });

  it('rejects invalid optimizer payloads cleanly', async () => {
    const response = await postJson(createAgentRouter(), {
      optimizerResult: {
        transferRecommendations: []
      }
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error, 'invalid_agent_request');
    assert.equal(typeof response.body.details[0].message, 'string');
  });

  it('rejects unknown query and body fields', async () => {
    const queryResponse = await getJson(createAgentRouter({
      readAgentStatus: () => ({
        enabled: false,
        providerPreference: 'auto',
        provider: null,
        requiredConfigPresent: false,
        activeMode: 'deterministic_fallback',
        fallbackReasonCode: 'agent_disabled',
        model: null
      })
    }), '/api/agent/status?extra=1');
    assert.equal(queryResponse.status, 400);

    const bodyResponse = await postJson(createAgentRouter(), {
      optimizerResult: explanationInputFixture(),
      unexpected: true
    });
    assert.equal(bodyResponse.status, 400);
  });

  it('rejects duplicate metadata, oversized names, and numeric strings', async () => {
    const duplicateRunIds = explanationInputFixture();
    duplicateRunIds.predictionRunIds = [42, 42];
    assert.equal((await postJson(createAgentRouter(), {
      optimizerResult: duplicateRunIds
    })).status, 400);

    const oversizedName = explanationInputFixture();
    oversizedName.startingXi.starters[0].playerName = 'x'.repeat(101);
    assert.equal((await postJson(createAgentRouter(), {
      optimizerResult: oversizedName
    })).status, 400);

    const numericString = explanationInputFixture() as any;
    numericString.startingXi.starters[0].playerId = '1';
    assert.equal((await postJson(createAgentRouter(), {
      optimizerResult: numericString
    })).status, 400);
  });
});

async function postJson(router: ReturnType<typeof createAgentRouter>, body: unknown) {
  const app = express();
  app.use(express.json());
  app.use('/api/agent', router);

  const server = app.listen(0);
  const address = server.address() as AddressInfo;

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/agent/explain-recommendation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
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

async function getJson(router: ReturnType<typeof createAgentRouter>, path: string) {
  const app = express();
  app.use(express.json());
  app.use('/api/agent', router);

  const server = app.listen(0);
  const address = server.address() as AddressInfo;

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`);

    return {
      status: response.status,
      body: await response.json()
    };
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

function explanationInputFixture(): RecommendationExplanationInput {
  const squad = squadFixture();
  const replacement = candidate(101, 'Upgrade Defender', 'DEF', 16, 5, 7);
  const squadAfterTransfers = {
    ...squad,
    bank: 1,
    slots: squad.slots.map(player => player.playerId === 15 ? { ...replacement, slotIndex: player.slotIndex } : player)
  };

  return {
    startingXi: startingXiFixture(squad),
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
        startingXi: startingXiFixture(squadAfterTransfers),
        validation: validationFixture()
      }
    ],
    predictionRunIds: [42],
    targetGameweekId: 3
  };
}

function startingXiFixture(squad: ReturnType<typeof squadFixture>) {
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
    constraintSummary: validationFixture()
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
