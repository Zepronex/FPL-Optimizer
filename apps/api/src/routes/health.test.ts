import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import express from 'express';
import { buildHealthResponse, createHealthRouter } from './health';

describe('health route', () => {
  it('returns safe basic service status', async () => {
    const response = await getJson(createHealthRouter({
      now: () => new Date('2026-07-06T12:00:00.000Z'),
      version: '1.2.3'
    }));

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      status: 'ok',
      service: 'scoutiq-api',
      version: '1.2.3',
      timestamp: '2026-07-06T12:00:00.000Z'
    });
  });

  it('does not include secrets or raw environment values', () => {
    const body = buildHealthResponse({
      env: {
        OPENAI_API_KEY: 'unit-test-openai-placeholder',
        POSTGRES_PASSWORD: 'unit-test-database-placeholder',
        DATABASE_URL: ['synthetic', 'non-disclosure', 'marker'].join('-'),
        SCOUTIQ_APP_VERSION: 'local-demo'
      },
      now: () => new Date('2026-07-06T12:00:00.000Z')
    });
    const serialized = JSON.stringify(body);

    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'scoutiq-api');
    assert.equal(body.version, 'local-demo');
    assert.doesNotMatch(serialized, /unit-test-openai-placeholder/);
    assert.doesNotMatch(serialized, /unit-test-database-placeholder/);
    assert.doesNotMatch(serialized, /DATABASE_URL/);
    assert.doesNotMatch(serialized, /OPENAI_API_KEY/);
  });

  it('rejects unknown health-check query fields', async () => {
    const response = await getJson(createHealthRouter(), '/api/health?verbose=true');

    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'invalid_health_request');
  });
});

async function getJson(
  router: ReturnType<typeof createHealthRouter>,
  routePath = '/api/health'
) {
  const app = express();
  app.use('/api/health', router);

  const server = app.listen(0);
  const address = server.address() as AddressInfo;

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${routePath}`);

    return {
      status: response.status,
      body: await response.json()
    };
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}
