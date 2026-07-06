import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const root = process.cwd();

const processes = [
  {
    name: 'api',
    args: ['--filter', '@fpl-optimizer/api', 'run', 'dev']
  },
  {
    name: 'web',
    args: ['--filter', '@fpl-optimizer/web', 'run', 'dev']
  }
];

const children = new Set();
let shuttingDown = false;

function buildChildEnv() {
  const env = { ...process.env };

  if (process.platform === 'win32') {
    const keyGroups = new Map();

    for (const key of Object.keys(env)) {
      const normalizedKey = key.toLowerCase();
      const group = keyGroups.get(normalizedKey) ?? [];
      group.push(key);
      keyGroups.set(normalizedKey, group);
    }

    for (const [normalizedKey, keys] of keyGroups) {
      if (keys.length < 2) {
        continue;
      }

      const preferredKey = normalizedKey === 'path'
        ? keys.find(key => key === 'Path') ?? keys.find(key => key === 'PATH') ?? keys[0]
        : keys[0];
      const preferredValue = env[preferredKey] ?? keys.map(key => env[key]).find(Boolean);

      for (const key of keys) {
        if (key !== preferredKey) {
          delete env[key];
        }
      }

      if (preferredValue) {
        env[preferredKey] = preferredValue;
      }
    }
  }

  return env;
}

function resolvePnpmInvocation(env) {
  if (process.platform !== 'win32') {
    return {
      command: 'pnpm',
      argsPrefix: []
    };
  }

  const directCli = findWindowsPnpmCli(env);

  if (directCli) {
    return {
      command: process.execPath,
      argsPrefix: [directCli]
    };
  }

  return {
    command: 'cmd.exe',
    argsPrefix: ['/d', '/s', '/c', 'pnpm.cmd']
  };
}

function findWindowsPnpmCli(env) {
  const candidates = [];

  if (env.npm_execpath) {
    candidates.push(env.npm_execpath);
  }

  const pathValue = env.Path ?? env.PATH ?? '';

  for (const pathPart of pathValue.split(path.delimiter)) {
    if (!pathPart) {
      continue;
    }

    candidates.push(path.join(pathPart, 'node_modules', 'pnpm', 'bin', 'pnpm.mjs'));
  }

  return candidates.find(candidate => candidate.endsWith('pnpm.mjs') && existsSync(candidate));
}

function pipeWithPrefix(stream, prefix, writer) {
  const rl = readline.createInterface({ input: stream });
  rl.on('line', line => writer.write(`[${prefix}] ${line}\n`));
  return rl;
}

function stopAll(signal = 'SIGTERM') {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

for (const processConfig of processes) {
  const childEnv = buildChildEnv();
  const pnpmInvocation = resolvePnpmInvocation(childEnv);
  const child = spawn(pnpmInvocation.command, [...pnpmInvocation.argsPrefix, ...processConfig.args], {
    cwd: root,
    env: childEnv,
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: false
  });

  children.add(child);

  const stdout = pipeWithPrefix(child.stdout, processConfig.name, process.stdout);
  const stderr = pipeWithPrefix(child.stderr, processConfig.name, process.stderr);

  child.on('error', error => {
    console.error(`[${processConfig.name}] failed to start: ${error.message}`);
    stopAll();
    process.exitCode = 1;
  });

  child.on('exit', (code, signal) => {
    stdout.close();
    stderr.close();
    children.delete(child);

    if (!shuttingDown) {
      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      console.error(`[${processConfig.name}] stopped with ${reason}`);
      process.exitCode = code ?? 1;
      stopAll();
    }
  });
}

process.on('SIGINT', () => stopAll('SIGINT'));
process.on('SIGTERM', () => stopAll('SIGTERM'));
