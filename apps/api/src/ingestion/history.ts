import axios, { AxiosInstance } from 'axios';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NormalizedFplDatasetSchema, NormalizedPlayer } from './schemas';

const FPL_API_BASE = 'https://fantasy.premierleague.com/api';

type RawElementSummary = {
  history?: unknown;
};

type RawElementSummaryHistoryRow = {
  element?: unknown;
  fixture?: unknown;
  opponent_team?: unknown;
  total_points?: unknown;
  was_home?: unknown;
  kickoff_time?: unknown;
  round?: unknown;
  minutes?: unknown;
  value?: unknown;
  selected?: unknown;
};

export type PlayerGameweekHistoryRow = {
  playerId: number;
  fixtureId: number;
  gameweekId: number;
  opponentTeamId: number;
  wasHome: boolean;
  kickoffTime: string | null;
  totalPoints: number;
  minutes: number;
  price: number;
  selected: number;
};

export type PlayerGameweekHistoryFile = {
  schemaVersion: 1;
  generatedAt: string;
  source: {
    name: 'element-summary';
    urlTemplate: string;
    fetchedAt: string;
  };
  inputSnapshotGeneratedAt: string;
  inputSeason: string | null;
  playerCount: number;
  rowCount: number;
  rows: PlayerGameweekHistoryRow[];
};

export type IngestPlayerHistoryOptions = {
  inputDir: string;
  outputFile: string;
  client?: AxiosInstance;
  concurrency?: number;
  generatedAt?: string;
};

export async function ingestOfficialFplPlayerHistory(
  options: IngestPlayerHistoryOptions
): Promise<PlayerGameweekHistoryFile> {
  const dataset = NormalizedFplDatasetSchema.parse({
    manifest: await readJson(path.join(options.inputDir, 'manifest.json')),
    players: await readJson(path.join(options.inputDir, 'players.json')),
    teams: await readJson(path.join(options.inputDir, 'teams.json')),
    events: await readJson(path.join(options.inputDir, 'events.json')),
    fixtures: await readJson(path.join(options.inputDir, 'fixtures.json'))
  });

  const client = options.client ?? axios.create({
    timeout: 15000,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'ScoutIQ-Ingestion/1.0'
    }
  });
  const fetchedAt = new Date().toISOString();
  const rows = await fetchAllPlayerHistoryRows(
    client,
    [...dataset.players].sort((left, right) => left.id - right.id),
    options.concurrency ?? 8
  );
  const output: PlayerGameweekHistoryFile = {
    schemaVersion: 1,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    source: {
      name: 'element-summary',
      urlTemplate: `${FPL_API_BASE}/element-summary/{player_id}/`,
      fetchedAt
    },
    inputSnapshotGeneratedAt: dataset.manifest.generatedAt,
    inputSeason: dataset.manifest.season,
    playerCount: dataset.players.length,
    rowCount: rows.length,
    rows
  };

  await writeJson(options.outputFile, output);
  return output;
}

export function normalizeElementSummaryHistory(
  playerId: number,
  rawSummary: unknown
): PlayerGameweekHistoryRow[] {
  const summary = rawSummary as RawElementSummary;
  if (!Array.isArray(summary.history)) {
    throw new Error(`Player ${playerId} element-summary response is missing a history array`);
  }

  return summary.history
    .map(rawRow => normalizeHistoryRow(playerId, rawRow))
    .sort((left, right) => left.gameweekId - right.gameweekId || left.fixtureId - right.fixtureId);
}

async function fetchAllPlayerHistoryRows(
  client: AxiosInstance,
  players: NormalizedPlayer[],
  concurrency: number
): Promise<PlayerGameweekHistoryRow[]> {
  const rows: PlayerGameweekHistoryRow[] = [];
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, players.length));

  async function worker(): Promise<void> {
    while (nextIndex < players.length) {
      const player = players[nextIndex];
      nextIndex += 1;
      const response = await client.get(`${FPL_API_BASE}/element-summary/${player.id}/`);
      rows.push(...normalizeElementSummaryHistory(player.id, response.data));
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return rows.sort((left, right) =>
    left.playerId - right.playerId ||
    left.gameweekId - right.gameweekId ||
    left.fixtureId - right.fixtureId
  );
}

function normalizeHistoryRow(playerId: number, rawRow: unknown): PlayerGameweekHistoryRow {
  const row = rawRow as RawElementSummaryHistoryRow;
  return {
    playerId,
    fixtureId: positiveInteger(row.fixture, 'fixture'),
    gameweekId: positiveInteger(row.round, 'round'),
    opponentTeamId: positiveInteger(row.opponent_team, 'opponent_team'),
    wasHome: booleanValue(row.was_home, 'was_home'),
    kickoffTime: nullableString(row.kickoff_time),
    totalPoints: integerValue(row.total_points, 'total_points'),
    minutes: nonnegativeInteger(row.minutes, 'minutes'),
    price: priceValue(row.value),
    selected: nonnegativeInteger(row.selected, 'selected')
  };
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function positiveInteger(value: unknown, label: string): number {
  const parsed = integerValue(value, label);
  if (parsed <= 0) {
    throw new Error(`Expected ${label} to be a positive integer`);
  }
  return parsed;
}

function nonnegativeInteger(value: unknown, label: string): number {
  const parsed = integerValue(value, label);
  if (parsed < 0) {
    throw new Error(`Expected ${label} to be a nonnegative integer`);
  }
  return parsed;
}

function integerValue(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`Expected ${label} to be an integer`);
  }
  return value;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Expected ${label} to be a boolean`);
  }
  return value;
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error('Expected kickoff_time to be a string or null');
  }
  return value;
}

function priceValue(value: unknown): number {
  const rawValue = nonnegativeInteger(value, 'value');
  return rawValue / 10;
}
