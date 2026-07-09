import { AgentConfig, readAgentConfig } from './config';
import { buildFallbackExplanation } from './fallbackExplanation';
import {
  AgentFallbackReasonCode,
  RecommendationExplanation,
  RecommendationExplanationCore,
  RecommendationExplanationCoreSchema,
  RecommendationExplanationInput,
  RecommendationExplanationJsonSchema,
  RecommendationExplanationSchema
} from './schemas';

export const RECOMMENDATION_EXPLANATION_SYSTEM_PROMPT = [
  'You explain existing optimizer results. You do not create recommendations.',
  'The deterministic optimizer is the source of truth.',
  'Do not choose players, invent player names, invent player ids, change transfers, change captaincy, or override constraints.',
  'Use only the supplied optimizer result JSON. If information is missing, state that limitation.',
  'Return only structured JSON matching the provided schema.'
].join(' ');

type FetchResponseLike = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

export type FetchLike = (
  url: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  }
) => Promise<FetchResponseLike>;

type ExplanationServiceOptions = {
  config?: AgentConfig;
  fetchImpl?: FetchLike;
};

const RESPONSE_FORMAT_NAME = 'scoutiq_recommendation_explanation';

class AgentExplanationFailure extends Error {
  constructor(readonly reasonCode: AgentFallbackReasonCode) {
    super(reasonCode);
  }
}

export async function explainRecommendation(
  input: RecommendationExplanationInput,
  options: ExplanationServiceOptions = {}
): Promise<RecommendationExplanation> {
  const config = options.config ?? readAgentConfig();
  if (!config.enabled) {
    return buildFallbackExplanation(input, fallbackReasonMessage(config.reason), {
      fallbackReasonCode: config.reason,
      providerConfigured: false
    });
  }

  const fetchImpl = options.fetchImpl ?? defaultFetch;

  try {
    const core = config.provider === 'azure_openai'
      ? await requestAzureOpenAIExplanation(input, config, fetchImpl)
      : await requestOpenAIExplanation(input, config, fetchImpl);

    validateGroundedPlayerReferences(core, input);

    return RecommendationExplanationSchema.parse({
      ...core,
      provider: config.provider,
      usedFallback: false,
      agentStatus: {
        mode: 'live_provider',
        provider: config.provider,
        providerConfigured: true,
        message: providerSuccessMessage(config.provider)
      }
    });
  } catch (error) {
    const reasonCode = fallbackReasonCodeForError(error);
    return buildFallbackExplanation(input, fallbackReasonMessage(reasonCode), {
      fallbackReasonCode: reasonCode,
      providerConfigured: true
    });
  }
}

async function requestOpenAIExplanation(
  input: RecommendationExplanationInput,
  config: Extract<AgentConfig, { provider: 'openai' }>,
  fetchImpl: FetchLike
): Promise<RecommendationExplanationCore> {
  const payload = {
    model: config.model,
    instructions: RECOMMENDATION_EXPLANATION_SYSTEM_PROMPT,
    input: buildUserPrompt(input),
    text: {
      format: {
        type: 'json_schema',
        name: RESPONSE_FORMAT_NAME,
        strict: true,
        schema: RecommendationExplanationJsonSchema
      }
    }
  };

  const response = await fetchWithTimeout(`${config.baseUrl}/responses`, {
    fetchImpl,
    timeoutMs: config.timeoutMs,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: payload
  });

  return parseOpenAIResponse(response);
}

async function requestAzureOpenAIExplanation(
  input: RecommendationExplanationInput,
  config: Extract<AgentConfig, { provider: 'azure_openai' }>,
  fetchImpl: FetchLike
): Promise<RecommendationExplanationCore> {
  const payload = {
    model: config.deployment,
    messages: [
      {
        role: 'system',
        content: RECOMMENDATION_EXPLANATION_SYSTEM_PROMPT
      },
      {
        role: 'user',
        content: buildUserPrompt(input)
      }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: RESPONSE_FORMAT_NAME,
        strict: true,
        schema: RecommendationExplanationJsonSchema
      }
    }
  };

  const response = await fetchWithTimeout(`${azureBaseUrl(config.endpoint)}/chat/completions`, {
    fetchImpl,
    timeoutMs: config.timeoutMs,
    headers: {
      'api-key': config.apiKey,
      'Content-Type': 'application/json'
    },
    body: payload
  });

  return parseAzureOpenAIResponse(response);
}

