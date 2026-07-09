import { createHash } from 'node:crypto';
import {
  FplIngestionManifest,
  FplSourceMetadata,
  NormalizedEvent,
  NormalizedFixture,
  NormalizedFplDataset,
  NormalizedPlayer,
  NormalizedTeam
} from '../ingestion/schemas';
import { validateNormalizedFplDataset } from '../ingestion/normalizers';

export type LoadedRecordCounts = {
  players: number;
  teams: number;
  gameweeks: number;
  fixtures: number;
};

export type IngestionRunRow = {
  snapshotHash: string;
  schemaVersion: number;
  season: string | null;
  generatedAt: string;
  currentEventId: number | null;
  sources: FplSourceMetadata[];
  recordCounts: FplIngestionManifest['recordCounts'];
};

export type TeamRow = {
  id: number;
  code: number | null;
  name: string;
  shortName: string;
  strength: number | null;
  strengthOverallHome: number | null;
  strengthOverallAway: number | null;
};

export type PlayerRow = {
  id: number;
  code: number | null;
  firstName: string;
  secondName: string;
  webName: string;
  displayName: string;
  teamId: number;
  position: string;
  nowCost: number;
  status: string;
  chanceOfPlayingNextRound: number | null;
  chanceOfPlayingThisRound: number | null;
  form: number;
  selectedByPercent: number;
  pointsPerGame: number;
  valueSeason: number;
  totalPoints: number;
  minutes: number;
  starts: number;
  expectedGoals: number;
  expectedAssists: number;
  expectedGoalInvolvements: number;
  expectedGoalsConceded: number;
};

export type GameweekRow = {
  id: number;
  name: string;
  deadlineTime: string;
  averageEntryScore: number | null;
  highestScore: number | null;
  finished: boolean;
  dataChecked: boolean;
  isCurrent: boolean;
  isNext: boolean;
};

export type FixtureRow = {
  id: number;
  code: number | null;
  eventId: number | null;
  kickoffTime: string | null;
  teamHId: number;
  teamAId: number;
  teamHScore: number | null;
  teamAScore: number | null;
  teamHDifficulty: number;
  teamADifficulty: number;
  started: boolean;
  finished: boolean;
};

export type FplLoadPlan = {
  ingestionRun: IngestionRunRow;
  teams: TeamRow[];
  players: PlayerRow[];
  gameweeks: GameweekRow[];
  fixtures: FixtureRow[];
  counts: LoadedRecordCounts;
};

export function buildFplLoadPlan(dataset: NormalizedFplDataset): FplLoadPlan {
  const validated = validateNormalizedFplDataset(dataset);
  assertManifestCounts(validated);

  const canonicalDataset: NormalizedFplDataset = {
    manifest: validated.manifest,
    teams: [...validated.teams].sort(byId),
    players: [...validated.players].sort(byId),
    events: [...validated.events].sort(byId),
    fixtures: [...validated.fixtures].sort(byId)
  };

  return {
    ingestionRun: {
      snapshotHash: createDatasetSnapshotHash(canonicalDataset),
      schemaVersion: canonicalDataset.manifest.schemaVersion,
      season: canonicalDataset.manifest.season,
      generatedAt: canonicalDataset.manifest.generatedAt,
      currentEventId: canonicalDataset.manifest.currentEventId,
      sources: canonicalDataset.manifest.sources,
      recordCounts: canonicalDataset.manifest.recordCounts
    },
    teams: canonicalDataset.teams.map(toTeamRow),
    players: canonicalDataset.players.map(toPlayerRow),
    gameweeks: canonicalDataset.events.map(toGameweekRow),
    fixtures: canonicalDataset.fixtures.map(toFixtureRow),
    counts: {
      players: canonicalDataset.players.length,
      teams: canonicalDataset.teams.length,
      gameweeks: canonicalDataset.events.length,
      fixtures: canonicalDataset.fixtures.length
    }
  };
}

export function createDatasetSnapshotHash(dataset: NormalizedFplDataset): string {
  return createHash('sha256')
    .update(stableStringify(dataset))
    .digest('hex');
}

function toTeamRow(team: NormalizedTeam): TeamRow {
  return {
    id: team.id,
    code: team.code,
    name: team.name,
    shortName: team.shortName,
    strength: team.strength,
    strengthOverallHome: team.strengthOverallHome,
    strengthOverallAway: team.strengthOverallAway
  };
}

function toPlayerRow(player: NormalizedPlayer): PlayerRow {
  return {
    id: player.id,
    code: player.code,
    firstName: player.firstName,
    secondName: player.secondName,
    webName: player.webName,
    displayName: player.displayName,
    teamId: player.teamId,
    position: player.position,
    nowCost: player.nowCost,
    status: player.status,
    chanceOfPlayingNextRound: player.chanceOfPlayingNextRound,
    chanceOfPlayingThisRound: player.chanceOfPlayingThisRound,
    form: player.form,
    selectedByPercent: player.selectedByPercent,
    pointsPerGame: player.pointsPerGame,
    valueSeason: player.valueSeason,
    totalPoints: player.totalPoints,
    minutes: player.minutes,
    starts: player.starts,
    expectedGoals: player.expectedGoals,
    expectedAssists: player.expectedAssists,
    expectedGoalInvolvements: player.expectedGoalInvolvements,
    expectedGoalsConceded: player.expectedGoalsConceded
  };
}

function toGameweekRow(event: NormalizedEvent): GameweekRow {
  return {
    id: event.id,
    name: event.name,
    deadlineTime: event.deadlineTime,
    averageEntryScore: event.averageEntryScore,
    highestScore: event.highestScore,
    finished: event.finished,
    dataChecked: event.dataChecked,
    isCurrent: event.isCurrent,
    isNext: event.isNext
  };
}

function toFixtureRow(fixture: NormalizedFixture): FixtureRow {
  return {
    id: fixture.id,
    code: fixture.code,
    eventId: fixture.eventId,
    kickoffTime: fixture.kickoffTime,
    teamHId: fixture.teamHId,
    teamAId: fixture.teamAId,
    teamHScore: fixture.teamHScore,
    teamAScore: fixture.teamAScore,
    teamHDifficulty: fixture.teamHDifficulty,
    teamADifficulty: fixture.teamADifficulty,
    started: fixture.started,
    finished: fixture.finished
  };
}

function assertManifestCounts(dataset: NormalizedFplDataset): void {
  const expected = dataset.manifest.recordCounts;
  const actual = {
    players: dataset.players.length,
    teams: dataset.teams.length,
    events: dataset.events.length,
    fixtures: dataset.fixtures.length
  };

  if (
    expected.players !== actual.players ||
    expected.teams !== actual.teams ||
    expected.events !== actual.events ||
    expected.fixtures !== actual.fixtures
  ) {
    throw new Error(
      `Manifest counts do not match normalized files: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`
    );
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right));

  return `{${entries
    .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableStringify(nestedValue)}`)
    .join(',')}}`;
}

function byId<T extends { id: number }>(left: T, right: T): number {
  return left.id - right.id;
}
