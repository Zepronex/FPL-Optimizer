import { existsSync } from 'node:fs';
import path from 'node:path';
import { ingestOfficialFplPlayerHistory } from './history';

type CliOptions = {
  inputDir: string;
  outputFile: string;
  concurrency: number;
};

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const output = await ingestOfficialFplPlayerHistory(options);

  console.log(`FPL player history ingestion complete: ${output.rowCount} player-gameweek rows for ${output.playerCount} players`);
  console.log(`Output: ${options.outputFile}`);
}

function parseArgs(args: string[]): CliOptions {
  const workspaceRoot = findWorkspaceRoot(process.cwd());
  const inputFlag = readFlag(args, '--input') ?? readFlag(args, '--input-dir');
  const outputFlag = readFlag(args, '--out') ?? readFlag(args, '--output');
  const concurrencyFlag = readFlag(args, '--concurrency');

  return {
    inputDir: inputFlag
      ? path.resolve(workspaceRoot, inputFlag)
      : path.join(workspaceRoot, 'data', 'fpl', 'latest'),
    outputFile: outputFlag
      ? path.resolve(workspaceRoot, outputFlag)
      : path.join(workspaceRoot, 'data', 'fpl', 'history', 'player_gameweek_history.json'),
    concurrency: concurrencyFlag ? parsePositiveInteger(concurrencyFlag, '--concurrency') : 8
  };
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

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 32) {
    throw new Error(`Expected ${label} to be an integer between 1 and 32`);
  }
  return parsed;
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
