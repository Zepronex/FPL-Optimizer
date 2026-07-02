import {
  FplIngestionManifest,
  FplSourceMetadata,
  NormalizedEvent,
  NormalizedEventSchema,
  NormalizedFixture,
  NormalizedFixtureSchema,
  NormalizedFplDataset,
  NormalizedFplDatasetSchema,
  NormalizedPlayer,
  NormalizedPlayerSchema,
  NormalizedTeam,
  NormalizedTeamSchema,
  Position,
  RawBootstrapStaticSchema,
  RawFplFixtureSchema
} from './schemas';

const POSITION_BY_ELEMENT_TYPE: Record<number, Position> = {
  1: 'GK',
  2: 'DEF',
  3: 'MID',
  4: 'FWD'
};

type RawBootstrapStatic = unknown;
type RawFixtures = unknown;

export type NormalizedBootstrapStatic = {
  players: NormalizedPlayer[];
  teams: NormalizedTeam[];
  events: NormalizedEvent[];
  currentEventId: number | null;
};

export function normalizeBootstrapStatic(rawBootstrap: RawBootstrapStatic): NormalizedBootstrapStatic {
  const bootstrap = RawBootstrapStaticSchema.parse(rawBootstrap);

  const players = bootstrap.elements
    .map(player => NormalizedPlayerSchema.parse({
      id: player.id,
      code: player.code ?? null,
      firstName: player.first_name,
      secondName: player.second_name,
      webName: player.web_name,
      displayName: [player.first_name, player.second_name].filter(Boolean).join(' ').trim() || player.web_name,
      teamId: player.team,
      position: POSITION_BY_ELEMENT_TYPE[player.element_type],
      nowCost: player.now_cost / 10,
      status: player.status,
      chanceOfPlayingNextRound: player.chance_of_playing_next_round ?? null,
      chanceOfPlayingThisRound: player.chance_of_playing_this_round ?? null,
      form: toNumber(player.form),
      selectedByPercent: toNumber(player.selected_by_percent),
      pointsPerGame: toNumber(player.points_per_game),
      valueSeason: toNumber(player.value_season),
      totalPoints: player.total_points ?? 0,
      minutes: player.minutes ?? 0,
      starts: player.starts ?? 0,
      expectedGoals: toNumber(player.expected_goals),
      expectedAssists: toNumber(player.expected_assists),
      expectedGoalInvolvements: toNumber(player.expected_goal_involvements),
      expectedGoalsConceded: toNumber(player.expected_goals_conceded)
    }))
    .sort(byId);

  const teams = bootstrap.teams
    .map(team => NormalizedTeamSchema.parse({
      id: team.id,
      code: team.code ?? null,
      name: team.name,
      shortName: team.short_name,
      strength: team.strength ?? null,
      strengthOverallHome: team.strength_overall_home ?? null,
      strengthOverallAway: team.strength_overall_away ?? null
    }))
    .sort(byId);

  const events = bootstrap.events
    .map(event => NormalizedEventSchema.parse({
      id: event.id,
      name: event.name,
      deadlineTime: normalizeDateTime(event.deadline_time),
      averageEntryScore: event.average_entry_score ?? null,
      highestScore: event.highest_score ?? null,
      finished: event.finished,
      dataChecked: event.data_checked,
      isCurrent: event.is_current,
      isNext: event.is_next
    }))
    .sort(byId);

  return {
    players,
    teams,
    events,
    currentEventId: bootstrap.current_event ?? null
  };
}

export function normalizeFixtures(rawFixtures: RawFixtures): NormalizedFixture[] {
  const fixtures = RawFplFixtureSchema.array().parse(rawFixtures);

  return fixtures
    .map(fixture => NormalizedFixtureSchema.parse({
      id: fixture.id,
      code: fixture.code ?? null,
      eventId: fixture.event,
      kickoffTime: fixture.kickoff_time ? normalizeDateTime(fixture.kickoff_time) : null,
      teamHId: fixture.team_h,
      teamAId: fixture.team_a,
      teamHScore: fixture.team_h_score,
      teamAScore: fixture.team_a_score,
      teamHDifficulty: fixture.team_h_difficulty,
      teamADifficulty: fixture.team_a_difficulty,
      started: fixture.started,
      finished: fixture.finished
    }))
    .sort(byId);
}

export function buildNormalizedFplDataset(params: {
  rawBootstrap: unknown;
  rawFixtures: unknown;
  generatedAt: string;
  season?: string | null;
  sources: FplSourceMetadata[];
}): NormalizedFplDataset {
  const bootstrap = normalizeBootstrapStatic(params.rawBootstrap);
  const fixtures = normalizeFixtures(params.rawFixtures);

  const manifest: FplIngestionManifest = {
    schemaVersion: 1,
    season: params.season ?? null,
    generatedAt: normalizeDateTime(params.generatedAt),
    currentEventId: bootstrap.currentEventId,
    sources: params.sources,
    recordCounts: {
      players: bootstrap.players.length,
      teams: bootstrap.teams.length,
      events: bootstrap.events.length,
      fixtures: fixtures.length
    }
  };

  return validateNormalizedFplDataset({
    manifest,
    players: bootstrap.players,
    teams: bootstrap.teams,
    events: bootstrap.events,
    fixtures
  });
}

export function validateNormalizedFplDataset(dataset: NormalizedFplDataset): NormalizedFplDataset {
  const parsed = NormalizedFplDatasetSchema.parse(dataset);

  assertUniqueIds('players', parsed.players);
  assertUniqueIds('teams', parsed.teams);
  assertUniqueIds('events', parsed.events);
  assertUniqueIds('fixtures', parsed.fixtures);

  const teamIds = new Set(parsed.teams.map(team => team.id));
  const eventIds = new Set(parsed.events.map(event => event.id));

  const missingPlayerTeam = parsed.players.find(player => !teamIds.has(player.teamId));
  if (missingPlayerTeam) {
    throw new Error(`Player ${missingPlayerTeam.id} references unknown team ${missingPlayerTeam.teamId}`);
  }

  const invalidFixture = parsed.fixtures.find(fixture =>
    fixture.teamHId === fixture.teamAId ||
    !teamIds.has(fixture.teamHId) ||
    !teamIds.has(fixture.teamAId) ||
    (fixture.eventId !== null && !eventIds.has(fixture.eventId))
  );

  if (invalidFixture) {
    throw new Error(`Fixture ${invalidFixture.id} failed team/event reference validation`);
  }

  return parsed;
}

function toNumber(value: string | undefined): number {
  if (value === undefined || value.trim() === '') return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected numeric string, received "${value}"`);
  }
  return parsed;
}

function normalizeDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date-time value "${value}"`);
  }
  return date.toISOString();
}

function byId<T extends { id: number }>(left: T, right: T): number {
  return left.id - right.id;
}

function assertUniqueIds(label: string, records: Array<{ id: number }>): void {
  const seen = new Set<number>();
  for (const record of records) {
    if (seen.has(record.id)) {
      throw new Error(`Duplicate ${label} id ${record.id}`);
    }
    seen.add(record.id);
  }
}
