import axios, { AxiosInstance } from 'axios';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NormalizedFplDatasetSchema, NormalizedPlayer } from './schemas';
import { readNormalizedFplJson } from './localJson';

const FPL_API_BASE = 'https://fantasy.premierleague.com/api';
const MAX_HISTORY_ROWS_PER_PLAYER = 200;

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
    manifest: await readNormalizedFplJson(path.join(options.inputDir, 'manifest.json')),
    players: await readNormalizedFplJson(path.join(options.inputDir, 'players.json')),
    teams: await readNormalizedFplJson(path.join(options.inputDir, 'teams.json')),
    events: await readNormalizedFplJson(path.join(options.inputDir, 'events.json')),
    fixtures: await readNormalizedFplJson(path.join(options.inputDir, 'fixtures.json'))
  });

  const client = options.client ?? axios.create({
    timeout: 15000,
    maxContentLength: 4 * 1024 * 1024,
    maxBodyLength: 4 * 1024 * 1024,
    maxRedirects: 0,
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
  if (summary.history.length > MAX_HISTORY_ROWS_PER_PLAYER) {
    throw new Error(`Player ${playerId} element-summary response exceeds the history row limit`);
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
    fixtureId: rangedInteger(row.fixture, 'fixture', 1, 2_147_483_647),
    gameweekId: rangedInteger(row.round, 'round', 1, 38),
    opponentTeamId: rangedInteger(row.opponent_team, 'opponent_team', 1, 100),
    wasHome: booleanValue(row.was_home, 'was_home'),
    kickoffTime: nullableString(row.kickoff_time),
    totalPoints: rangedInteger(row.total_points, 'total_points', -20, 100),
    minutes: rangedInteger(row.minutes, 'minutes', 0, 180),
    price: priceValue(row.value),
    selected: rangedInteger(row.selected, 'selected', 0, 100_000_000)
  };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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
  if (typeof value !== 'string' || value.length > 100 || Number.isNaN(Date.parse(value))) {
    throw new Error('Expected kickoff_time to be a string or null');
  }
  return value;
}

function priceValue(value: unknown): number {
  const rawValue = rangedInteger(value, 'value', 0, 1_000);
  return rawValue / 10;
}

function rangedInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number
): number {
  const parsed = integerValue(value, label);
  if (parsed < minimum || parsed > maximum) {
    throw new Error(`Expected ${label} to be between ${minimum} and ${maximum}`);
  }
  return parsed;
}
