import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FetchLike, explainRecommendation } from './explanationService';
import { AgentConfig } from './config';
import { RecommendationExplanationCore, RecommendationExplanationInput } from './schemas';

describe('LLM recommendation explanation service', () => {
  it('uses deterministic fallback when the agent is disabled', async () => {
    const explanation = await explainRecommendation(explanationInputFixture(), {
      config: {
        enabled: false,
        provider: 'disabled',
        reason: 'agent_disabled'
      }
    });

    assert.equal(explanation.provider, 'deterministic_fallback');
    assert.equal(explanation.usedFallback, true);
    assert.match(explanation.fallbackReason ?? '', /disabled/);
    assert.equal(explanation.agentStatus.mode, 'deterministic_fallback');
    assert.equal(explanation.agentStatus.fallbackReasonCode, 'agent_disabled');
  });

  it('returns validated OpenAI structured output when configured', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetchImpl = jsonFetch(calls, {
      output_text: JSON.stringify(coreExplanationFixture())
    });

    const explanation = await explainRecommendation(explanationInputFixture(), {
      config: openAIConfigFixture(),
      fetchImpl
    });

    assert.equal(explanation.provider, 'openai');
    assert.equal(explanation.usedFallback, false);
    assert.equal(explanation.agentStatus.mode, 'live_provider');
    assert.equal(explanation.agentStatus.provider, 'openai');
    assert.equal(explanation.agentStatus.providerConfigured, true);
    assert.equal(calls[0].url, 'https://api.openai.test/v1/responses');
    const body = calls[0].body as OpenAIRequestBody;
    assert.equal(body.text.format.type, 'json_schema');
    assert.equal(body.text.format.strict, true);
  });

  it('uses Azure OpenAI chat completions with a strict JSON schema', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetchImpl = jsonFetch(calls, {
      choices: [
        {
          message: {
            content: JSON.stringify(coreExplanationFixture())
          }
        }
      ]
    });

    const explanation = await explainRecommendation(explanationInputFixture(), {
      config: azureConfigFixture(),
      fetchImpl
    });

    assert.equal(explanation.provider, 'azure_openai');
    assert.equal(explanation.usedFallback, false);
    assert.equal(explanation.agentStatus.mode, 'live_provider');
    assert.equal(explanation.agentStatus.provider, 'azure_openai');
    assert.equal(calls[0].url, 'https://azure.example/openai/v1/chat/completions');
    const body = calls[0].body as AzureOpenAIRequestBody;
    assert.equal(body.response_format.type, 'json_schema');
    assert.equal(body.response_format.json_schema.strict, true);
  });

  it('falls back when provider output fails schema validation', async () => {
    const fetchImpl = jsonFetch([], {
      output_text: JSON.stringify({
        summary: 'Missing required fields'
      })
    });

    const explanation = await explainRecommendation(explanationInputFixture(), {
      config: openAIConfigFixture(),
      fetchImpl
    });

    assert.equal(explanation.provider, 'deterministic_fallback');
    assert.equal(explanation.usedFallback, true);
    assert.equal(explanation.agentStatus.fallbackReasonCode, 'schema_validation_failed');
    assert.doesNotMatch(JSON.stringify(explanation), /test-key/);
  });

  it('falls back with a safe provider error reason when the provider request fails', async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: false,
      status: 503,
      json: async () => ({ error: 'raw provider detail' }),
      text: async () => 'raw provider detail'
    });

    const explanation = await explainRecommendation(explanationInputFixture(), {
      config: openAIConfigFixture(),
      fetchImpl
    });

    assert.equal(explanation.provider, 'deterministic_fallback');
    assert.equal(explanation.usedFallback, true);
    assert.equal(explanation.agentStatus.fallbackReasonCode, 'provider_error');
    assert.doesNotMatch(JSON.stringify(explanation), /raw provider detail/);
  });

  it('falls back when provider output references an unknown player id', async () => {
    const fetchImpl = jsonFetch([], {
      output_text: JSON.stringify({
        ...coreExplanationFixture(),
        risks: ['Player id 999 is a rotation risk.']
      })
    });

    const explanation = await explainRecommendation(explanationInputFixture(), {
      config: openAIConfigFixture(),
      fetchImpl
    });

    assert.equal(explanation.provider, 'deterministic_fallback');
    assert.equal(explanation.usedFallback, true);
    assert.equal(explanation.agentStatus.fallbackReasonCode, 'hallucination_guard_failed');
  });

  it('falls back when provider output references an unknown player name', async () => {
    const fetchImpl = jsonFetch([], {
      output_text: JSON.stringify({
        ...coreExplanationFixture(),
        risks: ['Invented Player is a rotation risk.']
      })
    });

    const explanation = await explainRecommendation(explanationInputFixture(), {
      config: openAIConfigFixture(),
      fetchImpl
    });

    assert.equal(explanation.provider, 'deterministic_fallback');
    assert.equal(explanation.usedFallback, true);
    assert.equal(explanation.agentStatus.fallbackReasonCode, 'hallucination_guard_failed');
  });
});

function jsonFetch(calls: Array<{ url: string; body: unknown }>, payload: unknown): FetchLike {
  return async (url, init) => {
    calls.push({
      url,
      body: JSON.parse(init.body)
    });

    return {
      ok: true,
      status: 200,
      json: async () => payload,
      text: async () => JSON.stringify(payload)
    };
  };
}

type OpenAIRequestBody = {
  text: {
    format: {
      type: string;
      strict: boolean;
    };
  };
};

type AzureOpenAIRequestBody = {
  response_format: {
    type: string;
    json_schema: {
      strict: boolean;
    };
  };
};

function openAIConfigFixture(): AgentConfig {
  return {
    enabled: true,
    provider: 'openai',
    apiKey: 'test-key',
    model: 'test-model',
    baseUrl: 'https://api.openai.test/v1',
    timeoutMs: 1000
  };
}

function azureConfigFixture(): AgentConfig {
  return {
    enabled: true,
    provider: 'azure_openai',
    apiKey: 'test-key',
    endpoint: 'https://azure.example',
    deployment: 'test-deployment',
    timeoutMs: 1000
  };
}

function coreExplanationFixture(): RecommendationExplanationCore {
  return {
    summary: 'The optimizer result is valid and projected well.',
    recommendedActions: ['Start the supplied XI and use the supplied captaincy.'],
    startingXiReasoning: ['The selected formation is the optimizer output.'],
    captaincyReasoning: ['Fwd A is captain because the optimizer output marks Fwd A as captain.'],
    transferReasoning: ['Def E to Upgrade Defender is the supplied top transfer option.'],
    risks: ['No additional optimizer risk was supplied.'],
    alternatives: ['No additional transfer alternatives were supplied.'],
    dataLimitations: ['Explanation quality depends on the supplied prediction payload.'],
    constraintSummary: ['Starting XI constraints passed.'],
    disclaimer: 'The optimizer remains the source of truth.'
  };
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
