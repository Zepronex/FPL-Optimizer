import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import express from 'express';
import { QueryResult, QueryResultRow } from 'pg';
import { Queryable } from '../db/client';
import { createModelRouter } from './model';

describe('model route validation', () => {
  it('rejects unknown query fields before database access', async () => {
    const app = express();
    app.use('/api/model', createModelRouter(failingClient()));
    const server = app.listen(0);
    const address = server.address() as AddressInfo;

    try {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/model/evaluations/latest?extra=1`
      );
      const body = await response.json() as { error: string };

      assert.equal(response.status, 400);
      assert.equal(body.error, 'invalid_model_request');
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});

function failingClient(): Queryable {
  return {
    async query<T extends QueryResultRow = QueryResultRow>(): Promise<QueryResult<T>> {
      throw new Error('Database access was not expected for this model route test');
    }
  };
}
