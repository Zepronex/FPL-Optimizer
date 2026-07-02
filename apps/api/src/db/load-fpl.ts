import path from 'node:path';
import { createDbPool } from './client';
import { readDatabaseConfig } from './config';
import { loadFplDataset, readNormalizedFplDataset } from './fplLoader';

type CliOptions = {
  inputDir: string;
};

async function main(): Promise<void> {
  const config = readDatabaseConfig();
  const options = parseArgs(process.argv.slice(2), config.defaultFplDataDir, config.workspaceRoot);
  const pool = createDbPool(config);

  try {
    const dataset = await readNormalizedFplDataset(options.inputDir);
    const result = await loadFplDataset(pool, dataset);

    console.log(`FPL database load complete: ${result.counts.players} players, ${result.counts.teams} teams, ${result.counts.gameweeks} gameweeks, ${result.counts.fixtures} fixtures`);
    console.log(`Ingestion run: ${result.ingestionRunId}`);
    console.log(`Snapshot hash: ${result.snapshotHash}`);
  } finally {
    await pool.end();
  }
}

function parseArgs(args: string[], defaultInputDir: string, workspaceRoot: string): CliOptions {
  const inputFlag = readFlag(args, '--in') ?? readFlag(args, '--input');
  const inputDir = inputFlag
    ? path.resolve(workspaceRoot, inputFlag)
    : defaultInputDir;

  return { inputDir };
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

if (require.main === module) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
