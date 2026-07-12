import { existsSync } from 'node:fs';
import { isIP } from 'node:net';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import {
  AgentConfig,
  AgentPublicStatus,
  readAgentConfig,
  readAgentPublicStatus
} from './agent/config';

export type RuntimeEnvironment = 'development' | 'test' | 'production';

export type DatabaseConfig = {
  connectionString: string;
  ssl: boolean;
  sslRejectUnauthorized: boolean;
  connectionTimeoutMs: number;
  queryTimeoutMs: number;
  workspaceRoot: string;
  migrationsDir: string;
  defaultFplDataDir: string;
  defaultFplHistoryPath: string;
  defaultPredictionOutputPath: string;
  defaultExpectedPointsModelPath: string;
  defaultExpectedPointsEvaluationPath: string;
};

export type ServerConfig = {
  environment: RuntimeEnvironment;
  port: number;
  bindAddress: string;
  appVersion?: string;
  corsAllowedOrigins: readonly string[];
  trustProxy: false | string;
  rateLimit: {
    windowMs: number;
    max: number;
    expensiveMax: number;
  };
  requestLimits: {
    jsonBodyBytes: number;
    urlEncodedBodyBytes: number;
    maxQueryParameters: number;
    maxUrlLength: number;
  };
  database: DatabaseConfig;
  agent: AgentConfig;
  agentPublicStatus: AgentPublicStatus;
};

export class ConfigurationError extends Error {
  constructor(readonly variables: readonly string[]) {
    super(`Invalid server environment configuration: ${[...new Set(variables)].sort().join(', ')}`);
    this.name = 'ConfigurationError';
  }
}

let envFilesLoaded = false;

export function loadServerConfig(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd()
): ServerConfig {
  const workspaceRoot = findWorkspaceRoot(cwd);
  if (env === process.env) loadEnvironmentFiles(workspaceRoot);
  return readServerConfig(env, workspaceRoot);
}

export function readServerConfig(
  env: NodeJS.ProcessEnv,
  workspaceRoot: string = findWorkspaceRoot(process.cwd())
): ServerConfig {
  const invalid: string[] = [];
  const environment = readEnvironment(env.NODE_ENV, invalid);
  const port = readInteger(env.PORT, 'PORT', 3001, 1, 65_535, invalid);
  const bindAddress = readBindAddress(env.API_BIND_ADDRESS, invalid);
  const appVersion = readOptionalString(env.SCOUTIQ_APP_VERSION, 'SCOUTIQ_APP_VERSION', 100, invalid);
  const corsAllowedOrigins = readCorsOrigins(env.CORS_ALLOWED_ORIGINS, environment, invalid);
  const trustProxy = readTrustProxy(env.TRUST_PROXY, invalid);

  const windowMs = readInteger(
    env.RATE_LIMIT_WINDOW_MS,
    'RATE_LIMIT_WINDOW_MS',
    900_000,
    1_000,
    86_400_000,
    invalid
  );
  const max = readInteger(env.RATE_LIMIT_MAX, 'RATE_LIMIT_MAX', 100, 1, 100_000, invalid);
  const expensiveMax = readInteger(
    env.RATE_LIMIT_EXPENSIVE_MAX,
    'RATE_LIMIT_EXPENSIVE_MAX',
    20,
    1,
    10_000,
    invalid
  );
  if (expensiveMax > max) invalid.push('RATE_LIMIT_EXPENSIVE_MAX');

  const jsonBodyBytes = readInteger(
    env.JSON_BODY_LIMIT_BYTES,
    'JSON_BODY_LIMIT_BYTES',
    65_536,
    1_024,
    1_048_576,
    invalid
  );
  const urlEncodedBodyBytes = readInteger(
    env.URLENCODED_BODY_LIMIT_BYTES,
    'URLENCODED_BODY_LIMIT_BYTES',
    16_384,
    1_024,
    262_144,
    invalid
  );
  const maxQueryParameters = readInteger(
    env.MAX_QUERY_PARAMETERS,
    'MAX_QUERY_PARAMETERS',
    20,
    1,
    100,
    invalid
  );
  const maxUrlLength = readInteger(
    env.MAX_URL_LENGTH,
    'MAX_URL_LENGTH',
    2_048,
    256,
    16_384,
    invalid
  );

  validateProviderEnvironment(env, environment, invalid);
  validateDatabaseEnvironment(env, environment, invalid);

  if (invalid.length > 0) throw new ConfigurationError(invalid);

  return {
    environment,
    port,
    bindAddress,
    ...(appVersion ? { appVersion } : {}),
    corsAllowedOrigins,
    trustProxy,
    rateLimit: { windowMs, max, expensiveMax },
    requestLimits: {
      jsonBodyBytes,
      urlEncodedBodyBytes,
      maxQueryParameters,
      maxUrlLength
    },
    database: buildDatabaseConfig(env, workspaceRoot, environment),
    agent: readAgentConfig(env),
    agentPublicStatus: readAgentPublicStatus(env)
  };
}

