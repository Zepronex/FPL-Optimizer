import { Pool, PoolClient, PoolConfig, QueryResult, QueryResultRow } from 'pg';
import { DatabaseConfig, readDatabaseConfig } from './config';

export type Queryable = {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<T>>;
};

export function createDbPool(config: DatabaseConfig = readDatabaseConfig()): Pool {
  const poolConfig: PoolConfig = {
    connectionString: config.connectionString,
    ssl: config.ssl ? { rejectUnauthorized: config.sslRejectUnauthorized } : false,
    connectionTimeoutMillis: config.connectionTimeoutMs,
    query_timeout: config.queryTimeoutMs,
    statement_timeout: config.queryTimeoutMs
  };

  return new Pool(poolConfig);
}

export async function withTransaction<T>(
  pool: Pool,
  run: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
