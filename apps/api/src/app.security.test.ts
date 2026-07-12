import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import express, { Router } from 'express';
import { API_ROUTE_GROUPS, EXPENSIVE_API_ROUTES, createApp } from './app';
import { readServerConfig, ServerConfig } from './config';

type TestResponse = {
  status: number;
  headers: Headers;
  body: Record<string, any>;
};

function testConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  const base = readServerConfig({
    NODE_ENV: 'test',
    POSTGRES_PASSWORD: 'unit-test-placeholder',
    CORS_ALLOWED_ORIGINS: 'https://allowed.example'
  }, process.cwd());
  return {
    ...base,
    ...overrides,
    rateLimit: { ...base.rateLimit, ...overrides.rateLimit },
    requestLimits: { ...base.requestLimits, ...overrides.requestLimits }
  };
}

function routeSet(options: { throwError?: Error } = {}): NonNullable<Parameters<typeof createApp>[1]>['routers'] {
  const make = (): Router => {
    const router = Router();
    router.use((_req, res, next) => {
      if (options.throwError) {
        next(options.throwError);
        return;
      }
      res.json({ success: true });
    });
    return router;
  };
  return {
    players: make(),
    analyze: make(),
    predictions: make(),
    model: make(),
    evaluation: make(),
    optimizer: make(),
    agent: make(),
    health: make()
  };
}

async function withServer<T>(
  config: ServerConfig,
  run: (baseUrl: string) => Promise<T>,
  options: Parameters<typeof createApp>[1] = {}
): Promise<T> {
  const app = createApp(config, { routers: routeSet(), ...options });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address() as AddressInfo;
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

async function request(
  baseUrl: string,
  path: string,
  init: RequestInit = {}
): Promise<TestResponse> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    body: text ? JSON.parse(text) : {}
  };
}

