import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SECRET_SCANNER = path.join(REPOSITORY_ROOT, 'scripts', 'security', 'scan-secrets.mjs');
const FRONTEND_SCANNER = path.join(REPOSITORY_ROOT, 'scripts', 'security', 'check-frontend-env.mjs');

test('secret scan inspects ignored provider and credential configuration paths', async () => {
  await withTemporaryRepository(async directory => {
    const ignoredFiles = [
      '.databrickscfg',
      'databricks.cfg',
      '.envrc.local',
      '.env.production',
      '.env.parentheses',
      '.aws/credentials',
      '.azure/auth.json',
      '.config/databricks/config',
      'service-account-dev.json',
      'local-credential.p12'
    ];
    await writeFile(path.join(directory, '.gitignore'), `${ignoredFiles.join('\n')}\n`, 'utf8');
    const marker = ['scanner', 'regression', 'marker', '123456'].join('-');
    const prefixMarker = ['test', 'ProductionSecret', '123456789'].join('');
    const punctuationMarker = ['credible', '(secret)', '123456789'].join('-');

    for (const file of ignoredFiles) {
      const target = path.join(directory, file);
      await mkdir(path.dirname(target), { recursive: true });
      const content = file === '.env.production'
        ? `client_secret=${prefixMarker}\n`
        : file === '.env.parentheses'
        ? `password=${punctuationMarker}\n`
        : file.endsWith('.json')
        ? `${JSON.stringify({ client_secret: marker })}\n`
        : `password=${marker}\n`;
      await writeFile(target, content, 'utf8');
    }

    const result = runNode(SECRET_SCANNER, ['--current-only'], directory);
    assert.equal(result.status, 1);
    for (const file of ignoredFiles) assert.match(result.stderr, new RegExp(escapeRegExp(file)));
    assert.equal(result.stderr.includes(marker), false);
    assert.equal(result.stderr.includes(prefixMarker), false);
    assert.equal(result.stderr.includes(punctuationMarker), false);
  });
});

test('historical allowlisting cannot suppress a credential URL from a different commit', async () => {
  await withTemporaryRepository(async directory => {
    const target = path.join(directory, 'apps', 'api', 'src', 'db', 'config.ts');
    await mkdir(path.dirname(target), { recursive: true });
    const credentialUrl = [
      'postgresql:', '//', 'scanner_user', ':', 'scanner_password_123', '@', 'localhost', '/', 'scoutiq'
    ].join('');
    await writeFile(target, `export const value = ${JSON.stringify(credentialUrl)};\n`, 'utf8');

    for (const args of [
      ['config', 'user.email', 'scanner@example.invalid'],
      ['config', 'user.name', 'Scanner Test'],
      ['add', '.'],
      ['commit', '--quiet', '-m', 'scanner regression fixture']
    ]) {
      const git = spawnSync('git', args, { cwd: directory, encoding: 'utf8' });
      assert.equal(git.status, 0, git.stderr);
    }

    const result = runNode(SECRET_SCANNER, ['--history-only'], directory);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /apps\/api\/src\/db\/config\.ts/);
    assert.match(result.stderr, /credential-in-url/);
    assert.equal(result.stderr.includes(credentialUrl), false);
  });
});

test('frontend scan rejects representative server credentials in built assets without printing values', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'scoutiq-frontend-scan-'));
  try {
    const dist = path.join(directory, 'apps', 'web', 'dist', 'assets');
    await mkdir(dist, { recursive: true });
    const markers = [
      ['postgresql:', '//', 'web_user', ':', 'web_password_123', '@', 'localhost', '/', 'scoutiq'].join(''),
      `AKIA${'A'.repeat(16)}`,
      `AIza${'A'.repeat(35)}`,
      `${`eyJ${'A'.repeat(10)}`}.${'B'.repeat(10)}.${'C'.repeat(10)}`,
      `xoxb-${'A'.repeat(24)}`
    ];
    const serverOnlyName = ['OAUTH', 'CLIENT', 'SECRET'].join('_');
    await writeFile(
      path.join(dist, 'bundle.js'),
      `const values=${JSON.stringify(markers)};const ${serverOnlyName}='configured-at-build-time';\n`,
      'utf8'
    );

    const result = runNode(FRONTEND_SCANNER, [], directory);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /credential-pattern match/);
    assert.match(result.stderr, /server-only variable name OAUTH_CLIENT_SECRET/);
    for (const marker of markers) assert.equal(result.stderr.includes(marker), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

async function withTemporaryRepository(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'scoutiq-secret-scan-'));
  try {
    const initialized = spawnSync('git', ['init', '--quiet'], { cwd: directory, encoding: 'utf8' });
    assert.equal(initialized.status, 0, initialized.stderr);
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function runNode(script, args, cwd) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
