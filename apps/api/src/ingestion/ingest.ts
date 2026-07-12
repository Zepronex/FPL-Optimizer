import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildNormalizedFplDataset,
  validateNormalizedFplDataset
} from './normalizers';
import {
  FplSourceMetadata,
  NormalizedFplDataset,
  OFFICIAL_FPL_SOURCES
} from './schemas';

type FetchResult = {
  data: unknown;
  metadata: FplSourceMetadata;
};

export type IngestFplOptions = {
  outputDir: string;
  season?: string | null;
  client?: AxiosInstance;
  generatedAt?: string;
};

export async function ingestOfficialFplData(options: IngestFplOptions): Promise<NormalizedFplDataset> {
  const client = options.client ?? axios.create({
    timeout: 15000,
    maxContentLength: 16 * 1024 * 1024,
    maxBodyLength: 16 * 1024 * 1024,
    maxRedirects: 0,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'ScoutIQ-Ingestion/1.0'
    }
  });

  const [bootstrap, fixtures] = await Promise.all([
    fetchSource(client, OFFICIAL_FPL_SOURCES.bootstrapStatic),
    fetchSource(client, OFFICIAL_FPL_SOURCES.fixtures)
  ]);

  const dataset = buildNormalizedFplDataset({
    rawBootstrap: bootstrap.data,
    rawFixtures: fixtures.data,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    season: options.season ?? null,
    sources: [bootstrap.metadata, fixtures.metadata]
  });

  await writeNormalizedDataset(options.outputDir, dataset);

  return dataset;
}

export async function writeNormalizedDataset(outputDir: string, dataset: NormalizedFplDataset): Promise<void> {
  const validated = validateNormalizedFplDataset(dataset);
  await mkdir(outputDir, { recursive: true });

  await Promise.all([
    writeJson(path.join(outputDir, 'manifest.json'), validated.manifest),
    writeJson(path.join(outputDir, 'players.json'), validated.players),
    writeJson(path.join(outputDir, 'teams.json'), validated.teams),
    writeJson(path.join(outputDir, 'events.json'), validated.events),
    writeJson(path.join(outputDir, 'fixtures.json'), validated.fixtures)
  ]);
}

async function fetchSource(
  client: AxiosInstance,
  source: typeof OFFICIAL_FPL_SOURCES[keyof typeof OFFICIAL_FPL_SOURCES]
): Promise<FetchResult> {
  const fetchedAt = new Date().toISOString();
  const response: AxiosResponse<unknown> = await client.get(source.url);

  return {
    data: response.data,
    metadata: {
      name: source.name,
      url: source.url,
      fetchedAt,
      httpDate: headerValue(response, 'date'),
      etag: headerValue(response, 'etag'),
      lastModified: headerValue(response, 'last-modified')
    }
  };
}

function headerValue(response: AxiosResponse<unknown>, key: string): string | null {
  const value = response.headers[key];
  if (Array.isArray(value)) return value.join(', ');
  return typeof value === 'string' ? value : null;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
