import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadRootEnvironment } from './load-root-env.mjs';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('local tooling environment isolation', () => {
  it('loads only explicitly allowed names from a dotenv file', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'scoutiq-root-env-'));
    const envFile = path.join(directory, '.env');
    const marker = ['not', 'forwarded', 'marker'].join('-');
    try {
      await writeFile(envFile, `PYTHON=python3\nOPENAI_API_KEY=${marker}\n`, 'utf8');
      const target = {};
      loadRootEnvironment(['PYTHON'], target, envFile);
      assert.equal(target.PYTHON, 'python3');
      assert.equal('OPENAI_API_KEY' in target, false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('does not forward server secrets to Python subprocesses', () => {
    const marker = ['python', 'child', 'secret', 'marker'].join('-');
    const result = spawnSync(
      process.execPath,
      [
        path.join(REPOSITORY_ROOT, 'scripts', 'run-python.mjs'),
        '-c',
        "import os; print('present' if 'OPENAI_API_KEY' in os.environ else 'absent')"
      ],
      {
        cwd: REPOSITORY_ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          PYTHON: process.env.PYTHON ?? 'python3',
          OPENAI_API_KEY: marker
        }
      }
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'absent');
    assert.equal(result.stdout.includes(marker), false);
    assert.equal(result.stderr.includes(marker), false);
  });
});
