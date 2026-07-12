#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const WEB_ROOT = path.resolve('apps/web');
const ALLOWED_PUBLIC_VARIABLES = new Set();
const SERVER_ONLY_NAMES = [
  'OPENAI_API_KEY',
  'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_ENDPOINT',
  'AZURE_OPENAI_DEPLOYMENT',
  'DATABASE_URL',
  'POSTGRES_PASSWORD',
  'ADMIN_API_KEY',
  'DATABRICKS_TOKEN',
  'GITHUB_TOKEN',
  'JWT_SECRET',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AZURE_CLIENT_SECRET',
  'GOOGLE_API_KEY',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'OAUTH_CLIENT_SECRET',
  'CLIENT_SECRET',
  'SLACK_BOT_TOKEN',
  'SLACK_WEBHOOK_SECRET',
  'WEBHOOK_SECRET'
];
const TOKEN_PATTERNS = [
  /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/,
  /\bdapi[0-9a-f]{32,}\b/i,
  /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b(?:xox[baprs]-[A-Za-z0-9-]{20,}|https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]{20,})\b/,
  /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis):\/\/[^\s:@/]+:[^\s@/]+@[^\s/]+/i,
  /\b(?:authorization|auth)\b\s*[:=]\s*["']?bearer\s+[A-Za-z0-9._~+\/-]{16,}/i,
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/
];

const findings = [];
for (const file of walk(WEB_ROOT)) {
  if (!shouldInspect(file)) continue;
  const content = readFileSync(file, 'utf8');
  const relative = path.relative(process.cwd(), file);

  for (const match of content.matchAll(/\bVITE_[A-Z0-9_]+\b/g)) {
    if (!ALLOWED_PUBLIC_VARIABLES.has(match[0])) {
      findings.push(`${relative}: unapproved public frontend variable ${match[0]}`);
    }
  }
  for (const name of SERVER_ONLY_NAMES) {
    if (content.includes(name)) findings.push(`${relative}: server-only variable name ${name}`);
  }
  for (const pattern of TOKEN_PATTERNS) {
    if (pattern.test(content)) findings.push(`${relative}: credential-pattern match (value redacted)`);
  }
}

if (findings.length > 0) {
  for (const finding of [...new Set(findings)].sort()) process.stderr.write(`${finding}\n`);
  process.stderr.write('Frontend environment scan failed. No matched values were printed.\n');
  process.exitCode = 1;
} else {
  process.stdout.write('Frontend environment scan passed: no public env variables or server-secret markers found.\n');
}

function walk(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', '.vite'].includes(entry.name)) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(entryPath));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

function shouldInspect(file) {
  const relative = path.relative(WEB_ROOT, file);
  if (relative.startsWith(`dist${path.sep}`)) return statSync(file).size <= 10 * 1024 * 1024;
  return /(?:^|\/)(?:\.env[^/]*|[^/]+\.(?:html|js|mjs|cjs|ts|tsx|json))$/.test(relative.replaceAll(path.sep, '/'));
}
