import { pathToFileURL } from 'node:url';
import { loadRootEnvironment } from './load-root-env.mjs';

loadRootEnvironment(['SCOUTIQ_API_URL', 'SCOUTIQ_WEB_URL', 'SCOUTIQ_SMOKE_TIMEOUT_MS']);

const DEFAULT_API_BASE_URL = 'http://localhost:3001';
const DEFAULT_WEB_BASE_URL = 'http://localhost:3000';
const DEFAULT_TIMEOUT_MS = 5000;

export function readSmokeConfig(env = process.env) {
  return {
    apiBaseUrl: readHttpBaseUrl(env.SCOUTIQ_API_URL ?? DEFAULT_API_BASE_URL, 'SCOUTIQ_API_URL'),
    webBaseUrl: readHttpBaseUrl(env.SCOUTIQ_WEB_URL ?? DEFAULT_WEB_BASE_URL, 'SCOUTIQ_WEB_URL'),
    timeoutMs: readTimeout(env.SCOUTIQ_SMOKE_TIMEOUT_MS)
  };
}

export function createSmokeChecks(config = readSmokeConfig()) {
  return [
    {
      name: 'API health',
      url: `${config.apiBaseUrl}/api/health`,
      validate: validateHealthResponse
    },
    {
      name: 'Agent status',
      url: `${config.apiBaseUrl}/api/agent/status`,
      validate: body => validateSuccessEnvelope(body, 'agent status')
    },
    {
      name: 'Evaluation latest',
      url: `${config.apiBaseUrl}/api/evaluation/latest`,
      validate: validateEvaluationLatestResponse
    },
    {
      name: 'Frontend root',
      url: `${config.webBaseUrl}/`,
      validate: validateFrontendHtml
    },
    {
      name: 'Frontend evaluation route',
      url: `${config.webBaseUrl}/evaluation`,
      validate: validateFrontendHtml
    },
    {
      name: 'Frontend analyze route',
      url: `${config.webBaseUrl}/analyze`,
      validate: validateFrontendHtml
    }
  ];
}

export async function runSmokeChecks({
  config = readSmokeConfig(),
  checks = createSmokeChecks(config),
  fetchImpl = fetch,
  writer = process.stdout
} = {}) {
  const results = [];

  for (const check of checks) {
    const result = await runSmokeCheck(check, { fetchImpl, timeoutMs: config.timeoutMs });
    results.push(result);
    writer.write(`${result.ok ? 'PASS' : 'FAIL'} ${check.name} ${safeDisplayUrl(check.url)}${result.ok ? '' : ` - ${result.error}`}\n`);
  }

  return results;
}

export async function runSmokeCheck(check, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  try {
    const response = await fetchWithTimeout(check.url, { fetchImpl, timeoutMs });
    const contentType = response.headers.get('content-type') ?? '';
    const body = contentType.includes('application/json') ? await response.json() : await response.text();

    if (!response.ok) {
      return {
        ok: false,
        name: check.name,
        url: check.url,
        status: response.status,
        error: `HTTP ${response.status}`
      };
    }

    const validation = check.validate(body);

    return {
      ok: validation.ok,
      name: check.name,
      url: check.url,
      status: response.status,
      error: validation.ok ? null : validation.error
    };
  } catch (error) {
    return {
      ok: false,
      name: check.name,
      url: check.url,
      status: null,
      error: error instanceof Error && error.name === 'AbortError'
        ? 'Request timed out'
        : 'Request failed'
    };
  }
}

export function validateHealthResponse(body) {
  if (!isRecord(body)) {
    return failed('health response is not a JSON object');
  }

  if (body.status !== 'ok') {
    return failed('health status is not ok');
  }

  if (typeof body.service !== 'string' || body.service.length === 0) {
    return failed('health service is missing');
  }

  if (typeof body.timestamp !== 'string' || Number.isNaN(Date.parse(body.timestamp))) {
    return failed('health timestamp is invalid');
  }

  if ('version' in body && typeof body.version !== 'string') {
    return failed('health version is not a string');
  }

  return passed();
}

export function validateEvaluationLatestResponse(body) {
  const envelope = validateSuccessEnvelope(body, 'evaluation latest');
  if (!envelope.ok) {
    return envelope;
  }

  if (!isRecord(body.data)) {
    return failed('evaluation latest data is missing');
  }

  if (!Array.isArray(body.data.requiredCommands)) {
    return failed('evaluation setup commands are missing');
  }

  if (!('latestRun' in body.data)) {
    return failed('evaluation latestRun field is missing');
  }

  return passed();
}

export function validateFrontendHtml(body) {
  if (typeof body !== 'string') {
    return failed('frontend response is not HTML text');
  }

  if (!body.includes('<div id="root"></div>')) {
    return failed('frontend root mount is missing');
  }

  if (!body.includes('/src/main.tsx')) {
    return failed('frontend entry script is missing');
  }

  return passed();
}

function validateSuccessEnvelope(body, label) {
  if (!isRecord(body)) {
    return failed(`${label} response is not a JSON object`);
  }

  if (body.success !== true) {
    return failed(`${label} success flag is not true`);
  }

  if (!('data' in body)) {
    return failed(`${label} data field is missing`);
  }

  return passed();
}

async function fetchWithTimeout(url, { fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function passed() {
  return { ok: true, error: null };
}

function failed(error) {
  return { ok: false, error };
}

function readTimeout(value) {
  if (!value) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 100 || parsed > 60_000) {
    throw new Error('Invalid SCOUTIQ_SMOKE_TIMEOUT_MS');
  }
  return parsed;
}

function readHttpBaseUrl(value, name) {
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      value.length > 2_048
    ) {
      throw new Error('invalid');
    }
    return value.replace(/\/+$/, '');
  } catch {
    throw new Error(`Invalid ${name}`);
  }
}

function safeDisplayUrl(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return '[invalid URL]';
  }
}

async function main() {
  const results = await runSmokeChecks();
  const failures = results.filter(result => !result.ok);

  if (failures.length > 0) {
    process.stderr.write(`Smoke test failed: ${failures.length} check(s) failed.\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write('Smoke test passed.\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Smoke test failed.'}\n`);
    process.exitCode = 1;
  });
}
