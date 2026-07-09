import path from 'node:path';
import { createDbPool } from './client';
import { readDatabaseConfig } from './config';
import { loadPredictionArtifacts } from './predictionLoader';

type CliOptions = {
  modelName: string;
  predictionFilePath: string;
  modelArtifactPath: string | null;
  evaluationFilePath: string | null;
};

async function main(): Promise<void> {
  const config = readDatabaseConfig();
  const options = parseArgs(process.argv.slice(2), config);
  const pool = createDbPool(config);

  try {
    const result = await loadPredictionArtifacts(pool, options);

    console.log(
      `Prediction database load complete: ${result.predictionCount} rows for gameweek ${result.targetGameweekId}`
    );
    console.log(`Prediction run: ${result.predictionRunId}`);
    console.log(`Run key: ${result.runKey}`);
    if (result.evaluationId) {
      console.log(`Model evaluation: ${result.evaluationId}`);
    } else {
      console.log('Model evaluation: not loaded');
    }
  } finally {
    await pool.end();
  }
}

function parseArgs(
  args: string[],
  config: ReturnType<typeof readDatabaseConfig>
): CliOptions {
  return {
    modelName: readFlag(args, '--model-name') ?? 'expected_points',
    predictionFilePath: resolvePath(
      config.workspaceRoot,
      readFlag(args, '--predictions') ?? config.defaultPredictionOutputPath
    ),
    modelArtifactPath: resolveOptionalPath(
      config.workspaceRoot,
      readFlag(args, '--model') ?? config.defaultExpectedPointsModelPath
    ),
    evaluationFilePath: resolveOptionalPath(
      config.workspaceRoot,
      readFlag(args, '--evaluation') ?? config.defaultExpectedPointsEvaluationPath
    )
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

function resolvePath(workspaceRoot: string, value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(workspaceRoot, value);
}

function resolveOptionalPath(workspaceRoot: string, value: string | null): string | null {
  return value === null ? null : resolvePath(workspaceRoot, value);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