export function readDatabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd()
): DatabaseConfig {
  const workspaceRoot = findWorkspaceRoot(cwd);
  if (env === process.env) loadEnvironmentFiles(workspaceRoot);
  const invalid: string[] = [];
  const environment = readEnvironment(env.NODE_ENV, invalid);
  validateDatabaseEnvironment(env, environment, invalid);
  if (invalid.length > 0) throw new ConfigurationError(invalid);
  return buildDatabaseConfig(env, workspaceRoot, environment);
}

export function findWorkspaceRoot(startDir: string): string {
  let current = path.resolve(startDir);

  while (true) {
    if (existsSync(path.join(current, 'pnpm-workspace.yaml'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(startDir);
    current = parent;
  }
}

function loadEnvironmentFiles(workspaceRoot: string): void {
  if (envFilesLoaded) return;
  envFilesLoaded = true;
  loadDotenv({ path: path.join(workspaceRoot, '.env') });
  // Retained for compatibility with existing local checkouts; new setup uses root .env only.
  loadDotenv({ path: path.join(workspaceRoot, 'apps', 'api', '.env') });
}

function readEnvironment(value: string | undefined, invalid: string[]): RuntimeEnvironment {
  if (value === undefined || value.trim() === '') return 'development';
  if (value === 'development' || value === 'test' || value === 'production') return value;
  invalid.push('NODE_ENV');
  return 'development';
}

function readBindAddress(value: string | undefined, invalid: string[]): string {
  const trimmed = value?.trim() || '127.0.0.1';
  if (trimmed.includes('%') || isIP(trimmed) === 0) {
    invalid.push('API_BIND_ADDRESS');
    return '127.0.0.1';
  }
  return trimmed;
}

function readInteger(
  value: string | undefined,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
  invalid: string[]
): number {
  if (value === undefined || value.trim() === '') return fallback;
  if (!/^\d+$/.test(value.trim())) {
    invalid.push(name);
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    invalid.push(name);
    return fallback;
  }
  return parsed;
}

function readOptionalString(
  value: string | undefined,
  name: string,
  maximumLength: number,
  invalid: string[]
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > maximumLength || /[\r\n\0]/.test(trimmed)) {
    invalid.push(name);
    return undefined;
  }
  return trimmed;
}

function readCorsOrigins(
  value: string | undefined,
  environment: RuntimeEnvironment,
  invalid: string[]
): string[] {
  const rawOrigins = value?.trim()
    ? value.split(',').map(origin => origin.trim()).filter(Boolean)
    : environment === 'development'
      ? ['http://localhost:3000']
      : [];

  if (rawOrigins.length > 10 || new Set(rawOrigins).size !== rawOrigins.length) {
    invalid.push('CORS_ALLOWED_ORIGINS');
    return [];
  }

  for (const origin of rawOrigins) {
    if (origin === '*') {
      invalid.push('CORS_ALLOWED_ORIGINS');
      continue;
    }
    try {
      const parsed = new URL(origin);
      const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
      const isOriginOnly = parsed.origin === origin && !parsed.username && !parsed.password;
      const isSafeProductionProtocol = environment !== 'production' || parsed.protocol === 'https:';
      if (!isHttp || !isOriginOnly || !isSafeProductionProtocol) invalid.push('CORS_ALLOWED_ORIGINS');
    } catch {
      invalid.push('CORS_ALLOWED_ORIGINS');
    }
  }

  return rawOrigins;
}

function readTrustProxy(value: string | undefined, invalid: string[]): false | string {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.toLowerCase() === 'false') return false;
  if (trimmed.toLowerCase() === 'true') {
    invalid.push('TRUST_PROXY');
    return false;
  }

  const entries = trimmed.split(',').map(entry => entry.trim()).filter(Boolean);
  if (entries.length === 0 || entries.length > 20 || entries.some(entry => !isIpOrCidr(entry))) {
    invalid.push('TRUST_PROXY');
    return false;
  }
  return entries.join(', ');
}

function isIpOrCidr(value: string): boolean {
  const [address, prefix, extra] = value.split('/');
  if (extra !== undefined) return false;
  const family = isIP(address);
  if (family === 0) return false;
  const bytes = parseIpBytes(address, family);
  if (!bytes || bytes.every(byte => byte === 0)) return false;
  const isIpv4Mapped = family === 6 &&
    bytes.slice(0, 10).every(byte => byte === 0) &&
    bytes[10] === 0xff &&
    bytes[11] === 0xff;
  if (isIpv4Mapped && bytes.slice(12).every(byte => byte === 0)) return false;
  if (prefix === undefined) return true;
  if (!/^\d+$/.test(prefix)) return false;
  const bits = Number(prefix);
  // Proxy trust must identify a narrow, deployment-owned network rather than an
  // internet-scale range that would let arbitrary clients select req.ip.
  const minimumBits = family === 4 ? 16 : isIpv4Mapped ? 112 : 32;
  const maximumBits = family === 4 ? 32 : 128;
  return bits >= minimumBits && bits <= maximumBits && isCanonicalNetwork(bytes, bits);
}

function parseIpBytes(address: string, family: number): number[] | null {
  if (family === 4) return address.split('.').map(part => Number(part));
  if (address.includes('%')) return null;

  let normalized = address;
  const dottedMatch = /(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(normalized);
  if (dottedMatch) {
    const octets = dottedMatch[1].split('.').map(part => Number(part));
    const replacement = `${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
    normalized = normalized.slice(0, -dottedMatch[1].length) + replacement;
  }

  const halves = normalized.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const hextets = [...left, ...Array.from({ length: missing }, () => '0'), ...right]
    .map(part => Number.parseInt(part, 16));
  if (hextets.length !== 8 || hextets.some(part => !Number.isInteger(part))) return null;
  return hextets.flatMap(part => [part >> 8, part & 0xff]);
}

function isCanonicalNetwork(bytes: readonly number[], prefixBits: number): boolean {
  const fullBytes = Math.floor(prefixBits / 8);
  const remainingBits = prefixBits % 8;
  if (remainingBits > 0) {
    const hostMask = (1 << (8 - remainingBits)) - 1;
    if ((bytes[fullBytes] & hostMask) !== 0) return false;
  }
  const hostStartsAt = fullBytes + (remainingBits > 0 ? 1 : 0);
  return bytes.slice(hostStartsAt).every(byte => byte === 0);
}

function validateDatabaseEnvironment(
  env: NodeJS.ProcessEnv,
  environment: RuntimeEnvironment,
  invalid: string[]
): void {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (databaseUrl) {
    try {
      const parsed = new URL(databaseUrl);
      const decodedUsername = decodeUrlComponent(parsed.username);
      const decodedPassword = decodeUrlComponent(parsed.password);
      if (
        databaseUrl.length > 2_048 ||
        /[\r\n\0]/.test(databaseUrl) ||
        !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
        !parsed.hostname ||
        !decodedUsername ||
        decodedUsername.length > 255 ||
        /[\r\n\0]/.test(decodedUsername) ||
        !decodedPassword ||
        decodedPassword.length > 4_096 ||
        /[\r\n\0]/.test(decodedPassword) ||
        parsed.search ||
        parsed.hash
      ) {
        invalid.push('DATABASE_URL');
      }
    } catch {
      invalid.push('DATABASE_URL');
    }
  } else if (environment === 'production') {
    invalid.push('DATABASE_URL');
  } else if (!env.POSTGRES_PASSWORD?.trim()) {
    invalid.push('POSTGRES_PASSWORD');
  }

  validateOptionalEnvironmentString(env.POSTGRES_PASSWORD, 'POSTGRES_PASSWORD', 1, 4_096, invalid);

  readInteger(env.POSTGRES_PORT, 'POSTGRES_PORT', 5432, 1, 65_535, invalid);
  readInteger(
    env.DATABASE_CONNECT_TIMEOUT_MS,
    'DATABASE_CONNECT_TIMEOUT_MS',
    5_000,
    1_000,
    120_000,
    invalid
  );
  readInteger(
    env.DATABASE_QUERY_TIMEOUT_MS,
    'DATABASE_QUERY_TIMEOUT_MS',
    30_000,
    1_000,
    600_000,
    invalid
  );
  const ssl = readStrictBoolean(env.DATABASE_SSL, 'DATABASE_SSL', false, invalid);
  const rejectUnauthorized = readStrictBoolean(
    env.DATABASE_SSL_REJECT_UNAUTHORIZED,
    'DATABASE_SSL_REJECT_UNAUTHORIZED',
    true,
    invalid
  );
  if (environment === 'production') {
    if (ssl === false) invalid.push('DATABASE_SSL');
    if (rejectUnauthorized === false) invalid.push('DATABASE_SSL_REJECT_UNAUTHORIZED');
  }

  for (const [name, value] of [
    ['POSTGRES_HOST', env.POSTGRES_HOST],
    ['POSTGRES_DB', env.POSTGRES_DB],
    ['POSTGRES_USER', env.POSTGRES_USER]
  ] as const) {
    if (value !== undefined && (!value.trim() || value.length > 255 || /[\r\n\0]/.test(value))) {
      invalid.push(name);
    }
  }
}

function decodeUrlComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function buildDatabaseConfig(
  env: NodeJS.ProcessEnv,
  workspaceRoot: string,
  _environment: RuntimeEnvironment
): DatabaseConfig {
  const connectionString = env.DATABASE_URL?.trim() || buildConnectionString(env);
  return {
    connectionString,
    ssl: readStrictBoolean(env.DATABASE_SSL, 'DATABASE_SSL', false, []),
    sslRejectUnauthorized: readStrictBoolean(
      env.DATABASE_SSL_REJECT_UNAUTHORIZED,
      'DATABASE_SSL_REJECT_UNAUTHORIZED',
      true,
      []
    ),
    connectionTimeoutMs: readInteger(
      env.DATABASE_CONNECT_TIMEOUT_MS,
      'DATABASE_CONNECT_TIMEOUT_MS',
      5_000,
      1_000,
      120_000,
      []
    ),
    queryTimeoutMs: readInteger(
      env.DATABASE_QUERY_TIMEOUT_MS,
      'DATABASE_QUERY_TIMEOUT_MS',
      30_000,
      1_000,
      600_000,
      []
    ),
    workspaceRoot,
    migrationsDir: path.join(workspaceRoot, 'db', 'migrations'),
    defaultFplDataDir: path.join(workspaceRoot, 'data', 'fpl', 'latest'),
    defaultFplHistoryPath: path.join(
      workspaceRoot,
      'data',
      'fpl',
      'history',
      'player_gameweek_history.json'
    ),
    defaultPredictionOutputPath: path.join(
      workspaceRoot,
      'data',
      'predictions',
      'expected_points_latest.jsonl'
    ),
    defaultExpectedPointsModelPath: path.join(
      workspaceRoot,
      'data',
      'models',
      'expected_points_baseline.json'
    ),
    defaultExpectedPointsEvaluationPath: path.join(
      workspaceRoot,
      'data',
      'evaluation',
      'expected_points_backtest.json'
    )
  };
}

function buildConnectionString(env: NodeJS.ProcessEnv): string {
  const host = env.POSTGRES_HOST?.trim() || 'localhost';
  const port = env.POSTGRES_PORT?.trim() || '5432';
  const database = env.POSTGRES_DB?.trim() || 'scoutiq';
  const user = env.POSTGRES_USER?.trim() || 'scoutiq';
  const password = env.POSTGRES_PASSWORD?.trim();
  if (!password) throw new ConfigurationError(['POSTGRES_PASSWORD']);
  return [
    'postgresql:',
    '//',
    encodeURIComponent(user),
    ':',
    encodeURIComponent(password),
    '@',
    host,
    ':',
    port,
    '/',
    encodeURIComponent(database)
  ].join('');
}

function readStrictBoolean(
  value: string | undefined,
  name: string,
  fallback: boolean,
  invalid: string[]
): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  if (value.trim().toLowerCase() === 'true') return true;
  if (value.trim().toLowerCase() === 'false') return false;
  invalid.push(name);
  return fallback;
}

function validateProviderEnvironment(
  env: NodeJS.ProcessEnv,
  environment: RuntimeEnvironment,
  invalid: string[]
): void {
  const enabled = readStrictBoolean(
    env.SCOUTIQ_AGENT_ENABLED,
    'SCOUTIQ_AGENT_ENABLED',
    false,
    invalid
  );
  const provider = env.SCOUTIQ_AGENT_PROVIDER?.trim() || 'auto';
  if (!['auto', 'openai', 'azure_openai'].includes(provider)) invalid.push('SCOUTIQ_AGENT_PROVIDER');
  readInteger(
    env.SCOUTIQ_AGENT_TIMEOUT_MS,
    'SCOUTIQ_AGENT_TIMEOUT_MS',
    10_000,
    1_000,
    60_000,
    invalid
  );

  validateOptionalEnvironmentString(env.OPENAI_API_KEY, 'OPENAI_API_KEY', 8, 4_096, invalid);
  validateOptionalEnvironmentString(env.AZURE_OPENAI_API_KEY, 'AZURE_OPENAI_API_KEY', 8, 4_096, invalid);
  validateOptionalEnvironmentString(env.OPENAI_MODEL, 'OPENAI_MODEL', 1, 200, invalid);
  validateOptionalEnvironmentString(
    env.AZURE_OPENAI_DEPLOYMENT,
    'AZURE_OPENAI_DEPLOYMENT',
    1,
    200,
    invalid
  );

  validateProviderUrl(env.OPENAI_BASE_URL, 'OPENAI_BASE_URL', environment, invalid);
  validateProviderUrl(env.AZURE_OPENAI_ENDPOINT, 'AZURE_OPENAI_ENDPOINT', environment, invalid);

  if (environment !== 'production' || !enabled) return;
  const hasOpenAi = Boolean(env.OPENAI_API_KEY?.trim() && env.OPENAI_MODEL?.trim());
  const hasAzure = Boolean(
    env.AZURE_OPENAI_API_KEY?.trim() &&
    env.AZURE_OPENAI_ENDPOINT?.trim() &&
    env.AZURE_OPENAI_DEPLOYMENT?.trim()
  );
  if (provider === 'openai' && !hasOpenAi) invalid.push('OPENAI_API_KEY', 'OPENAI_MODEL');
  if (provider === 'azure_openai' && !hasAzure) {
    invalid.push('AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_DEPLOYMENT');
  }
  if (provider === 'auto' && !hasOpenAi && !hasAzure) {
    invalid.push('OPENAI_API_KEY or AZURE_OPENAI_API_KEY');
  }
}

function validateOptionalEnvironmentString(
  value: string | undefined,
  name: string,
  minimumLength: number,
  maximumLength: number,
  invalid: string[]
): void {
  if (value === undefined || value.trim() === '') return;
  const trimmed = value.trim();
  if (
    trimmed.length < minimumLength ||
    trimmed.length > maximumLength ||
    /[\r\n\0]/.test(trimmed)
  ) {
    invalid.push(name);
  }
}

function validateProviderUrl(
  value: string | undefined,
  name: string,
  environment: RuntimeEnvironment,
  invalid: string[]
): void {
  const trimmed = value?.trim();
  if (!trimmed) return;
  try {
    const url = new URL(trimmed);
    const localDevelopmentHttp =
      environment !== 'production' &&
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    if (
      trimmed.length > 2_048 ||
      /[\r\n\0]/.test(trimmed) ||
      (url.protocol !== 'https:' && !localDevelopmentHttp) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      invalid.push(name);
    }
  } catch {
    invalid.push(name);
  }
}
