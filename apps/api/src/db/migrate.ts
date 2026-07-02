import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { createDbPool, withTransaction } from './client';
import { readDatabaseConfig } from './config';

type Migration = {
  name: string;
  checksum: string;
  sql: string;
};

export type MigrationResult = {
  applied: string[];
  skipped: string[];
};

export async function runMigrations(
  pool: Pool,
  migrationsDir: string = readDatabaseConfig().migrationsDir
): Promise<MigrationResult> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const appliedRows = await pool.query<{ name: string; checksum: string }>(
    'SELECT name, checksum FROM schema_migrations ORDER BY name'
  );
  const appliedChecksums = new Map(
    appliedRows.rows.map(row => [row.name, row.checksum])
  );

  const applied: string[] = [];
  const skipped: string[] = [];
  const migrations = await readMigrations(migrationsDir);

  for (const migration of migrations) {
    const existingChecksum = appliedChecksums.get(migration.name);
    if (existingChecksum) {
      if (existingChecksum !== migration.checksum) {
        throw new Error(`Migration ${migration.name} has already been applied with a different checksum`);
      }
      skipped.push(migration.name);
      continue;
    }

    await withTransaction(pool, async client => {
      await client.query(migration.sql);
      await client.query(
        'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
        [migration.name, migration.checksum]
      );
    });
    applied.push(migration.name);
  }

  return { applied, skipped };
}

async function readMigrations(migrationsDir: string): Promise<Migration[]> {
  const fileNames = (await readdir(migrationsDir))
    .filter(fileName => fileName.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(
    fileNames.map(async fileName => {
      const sql = await readFile(path.join(migrationsDir, fileName), 'utf8');
      return {
        name: fileName,
        checksum: createHash('sha256').update(sql).digest('hex'),
        sql
      };
    })
  );
}

async function main(): Promise<void> {
  const config = readDatabaseConfig();
  const pool = createDbPool(config);

  try {
    const result = await runMigrations(pool, config.migrationsDir);
    if (result.applied.length === 0) {
      console.log(`Database migrations up to date (${result.skipped.length} checked)`);
      return;
    }

    console.log(`Applied ${result.applied.length} database migration(s): ${result.applied.join(', ')}`);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
