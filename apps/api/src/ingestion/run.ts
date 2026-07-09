import { existsSync } from 'node:fs';
import path from 'node:path';
import { ingestOfficialFplData } from './ingest';

type CliOptions = {
  outputDir: string;
  season: string | null;
};

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const dataset = await ingestOfficialFplData(options);

  console.log(`FPL ingestion complete: ${dataset.players.length} players, ${dataset.teams.length} teams, ${dataset.events.length} events, ${dataset.fixtures.length} fixtures`);
  console.log(`Output: ${options.outputDir}`);
}

function parseArgs(args: string[]): CliOptions {
  const workspaceRoot = findWorkspaceRoot(process.cwd());
  const outputFlag = readFlag(args, '--out') ?? readFlag(args, '--output');
  const season = readFlag(args, '--season') ?? process.env.FPL_SEASON ?? null;
  const outputDir = outputFlag
    ? path.resolve(workspaceRoot, outputFlag)
    : path.join(workspaceRoot, 'data', 'fpl', 'latest');

  return { outputDir, season };
}

function readFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Expected a value after ${flag}`);
  }
  return value;
}

function findWorkspaceRoot(startDir: string): string {
  let current = startDir;

  while (true) {
    if (existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return startDir;
    }
    current = parent;
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