describe('application security middleware', () => {
  it('allows requests below the global threshold and returns 429 at the threshold', async () => {
    const config = testConfig({ rateLimit: { windowMs: 900_000, max: 2, expensiveMax: 1 } });
    await withServer(config, async baseUrl => {
      assert.equal((await request(baseUrl, '/api/health')).status, 200);
      assert.equal((await request(baseUrl, '/api/health')).status, 200);
      const limited = await request(baseUrl, '/api/health');
      assert.equal(limited.status, 429);
      assert.equal(limited.body.error, 'rate_limit_exceeded');
    });
  });

  it('returns standard rate-limit headers describing the 15-minute window', async () => {
    await withServer(testConfig(), async baseUrl => {
      const response = await request(baseUrl, '/api/health');
      assert.equal(response.status, 200);
      const policy = response.headers.get('ratelimit-policy');
      assert.ok(policy);
      assert.match(policy, /w=900/);
      assert.ok(response.headers.get('ratelimit'));
      assert.equal(response.headers.has('x-ratelimit-limit'), false);
    });
  });

  it('keeps independently keyed clients in separate buckets', async () => {
    const config = testConfig({ rateLimit: { windowMs: 900_000, max: 1, expensiveMax: 1 } });
    await withServer(config, async baseUrl => {
      const headersA = { 'X-Test-Client': '192.0.2.1' };
      const headersB = { 'X-Test-Client': '192.0.2.2' };
      assert.equal((await request(baseUrl, '/api/health', { headers: headersA })).status, 200);
      assert.equal((await request(baseUrl, '/api/health', { headers: headersA })).status, 429);
      assert.equal((await request(baseUrl, '/api/health', { headers: headersB })).status, 200);
    }, {
      rateLimitKey: req => String(req.headers['x-test-client'])
    });
  });

  it('does not let spoofed forwarded headers bypass limiting when proxy trust is disabled', async () => {
    const config = testConfig({ rateLimit: { windowMs: 900_000, max: 2, expensiveMax: 1 } });
    await withServer(config, async baseUrl => {
      assert.equal((await request(baseUrl, '/api/health', { headers: { 'X-Forwarded-For': '192.0.2.10' } })).status, 200);
      assert.equal((await request(baseUrl, '/api/health', { headers: { 'X-Forwarded-For': '192.0.2.11' } })).status, 200);
      assert.equal((await request(baseUrl, '/api/health', { headers: { 'X-Forwarded-For': '192.0.2.12' } })).status, 429);
    });
  });

  it('uses the stricter quota only for expensive routes', async () => {
    const config = testConfig({ rateLimit: { windowMs: 900_000, max: 10, expensiveMax: 2 } });
    await withServer(config, async baseUrl => {
      const init = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      };
      assert.equal((await request(baseUrl, '/api/optimizer/squad', init)).status, 200);
      assert.equal((await request(baseUrl, '/api/optimizer/squad/', init)).status, 200);
      const limited = await request(baseUrl, '/api/optimizer/squad', init);
      assert.equal(limited.status, 429);
      assert.equal(limited.body.error, 'expensive_rate_limit_exceeded');
      assert.equal((await request(baseUrl, '/api/agent/status')).status, 200);
    });
  });

  it('applies the expensive quota to every declared expensive endpoint', async () => {
    const config = testConfig({ rateLimit: { windowMs: 900_000, max: 100, expensiveMax: 1 } });
    await withServer(config, async baseUrl => {
      for (const route of EXPENSIVE_API_ROUTES) {
        const separator = route.indexOf(' ');
        const method = route.slice(0, separator);
        const path = route.slice(separator + 1);
        const init = {
          method,
          headers: {
            'Content-Type': 'application/json',
            'X-Test-Client': route
          },
          ...(method === 'POST' ? { body: '{}' } : {})
        };

        assert.equal((await request(baseUrl, path, init)).status, 200, route);
        const limited = await request(baseUrl, path, init);
        assert.equal(limited.status, 429, route);
        assert.equal(limited.body.error, 'expensive_rate_limit_exceeded', route);
      }
    }, {
      rateLimitKey: req => String(req.headers['x-test-client'])
    });
  });

  it('does not allow path aliases to bypass expensive-route quotas', async () => {
    const config = testConfig({ rateLimit: { windowMs: 900_000, max: 10, expensiveMax: 1 } });
    await withServer(config, async baseUrl => {
      const postAs = (path: string, client: string) => request(baseUrl, path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Test-Client': client
        },
        body: '{}'
      });
      const getAs = (path: string, client: string) => request(baseUrl, path, {
        headers: { 'X-Test-Client': client }
      });

      assert.equal((await postAs('/api/analyze/', 'analysis-client')).status, 200);
      assert.equal((await postAs('/api/analyze', 'analysis-client')).status, 429);
      assert.equal((await postAs('/api/agent/explain-recommendation/', 'agent-client')).status, 200);
      assert.equal((await postAs('/api/agent/explain-recommendation', 'agent-client')).status, 429);
      assert.equal((await postAs('/API/ANALYZE', 'case-client')).status, 200);
      assert.equal((await postAs('/api/analyze', 'case-client')).status, 429);
      assert.equal((await getAs('/api/evaluation/data-health/', 'health-client')).status, 200);
      assert.equal((await getAs('/api/evaluation/data-health', 'health-client')).status, 429);
      assert.equal((await request(baseUrl, '/api/evaluation/data-health', {
        method: 'HEAD',
        headers: { 'X-Test-Client': 'head-health-client' }
      })).status, 200);
      assert.equal((await request(baseUrl, '/api/evaluation/data-health', {
        method: 'HEAD',
        headers: { 'X-Test-Client': 'head-health-client' }
      })).status, 429);
    }, {
      rateLimitKey: req => String(req.headers['x-test-client'])
    });
  });

  it('covers every mounted API route group with the global limiter', async () => {
    await withServer(testConfig(), async baseUrl => {
      for (const routeGroup of API_ROUTE_GROUPS) {
        const response = await request(baseUrl, routeGroup);
        assert.equal(response.status, 200, routeGroup);
        assert.ok(response.headers.get('ratelimit'), routeGroup);
      }
    });
  });

  it('maps malformed, oversized, and unsupported bodies to stable 4xx responses', async () => {
    const config = testConfig({
      requestLimits: {
        jsonBodyBytes: 1_024,
        urlEncodedBodyBytes: 1_024,
        maxQueryParameters: 2,
        maxUrlLength: 2_048
      }
    });
    await withServer(config, async baseUrl => {
      const malformed = await request(baseUrl, '/api/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{'
      });
      assert.equal(malformed.status, 400);
      assert.equal(malformed.body.error, 'malformed_json');

      const oversizedJson = await request(baseUrl, '/api/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 'x'.repeat(2_000) })
      });
      assert.equal(oversizedJson.status, 413);
      assert.equal(oversizedJson.body.error, 'payload_too_large');

      const oversizedForm = await request(baseUrl, '/api/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `value=${'x'.repeat(2_000)}`
      });
      assert.equal(oversizedForm.status, 413);

      const unsupported = await request(baseUrl, '/api/analyze', {
        method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'not-json'
      });
      assert.equal(unsupported.status, 415);
      assert.equal(unsupported.body.error, 'unsupported_media_type');

      const compressed = await request(baseUrl, '/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
        body: '{}'
      });
      assert.equal(compressed.status, 415);
      assert.equal(compressed.body.error, 'unsupported_content_encoding');

      const tooManyQueryParameters = await request(baseUrl, '/api/players?a=1&b=2&c=3');
      assert.equal(tooManyQueryParameters.status, 400);
      assert.equal(tooManyQueryParameters.body.error, 'too_many_query_parameters');
    });
  });

  it('enforces the CORS allowlist and Helmet headers without exposing Express', async () => {
    await withServer(testConfig(), async baseUrl => {
      const allowed = await request(baseUrl, '/api/health', {
        headers: { Origin: 'https://allowed.example' }
      });
      assert.equal(allowed.status, 200);
      assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://allowed.example');
      assert.equal(allowed.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(allowed.headers.has('x-powered-by'), false);

      const rejected = await request(baseUrl, '/api/health', {
        headers: { Origin: 'https://rejected.example' }
      });
      assert.equal(rejected.status, 403);
      assert.equal(rejected.body.error, 'cors_origin_not_allowed');
    });
  });

  it('does not return stack traces, credentials, or raw error messages in production', async () => {
    const marker = ['sensitive', 'marker'].join('-');
    const config = testConfig({ environment: 'production' });
    const app = createApp(config, { routers: routeSet({ throwError: new Error(marker) }) });
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    try {
      const response = await request(`http://127.0.0.1:${address.port}`, '/api/health');
      const serialized = JSON.stringify(response.body);
      assert.equal(response.status, 500);
      assert.equal(response.body.error, 'internal_server_error');
      assert.equal(serialized.includes(marker), false);
      assert.equal(serialized.toLowerCase().includes('stack'), false);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
});
