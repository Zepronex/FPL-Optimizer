#!/usr/bin/env node

import { existsSync, readFileSync, statSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const allowlist = JSON.parse(readFileSync(new URL('./secret-allowlist.json', import.meta.url), 'utf8')).entries;
const args = new Set(process.argv.slice(2));
const scanCurrent = !args.has('--history-only');
const scanHistory = !args.has('--current-only');
const includeIgnored = !args.has('--exclude-ignored');

const credentialRules = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/],
  ['openai-api-key', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/],
  ['databricks-token', /\bdapi[0-9a-f]{32,}\b/i],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/],
  ['slack-token-or-webhook', /\b(?:xox[baprs]-[A-Za-z0-9-]{20,}|https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]{20,})\b/]
];
const credentialUrlPattern = /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis):\/\/[^\s:@/]+:[^\s@/]+@[^\s/]+/ig;

const sensitiveAssignment = /\b(api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|oauth[_-]?client[_-]?secret|azure[_-]?client[_-]?secret|aws[_-]?secret[_-]?access[_-]?key|secret[_-]?access[_-]?key|database[_-]?url|databricks[_-]?token|github[_-]?token|password|private[_-]?key|jwt[_-]?secret|webhook[_-]?secret)\b["'`]?\s*[:=]\s*["'`]?([^\s"'`,}\]]+)/ig;
const bearerAssignment = /\b(?:authorization|auth)\b["'`]?\s*[:=]\s*["'`]?bearer\s+([A-Za-z0-9._~+\/-]{16,})/ig;
const placeholder = /^(?:<.*>|\$\{|process\.env|import\.meta\.env|os\.environ|env\.|(?:none|null|undefined|false|true|redacted|example|sample|dummy|fake|test|unit-test|placeholder|replace|change[-_]?me|not[-_]?a[-_]?credential)(?:$|[-_:/.]))/i;

const findings = [];
const informational = [];

if (scanCurrent) scanCurrentTree();
if (scanHistory) await scanGitHistory();

for (const item of informational.sort(compareResult)) {
  process.stdout.write(`INFO ${item.scope}: ${item.path} (${item.rule})\n`);
}
for (const item of uniqueFindings(findings).sort(compareResult)) {
  const commit = item.commit ? `; commit ${item.commit}` : '';
  process.stderr.write(`SECRET ${item.scope}: ${item.path} (${item.rule}${commit})\n`);
}

const unique = uniqueFindings(findings);
if (unique.length > 0) {
  process.stderr.write(`Secret scan failed with ${unique.length} redacted finding(s). Values were not printed.\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Secret scan passed: current tracked/untracked files and Git history contain no unallowlisted credential-pattern findings.\n');
}

function scanCurrentTree() {
  const files = new Set(readNullSeparatedGit(['ls-files', '-z', '--cached', '--others', '--exclude-standard']));
  if (includeIgnored) {
    for (const file of readNullSeparatedGit(['ls-files', '-z', '--others', '--ignored', '--exclude-standard'])) {
      if (isRelevantIgnoredFile(file)) files.add(file);
    }
  }

  for (const file of files) {
    if (!existsSync(file) || !statSync(file).isFile()) continue;
    const scope = isIgnored(file) ? 'ignored-local' : 'current';
    if (isCredentialContainer(file)) {
      findings.push({ scope, path: file, rule: 'credential-container-file' });
      continue;
    }
    scanBuffer(readFileSafely(file), { scope, path: file });
  }
}

async function scanGitHistory() {
  const git = spawn('git', [
    'log', '--all', '--full-history', '--text', '--no-ext-diff', '--no-color',
    '--format=@@SCOUTIQ_COMMIT:%H', '-p'
  ], { stdio: ['ignore', 'pipe', 'ignore'] });
  const lines = createInterface({ input: git.stdout, crlfDelay: Infinity });
  let commit;
  let file = '(unknown historical path)';
  const rulesByContext = new Map();

  for await (const line of lines) {
    if (line.startsWith('@@SCOUTIQ_COMMIT:')) {
      commit = line.slice('@@SCOUTIQ_COMMIT:'.length, '@@SCOUTIQ_COMMIT:'.length + 12);
      continue;
    }
    if (line.startsWith('diff --git ')) {
      const match = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
      if (match) file = match[2];
      continue;
    }
    if ((!line.startsWith('+') && !line.startsWith('-')) || line.startsWith('+++') || line.startsWith('---')) {
      continue;
    }

    const context = { scope: 'history', path: file, commit };
    const result = scanText(line.slice(1), context);
    for (const rule of result) {
      const key = `${commit ?? ''}\0${file}\0${rule}`;
      if (!rulesByContext.has(key)) rulesByContext.set(key, { ...context, rule });
    }
  }

  const status = await new Promise(resolve => git.once('close', resolve));
  if (status !== 0) throw new Error('Git command failed during secret scan: log');
  findings.push(...rulesByContext.values());
}

function scanBuffer(buffer, context) {
  if (!buffer || buffer.includes(0)) return;
  const text = buffer.toString('utf8');
  const foundRules = scanText(text, context);

  for (const rule of foundRules) findings.push({ ...context, rule });
}

function scanText(text, context) {
  const foundRules = new Set();

  if (isAllowlisted(context, '*')) return foundRules;

  for (const [rule, pattern] of credentialRules) {
    if (pattern.test(text) && !isAllowlisted(context, rule)) foundRules.add(rule);
  }

  credentialUrlPattern.lastIndex = 0;
  if ([...text.matchAll(credentialUrlPattern)].length > 0 && !isAllowlisted(context, 'credential-in-url')) {
    foundRules.add('credential-in-url');
  }

  for (const line of text.split(/\r?\n/)) {
    sensitiveAssignment.lastIndex = 0;
    for (const match of line.matchAll(sensitiveAssignment)) {
      const candidate = match[2]?.trim() ?? '';
      if (isCredibleAssignedValue(candidate)) {
        const assignmentRule = `hardcoded-${match[1].toLowerCase()}`;
        if (!isAllowlisted(context, assignmentRule)) foundRules.add(assignmentRule);
        if (candidate.length >= 20 && shannonEntropy(candidate) >= 4) {
          if (!isAllowlisted(context, 'high-entropy-sensitive-assignment')) {
            foundRules.add('high-entropy-sensitive-assignment');
          }
        }
      }
    }
    bearerAssignment.lastIndex = 0;
    for (const match of line.matchAll(bearerAssignment)) {
      const candidate = match[1]?.trim() ?? '';
      if (isCredibleAssignedValue(candidate) && !isAllowlisted(context, 'hardcoded-bearer-token')) {
        foundRules.add('hardcoded-bearer-token');
      }
    }
  }

  const workspaceUrl = /https:\/\/[^\s"']*(?:cloud\.databricks\.com|azuredatabricks\.net)\b/i.test(text);
  if (workspaceUrl) {
    if (context.scope === 'ignored-local') {
      informational.push({ ...context, rule: 'ignored-local-workspace-url' });
    } else {
      foundRules.add('committed-workspace-url');
    }
  }

  const absoluteUserPath = /(?:^|["'\s])\/(?:Users|home)\/[^/\s"']+\//m.test(text);
  if (absoluteUserPath && !isAbsolutePathAssertionFixture(context.path)) {
    if (context.scope === 'ignored-local') {
      informational.push({ ...context, rule: 'ignored-local-absolute-path' });
    } else {
      foundRules.add('user-specific-absolute-path');
    }
  }

  return foundRules;
}

function isCredibleAssignedValue(value) {
  if (!value || value.length < 8 || placeholder.test(value)) return false;
  if (/(?:process\.)?env\.|import\.meta\.env|os\.environ|getenv|readNonEmptyString/i.test(value)) return false;
  if (/^(?:[A-Za-z_$][\w$]*\.)*[A-Za-z_$][\w$]*\([^)]*\)$/.test(value)) return false;
  if (/^(?:[A-Za-z_$][\w$]*\.)+[A-Za-z_$][\w$]*$/.test(value)) return false;
  if (/^https?:\/\//i.test(value)) return false;
  if (/^\$(?:\{|[A-Z_][A-Z0-9_]*$)/.test(value) || /^(?:\{\{|\[)/.test(value)) return false;
  return true;
}

function shannonEntropy(value) {
  const counts = new Map();
  for (const character of value) counts.set(character, (counts.get(character) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function isAllowlisted(context, rule) {
  return allowlist.some(entry =>
    entry.scope === context.scope &&
    (entry.rule === rule || entry.rules?.includes(rule)) &&
    (!entry.commit || entry.commit === context.commit) &&
    (entry.path === context.path || (entry.pathPrefix && context.path.startsWith(entry.pathPrefix)))
  );
}

function isRelevantIgnoredFile(file) {
  const normalized = file.replaceAll('\\', '/');
  return (
    ((/(^|\/)\.env(?:\..+)?$/.test(normalized) || /(^|\/)\.envrc(?:\..+)?$/.test(normalized)) &&
      !/\.example$/.test(normalized)) ||
    /(^|\/)\.databrickscfg$/.test(normalized) ||
    /(^|\/)databricks\.cfg$/.test(normalized) ||
    /(^|\/)\.databricks\//.test(normalized) ||
    /(^|\/)\.config\/databricks\//.test(normalized) ||
    /(^|\/)\.(?:aws|azure)\//.test(normalized) ||
    /(^|\/)service-account[^/]*\.json$/i.test(normalized) ||
    /(?:^|\/)(?:credentials?|secrets?)(?:\.|\/|$)/i.test(normalized) ||
    /\.(?:credentials|log|pem|key|p12|pfx|jks)$/i.test(normalized)
  );
}

function isCredentialContainer(file) {
  return /\.(?:credentials|p12|pfx|jks)$/i.test(file);
}

function isAbsolutePathAssertionFixture(file) {
  return /(?:^|\/)test[^/]*\.(?:py|ts|js|mjs)$/.test(file);
}

function readFileSafely(file) {
  const size = statSync(file).size;
  if (size > MAX_FILE_BYTES) return null;
  return readFileSync(file);
}

function isIgnored(file) {
  const result = spawnSync('git', ['check-ignore', '-q', '--', file], { stdio: 'ignore' });
  return result.status === 0;
}

function readNullSeparatedGit(args) {
  const output = runGitBuffer(args);
  return output.toString('utf8').split('\0').filter(Boolean);
}

function runGit(args, input) {
  const result = spawnSync('git', args, {
    input,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024
  });
  if (result.status !== 0) throw new Error(`Git command failed during secret scan: ${args[0]}`);
  return result.stdout;
}

function runGitBuffer(args, maxBuffer = 256 * 1024 * 1024) {
  const result = spawnSync('git', args, { maxBuffer });
  if (result.status !== 0) throw new Error(`Git command failed during secret scan: ${args[0]}`);
  return result.stdout;
}

function uniqueFindings(items) {
  const byKey = new Map();
  for (const item of items) {
    const key = `${item.scope}\0${item.path}\0${item.rule}\0${item.commit ?? ''}`;
    byKey.set(key, item);
  }
  return [...byKey.values()];
}

function compareResult(left, right) {
  return `${left.scope}:${left.path}:${left.rule}`.localeCompare(`${right.scope}:${right.path}:${right.rule}`);
}
