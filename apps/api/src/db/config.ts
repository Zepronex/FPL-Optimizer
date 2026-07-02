import { existsSync } from 'node:fs';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';

export type DatabaseConfig = {
  connectionString: string;
  ssl: boolean;
  workspaceRoot: string;
  migrationsDir: string;
  defaultFplDataDir: string;
};

let envFilesLoaded = false;

export function readDatabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd()
): DatabaseConfig {
  const workspaceRoot = findWorkspaceRoot(cwd);

  if (env === process.env) {
    loadEnvFiles(workspaceRoot);
  }

  return {
    connectionString: env.DATABASE_URL ?? buildConnectionString(env),
    ssl: parseBoolean(env.DATABASE_SSL),
    workspaceRoot,
    migrationsDir: path.join(workspaceRoot, 'db', 'migrations'),
    defaultFplDataDir: path.join(workspaceRoot, 'data', 'fpl', 'latest')
  };
}

export function findWorkspaceRoot(startDir: string): string {
  let current = path.resolve(startDir);

  while (true) {
    if (existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(startDir);
    }
    current = parent;
  }
}

function loadEnvFiles(workspaceRoot: string): void {
  if (envFilesLoaded) return;
  envFilesLoaded = true;

  loadDotenv({ path: path.join(workspaceRoot, '.env') });
  loadDotenv({ path: path.join(workspaceRoot, 'apps', 'api', '.env') });
}

function buildConnectionString(env: NodeJS.ProcessEnv): string {
  const host = env.POSTGRES_HOST ?? 'localhost';
  const port = env.POSTGRES_PORT ?? '5432';
  const database = env.POSTGRES_DB ?? 'scoutiq';
  const user = env.POSTGRES_USER ?? 'scoutiq';
  const password = env.POSTGRES_PASSWORD ?? 'scoutiq';

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}
