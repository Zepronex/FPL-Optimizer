#!/usr/bin/env node

import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadRootEnvironment } from './load-root-env.mjs';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadRootEnvironment(['PYTHON']);
const childEnvironment = { ...process.env };
for (const name of [
  'DATABASE_URL',
  'POSTGRES_PASSWORD',
  'OPENAI_API_KEY',
  'AZURE_OPENAI_API_KEY'
]) {
  delete childEnvironment[name];
}
const candidates = [
  process.env.PYTHON,
  process.platform === 'win32'
    ? path.join(workspaceRoot, '.venv', 'Scripts', 'python.exe')
    : path.join(workspaceRoot, '.venv', 'bin', 'python'),
  'python',
  'python3'
].filter(Boolean);

for (const executable of candidates) {
  if (executable.includes(path.sep) && !existsSync(executable)) continue;
  const result = spawnSync(executable, process.argv.slice(2), {
    cwd: workspaceRoot,
    env: childEnvironment,
    stdio: 'inherit',
    shell: false
  });
  if (result.error?.code === 'ENOENT') continue;
  if (result.error) {
    process.stderr.write('Python command could not be started.\n');
    process.exitCode = 1;
    process.exit();
  }
  process.exitCode = result.status ?? 1;
  process.exit();
}

process.stderr.write('Python was not found. Set PYTHON or create the documented .venv.\n');
process.exitCode = 1;
