import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

const WORKSPACE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadRootEnvironment(
  allowedNames,
  env = process.env,
  envFile = path.join(WORKSPACE_ROOT, '.env')
) {
  const loaded = {};
  loadDotenv({
    path: envFile,
    processEnv: loaded
  });
  for (const name of allowedNames) {
    if (env[name] === undefined && loaded[name] !== undefined) env[name] = loaded[name];
  }
  return env;
}
