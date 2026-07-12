import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConfigurationError, readServerConfig } from './config';
import { createDbPool } from './db/client';

const WORKSPACE_ROOT = process.cwd();

function validEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    POSTGRES_PASSWORD: 'unit-test-placeholder',
    ...overrides
  };
}

function productionDatabaseUrl(): string {
  return ['postgresql:', '//', 'test-user:', 'unit-test-placeholder', '@localhost:5432/scoutiq'].join('');
}

function databaseUrlWithoutCredentials(): string {
  return ['postgresql:', '//', 'database.example/scoutiq'].join('');
}

describe('server environment configuration', () => {
  it('uses the documented secure defaults', () => {
    const config = readServerConfig(validEnvironment(), WORKSPACE_ROOT);

    assert.equal(config.rateLimit.windowMs, 900_000);
    assert.equal(config.rateLimit.max, 100);
    assert.equal(config.rateLimit.expensiveMax, 20);
    assert.equal(config.trustProxy, false);
    assert.equal(config.bindAddress, '127.0.0.1');
    assert.equal(config.requestLimits.jsonBodyBytes, 65_536);
    assert.equal(config.requestLimits.urlEncodedBodyBytes, 16_384);
    assert.equal(config.requestLimits.maxQueryParameters, 20);
    assert.equal(config.requestLimits.maxUrlLength, 2_048);
    assert.equal(config.database.ssl, false);
    assert.equal(config.database.sslRejectUnauthorized, true);
    assert.equal(config.database.connectionTimeoutMs, 5_000);
    assert.equal(config.database.queryTimeoutMs, 30_000);
  });

  it('rejects malformed rate, proxy, CORS, and boolean settings', () => {
    assert.throws(
      () => readServerConfig(validEnvironment({
        RATE_LIMIT_MAX: 'many',
        API_BIND_ADDRESS: 'all-interfaces',
        TRUST_PROXY: 'true',
        CORS_ALLOWED_ORIGINS: '*',
        DATABASE_SSL: 'sometimes'
      }), WORKSPACE_ROOT),
      (error: unknown) => {
        assert.ok(error instanceof ConfigurationError);
        assert.match(error.message, /RATE_LIMIT_MAX/);
        assert.match(error.message, /API_BIND_ADDRESS/);
        assert.match(error.message, /TRUST_PROXY/);
        assert.match(error.message, /CORS_ALLOWED_ORIGINS/);
        assert.match(error.message, /DATABASE_SSL/);
        return true;
      }
    );
  });

  it('fails fast when a production provider secret is required but missing', () => {
    const env = validEnvironment({
      NODE_ENV: 'production',
      CORS_ALLOWED_ORIGINS: 'https://scoutiq.example',
      DATABASE_URL: productionDatabaseUrl(),
      DATABASE_SSL: 'true',
      SCOUTIQ_AGENT_ENABLED: 'true',
      SCOUTIQ_AGENT_PROVIDER: 'openai',
      OPENAI_MODEL: 'test-model'
    });

    assert.throws(
      () => readServerConfig(env, WORKSPACE_ROOT),
      (error: unknown) => {
        assert.ok(error instanceof ConfigurationError);
        assert.match(error.message, /OPENAI_API_KEY/);
        return true;
      }
    );
  });

  it('requires the deployment-provided database secret in production', () => {
    const env = validEnvironment({
      NODE_ENV: 'production',
      CORS_ALLOWED_ORIGINS: 'https://scoutiq.example',
      DATABASE_SSL: 'true'
    });

    assert.throws(
      () => readServerConfig(env, WORKSPACE_ROOT),
      (error: unknown) => {
        assert.ok(error instanceof ConfigurationError);
        assert.match(error.message, /DATABASE_URL/);
        assert.equal(error.message.includes(env.POSTGRES_PASSWORD ?? ''), false);
        return true;
      }
    );

    assert.throws(
      () => readServerConfig(validEnvironment({
        NODE_ENV: 'production',
        CORS_ALLOWED_ORIGINS: 'https://scoutiq.example',
        DATABASE_URL: databaseUrlWithoutCredentials(),
        DATABASE_SSL: 'true'
      }), WORKSPACE_ROOT),
      (error: unknown) => {
        assert.ok(error instanceof ConfigurationError);
        assert.match(error.message, /DATABASE_URL/);
        return true;
      }
    );
  });

  it('never includes a rejected secret value in configuration errors', () => {
    const sensitiveMarker = ['do', 'not', 'expose', 'this'].join('-');
    const env = validEnvironment({
      DATABASE_URL: `https://user:${sensitiveMarker}@database.example/scoutiq`
    });

    assert.throws(
      () => readServerConfig(env, WORKSPACE_ROOT),
      (error: unknown) => {
        assert.ok(error instanceof ConfigurationError);
        assert.match(error.message, /DATABASE_URL/);
        assert.equal(error.message.includes(sensitiveMarker), false);
        return true;
      }
    );
  });

  it('accepts only explicit proxy IP addresses or CIDR ranges', () => {
    const config = readServerConfig(validEnvironment({
      TRUST_PROXY: '192.0.2.10, 2001:db8::/32'
    }), WORKSPACE_ROOT);

    assert.equal(config.trustProxy, '192.0.2.10, 2001:db8::/32');
  });

  it('rejects unspecified addresses and overly broad proxy trust ranges', () => {
    for (const trustProxy of [
      '0.0.0.0',
      '::',
      '0.0.0.0/0',
      '::/0',
      '10.0.0.0/8',
      '::ffff:0:0/96',
      '0:0:0:0:0:ffff:0:0/96',
      '::1/32',
      '192.0.2.10/24'
    ]) {
      assert.throws(
        () => readServerConfig(validEnvironment({ TRUST_PROXY: trustProxy }), WORKSPACE_ROOT),
        (error: unknown) => {
          assert.ok(error instanceof ConfigurationError);
          assert.match(error.message, /TRUST_PROXY/);
          return true;
        }
      );
    }

    const mappedProxy = readServerConfig(validEnvironment({
      TRUST_PROXY: '::ffff:192.0.2.0/120'
    }), WORKSPACE_ROOT);
    assert.equal(mappedProxy.trustProxy, '::ffff:192.0.2.0/120');
  });

  it('requires verified database TLS in production', () => {
    for (const override of [
      { DATABASE_SSL: 'false' },
      { DATABASE_SSL: 'true', DATABASE_SSL_REJECT_UNAUTHORIZED: 'false' }
    ]) {
      assert.throws(
        () => readServerConfig(validEnvironment({
          NODE_ENV: 'production',
          CORS_ALLOWED_ORIGINS: 'https://scoutiq.example',
          DATABASE_URL: productionDatabaseUrl(),
          ...override
        }), WORKSPACE_ROOT),
        (error: unknown) => {
          assert.ok(error instanceof ConfigurationError);
          assert.match(error.message, /DATABASE_SSL/);
          return true;
        }
      );
    }
  });

  it('rejects connection-string parameters that could override verified TLS', async () => {
    assert.throws(
      () => readServerConfig(validEnvironment({
        NODE_ENV: 'production',
        CORS_ALLOWED_ORIGINS: 'https://scoutiq.example',
        DATABASE_URL: `${productionDatabaseUrl()}?sslmode=disable`,
        DATABASE_SSL: 'true'
      }), WORKSPACE_ROOT),
      (error: unknown) => {
        assert.ok(error instanceof ConfigurationError);
        assert.match(error.message, /DATABASE_URL/);
        return true;
      }
    );

    const config = readServerConfig(validEnvironment({
      NODE_ENV: 'production',
      CORS_ALLOWED_ORIGINS: 'https://scoutiq.example',
      DATABASE_URL: productionDatabaseUrl(),
      DATABASE_SSL: 'true'
    }), WORKSPACE_ROOT);
    const pool = createDbPool(config.database);
    try {
      const Client = (pool as any).Client;
      const client = new Client((pool as any).options);
      assert.deepEqual(client.connectionParameters.ssl, { rejectUnauthorized: true });
      assert.equal((pool as any).options.connectionTimeoutMillis, 5_000);
      assert.equal((pool as any).options.query_timeout, 30_000);
      assert.equal((pool as any).options.statement_timeout, 30_000);
    } finally {
      await pool.end();
    }
  });

  it('rejects malformed database timeouts and provider header/metadata values without disclosure', () => {
    const sensitiveMarker = ['invalid', 'provider', 'marker'].join('-');
    assert.throws(
      () => readServerConfig(validEnvironment({
        DATABASE_CONNECT_TIMEOUT_MS: '0',
        DATABASE_QUERY_TIMEOUT_MS: 'forever',
        OPENAI_API_KEY: `${sensitiveMarker}\nheader`,
        OPENAI_MODEL: 'x'.repeat(201),
        AZURE_OPENAI_API_KEY: 'short',
        AZURE_OPENAI_DEPLOYMENT: `deployment\0${sensitiveMarker}`,
        POSTGRES_PASSWORD: `${sensitiveMarker}\npassword`
      }), WORKSPACE_ROOT),
      (error: unknown) => {
        assert.ok(error instanceof ConfigurationError);
        assert.match(error.message, /DATABASE_CONNECT_TIMEOUT_MS/);
        assert.match(error.message, /DATABASE_QUERY_TIMEOUT_MS/);
        assert.match(error.message, /OPENAI_API_KEY/);
        assert.match(error.message, /OPENAI_MODEL/);
        assert.match(error.message, /AZURE_OPENAI_API_KEY/);
        assert.match(error.message, /AZURE_OPENAI_DEPLOYMENT/);
        assert.match(error.message, /POSTGRES_PASSWORD/);
        assert.equal(error.message.includes(sensitiveMarker), false);
        return true;
      }
    );
  });
});