async function fetchWithTimeout(
  url: string,
  options: {
    fetchImpl: FetchLike;
    timeoutMs: number;
    headers: Record<string, string>;
    body: unknown;
  }
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await options.fetchImpl(url, {
      method: 'POST',
      headers: options.headers,
      body: JSON.stringify(options.body),
      signal: controller.signal
    });

    if (!response.ok) {
      await response.text().catch(() => '');
      throw new Error(`provider_http_${response.status}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function parseOpenAIResponse(value: unknown): RecommendationExplanationCore {
  const directOutput = readStringProperty(value, 'output_text');
  if (directOutput) {
    return parseExplanationJson(directOutput);
  }

  const output = readArrayProperty(value, 'output');
  for (const item of output) {
    const content = readArrayProperty(item, 'content');
    for (const contentItem of content) {
      const text = readStringProperty(contentItem, 'text');
      if (text) {
        return parseExplanationJson(text);
      }
    }
  }

  throw new Error('missing_openai_output_text');
}

function parseAzureOpenAIResponse(value: unknown): RecommendationExplanationCore {
  const choices = readArrayProperty(value, 'choices');
  const firstChoice = choices[0];
  const message = readObjectProperty(firstChoice, 'message');
  const content = readStringProperty(message, 'content');
  if (!content) {
    throw new Error('missing_azure_output_text');
  }

  return parseExplanationJson(content);
}

function parseExplanationJson(value: string): RecommendationExplanationCore {
  try {
    return RecommendationExplanationCoreSchema.parse(JSON.parse(value));
  } catch {
    throw new AgentExplanationFailure('schema_validation_failed');
  }
}

function buildUserPrompt(input: RecommendationExplanationInput): string {
  return [
    'Explain this optimizer result.',
    'Every player reference must use only the supplied playerName and playerId values.',
    JSON.stringify(input)
  ].join('\n\n');
}

function validateGroundedPlayerReferences(
  explanation: RecommendationExplanationCore,
  input: RecommendationExplanationInput
): void {
  const allowedPlayerIds = new Set(collectPlayerIds(input));
  const allowedPlayerNames = new Set(collectPlayerNames(input).map(normalizePlayerName));
  const explanationText = Object.values(explanation)
    .flatMap(value => Array.isArray(value) ? value : [value])
    .join(' ');
  const referencedPlayerIds = [...explanationText.matchAll(/\b(?:player\s*id|playerId|player\s*#|id)\s*:?\s*#?(\d+)\b/gi)]
    .map(match => Number(match[1]));

  const unknownPlayerIds = referencedPlayerIds.filter(playerId => !allowedPlayerIds.has(playerId));
  if (unknownPlayerIds.length > 0) {
    throw new AgentExplanationFailure('hallucination_guard_failed');
  }

  const referencedPlayerNames = extractPotentialPlayerNames(explanationText);
  const unknownPlayerNames = referencedPlayerNames
    .map(normalizePlayerName)
    .filter(playerName => !allowedPlayerNames.has(playerName));
  if (unknownPlayerNames.length > 0) {
    throw new AgentExplanationFailure('hallucination_guard_failed');
  }
}

function collectPlayerIds(input: RecommendationExplanationInput): number[] {
  return [
    ...input.startingXi.starters,
    ...input.startingXi.bench,
    ...input.transferRecommendations.flatMap(recommendation => [
      ...recommendation.moves.flatMap(move => [move.playerOut, move.playerIn]),
      ...recommendation.squadAfterTransfers.slots,
      ...recommendation.startingXi.starters,
      ...recommendation.startingXi.bench
    ])
  ].map(player => player.playerId);
}

function collectPlayerNames(input: RecommendationExplanationInput): string[] {
  return [
    ...input.startingXi.starters,
    ...input.startingXi.bench,
    ...input.transferRecommendations.flatMap(recommendation => [
      ...recommendation.moves.flatMap(move => [move.playerOut, move.playerIn]),
      ...recommendation.squadAfterTransfers.slots,
      ...recommendation.startingXi.starters,
      ...recommendation.startingXi.bench
    ])
  ].map(player => player.playerName);
}

function extractPotentialPlayerNames(value: string): string[] {
  const candidates = [
    ...extractRegexGroupMatches(
      value,
      /\b(?:player\s*name|playerName|name)\s*:?\s*["']?([A-Z][A-Za-z'.-]*(?:\s+[A-Z][A-Za-z'.-]*){0,3})["']?/g
    ),
    ...extractRegexGroupMatches(
      value,
      /\b([A-Z][A-Za-z'.-]*(?:\s+[A-Z][A-Za-z'.-]*){0,3})\s+(?:is|was|starts|sits|replaces|drops|offers|projects|faces)\b/g
    ),
    ...extractRegexGroupMatches(
      value,
      /\bto\s+([A-Z][A-Za-z'.-]*(?:\s+[A-Z][A-Za-z'.-]*){0,3})\b/g
    )
  ];

  return [...new Set(candidates.filter(isPotentialPlayerName))];
}

function extractRegexGroupMatches(value: string, pattern: RegExp): string[] {
  return [...value.matchAll(pattern)]
    .map(match => match[1]?.trim())
    .filter((match): match is string => Boolean(match));
}

function isPotentialPlayerName(value: string): boolean {
  const normalized = normalizePlayerName(value);
  return normalized.length > 0 && !NON_PLAYER_REFERENCE_WORDS.has(normalized);
}

function normalizePlayerName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

const NON_PLAYER_REFERENCE_WORDS = new Set([
  'alternative',
  'alternatives',
  'bank',
  'bench',
  'budget',
  'captain',
  'captaincy',
  'constraint',
  'constraints',
  'data',
  'expected',
  'explanation',
  'formation',
  'gameweek',
  'net',
  'no',
  'optimizer',
  'player',
  'players',
  'prediction',
  'recommendation',
  'risk',
  'risks',
  'squad',
  'starting',
  'starting xi',
  'the',
  'this',
  'transfer',
  'transfers',
  'vice captain'
]);

function fallbackReasonCodeForError(error: unknown): AgentFallbackReasonCode {
  if (error instanceof AgentExplanationFailure) {
    return error.reasonCode;
  }

  return 'provider_error';
}

function fallbackReasonMessage(reason: AgentFallbackReasonCode): string {
  switch (reason) {
    case 'agent_disabled':
      return 'Explanation agent is disabled; deterministic fallback used.';
    case 'missing_openai_config':
      return 'OpenAI explanation provider is not fully configured; deterministic fallback used.';
    case 'missing_azure_openai_config':
      return 'Azure OpenAI explanation provider is not fully configured; deterministic fallback used.';
    case 'missing_provider_config':
      return 'No explanation provider is fully configured; deterministic fallback used.';
    case 'provider_error':
      return 'Live explanation provider was unavailable; deterministic fallback used.';
    case 'schema_validation_failed':
      return 'Provider response failed schema validation; deterministic fallback used.';
    case 'hallucination_guard_failed':
      return 'Provider response failed grounding checks; deterministic fallback used.';
  }
}

function providerSuccessMessage(provider: Extract<AgentConfig, { enabled: true }>['provider']): string {
  switch (provider) {
    case 'openai':
      return 'Explanation generated by the configured OpenAI provider.';
    case 'azure_openai':
      return 'Explanation generated by the configured Azure OpenAI provider.';
  }
}

function azureBaseUrl(endpoint: string): string {
  return endpoint.endsWith('/openai/v1') ? endpoint : `${endpoint}/openai/v1`;
}

function readObjectProperty(value: unknown, key: string): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) return null;
  const entry = (value as Record<string, unknown>)[key];
  return typeof entry === 'object' && entry !== null ? entry as Record<string, unknown> : null;
}

function readArrayProperty(value: unknown, key: string): unknown[] {
  if (typeof value !== 'object' || value === null) return [];
  const entry = (value as Record<string, unknown>)[key];
  return Array.isArray(entry) ? entry : [];
}

function readStringProperty(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const entry = (value as Record<string, unknown>)[key];
  return typeof entry === 'string' && entry.trim() ? entry : null;
}

const defaultFetch: FetchLike = (url, init) => {
  return fetch(url, init);
};
