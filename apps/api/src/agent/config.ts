export type AgentProvider = 'openai' | 'azure_openai';

export type DisabledAgentConfig = {
  enabled: false;
  provider: 'disabled';
  reason: 'agent_disabled' | 'missing_openai_config' | 'missing_azure_openai_config' | 'missing_provider_config';
};

export type OpenAIAgentConfig = {
  enabled: true;
  provider: 'openai';
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
};

export type AzureOpenAIAgentConfig = {
  enabled: true;
  provider: 'azure_openai';
  apiKey: string;
  endpoint: string;
  deployment: string;
  timeoutMs: number;
};

export type AgentConfig = DisabledAgentConfig | OpenAIAgentConfig | AzureOpenAIAgentConfig;

type ProviderPreference = AgentProvider | 'auto';

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_AGENT_TIMEOUT_MS = 10000;

export function readAgentConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  if (!parseBoolean(env.SCOUTIQ_AGENT_ENABLED)) {
    return {
      enabled: false,
      provider: 'disabled',
      reason: 'agent_disabled'
    };
  }

  const preference = readProviderPreference(env.SCOUTIQ_AGENT_PROVIDER);
  const timeoutMs = readPositiveInteger(env.SCOUTIQ_AGENT_TIMEOUT_MS) ?? DEFAULT_AGENT_TIMEOUT_MS;

  if (preference === 'azure_openai') {
    return readAzureConfig(env, timeoutMs) ?? disabled('missing_azure_openai_config');
  }

  if (preference === 'openai') {
    return readOpenAIConfig(env, timeoutMs) ?? disabled('missing_openai_config');
  }

  return (
    readAzureConfig(env, timeoutMs) ??
    readOpenAIConfig(env, timeoutMs) ??
    disabled('missing_provider_config')
  );
}

function readOpenAIConfig(env: NodeJS.ProcessEnv, timeoutMs: number): OpenAIAgentConfig | null {
  const apiKey = readNonEmptyString(env.OPENAI_API_KEY);
  const model = readNonEmptyString(env.OPENAI_MODEL);
  if (!apiKey || !model) return null;

  return {
    enabled: true,
    provider: 'openai',
    apiKey,
    model,
    baseUrl: stripTrailingSlash(readNonEmptyString(env.OPENAI_BASE_URL) ?? DEFAULT_OPENAI_BASE_URL),
    timeoutMs
  };
}

function readAzureConfig(env: NodeJS.ProcessEnv, timeoutMs: number): AzureOpenAIAgentConfig | null {
  const apiKey = readNonEmptyString(env.AZURE_OPENAI_API_KEY);
  const endpoint = readNonEmptyString(env.AZURE_OPENAI_ENDPOINT);
  const deployment = readNonEmptyString(env.AZURE_OPENAI_DEPLOYMENT) ?? readNonEmptyString(env.AZURE_OPENAI_MODEL);
  if (!apiKey || !endpoint || !deployment) return null;

  return {
    enabled: true,
    provider: 'azure_openai',
    apiKey,
    endpoint: stripTrailingSlash(endpoint),
    deployment,
    timeoutMs
  };
}

function disabled(reason: DisabledAgentConfig['reason']): DisabledAgentConfig {
  return {
    enabled: false,
    provider: 'disabled',
    reason
  };
}

function readProviderPreference(value: string | undefined): ProviderPreference {
  switch (readNonEmptyString(value)) {
    case 'openai':
      return 'openai';
    case 'azure_openai':
      return 'azure_openai';
    case 'auto':
    case undefined:
      return 'auto';
    default:
      return 'auto';
  }
}

function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function readPositiveInteger(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function readNonEmptyString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
