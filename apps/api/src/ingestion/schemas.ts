import { z } from 'zod';

export const MAX_POSTGRES_INTEGER = 2_147_483_647;
export const MAX_FPL_GAMEWEEK = 38;

const MAX_PLAYER_COST = 100;
const MAX_PLAYER_FORM = 100;
const MIN_PLAYER_FORM = -100;
const MAX_PERCENTAGE = 100;
const MAX_POINTS_PER_GAME = 100;
const MAX_VALUE_SEASON = 1_000;
const MAX_TOTAL_POINTS = 10_000;
const MIN_TOTAL_POINTS = -1_000;
const MAX_PLAYER_MINUTES = 10_000;
const MAX_PLAYER_STARTS = 100;
const MAX_EXPECTED_STAT = 1_000;
const MAX_TEAM_STRENGTH = 10_000;
const MAX_GAMEWEEK_SCORE = 1_000;
export const MAX_FIXTURE_SCORE = 100;
const MAX_FPL_PLAYERS = 2_000;
const MAX_FPL_TEAMS = 100;
const MAX_FPL_EVENTS = 100;
const MAX_FPL_FIXTURES = 5_000;

const DatabaseIdSchema = z.number().finite().int().min(1).max(MAX_POSTGRES_INTEGER);
const GameweekIdSchema = z.number().finite().int().min(1).max(MAX_FPL_GAMEWEEK);
const PercentageSchema = z.number().finite().int().min(0).max(MAX_PERCENTAGE);
const NullableGameweekScoreSchema = z.number()
  .finite()
  .min(0)
  .max(MAX_GAMEWEEK_SCORE)
  .nullable();
const NullableFixtureScoreSchema = z.number()
  .finite()
  .int()
  .min(0)
  .max(MAX_FIXTURE_SCORE)
  .nullable();
const NullableTeamStrengthSchema = z.number()
  .finite()
  .int()
  .min(0)
  .max(MAX_TEAM_STRENGTH)
  .nullable();

export const OFFICIAL_FPL_SOURCES = {
  bootstrapStatic: {
    name: 'bootstrap-static',
    url: 'https://fantasy.premierleague.com/api/bootstrap-static/'
  },
  fixtures: {
    name: 'fixtures',
    url: 'https://fantasy.premierleague.com/api/fixtures/'
  }
} as const;

export const PositionSchema = z.enum(['GK', 'DEF', 'MID', 'FWD']);
export type Position = z.infer<typeof PositionSchema>;

const optionalNullablePercentage = PercentageSchema.nullable().optional();
const optionalString = z.string().max(100).optional();

export const RawFplPlayerSchema = z.object({
  id: DatabaseIdSchema,
  code: DatabaseIdSchema.optional(),
  first_name: z.string().max(100),
  second_name: z.string().max(100),
  web_name: z.string().max(100),
  team: DatabaseIdSchema,
  element_type: z.number().finite().int().min(1).max(4),
  now_cost: z.number().finite().int().min(0).max(1_000),
  status: z.string().min(1).max(32),
  chance_of_playing_next_round: optionalNullablePercentage,
  chance_of_playing_this_round: optionalNullablePercentage,
  form: optionalString,
  selected_by_percent: optionalString,
  points_per_game: optionalString,
  value_season: optionalString,
  total_points: z.number().finite().int().min(MIN_TOTAL_POINTS).max(MAX_TOTAL_POINTS).optional(),
  minutes: z.number().finite().int().min(0).max(MAX_PLAYER_MINUTES).optional(),
  starts: z.number().finite().int().min(0).max(MAX_PLAYER_STARTS).optional(),
  expected_goals: optionalString,
  expected_assists: optionalString,
  expected_goal_involvements: optionalString,
  expected_goals_conceded: optionalString
}).passthrough();

export const RawFplTeamSchema = z.object({
  id: DatabaseIdSchema,
  code: DatabaseIdSchema.optional(),
  name: z.string().min(1).max(100),
  short_name: z.string().min(1).max(10),
  strength: z.number().finite().int().min(0).max(MAX_TEAM_STRENGTH).optional(),
  strength_overall_home: z.number().finite().int().min(0).max(MAX_TEAM_STRENGTH).optional(),
  strength_overall_away: z.number().finite().int().min(0).max(MAX_TEAM_STRENGTH).optional()
}).passthrough();

export const RawFplEventSchema = z.object({
  id: GameweekIdSchema,
  name: z.string().min(1).max(100),
  deadline_time: z.string().datetime({ offset: true }),
  average_entry_score: NullableGameweekScoreSchema.optional(),
  highest_score: NullableGameweekScoreSchema.optional(),
  finished: z.boolean(),
  data_checked: z.boolean(),
  is_current: z.boolean(),
  is_next: z.boolean()
}).passthrough();

export const RawBootstrapStaticSchema = z.object({
  elements: z.array(RawFplPlayerSchema).max(MAX_FPL_PLAYERS),
  teams: z.array(RawFplTeamSchema).max(MAX_FPL_TEAMS),
  events: z.array(RawFplEventSchema).max(MAX_FPL_EVENTS),
  current_event: GameweekIdSchema.nullable().optional()
}).passthrough();

export const RawFplFixtureSchema = z.object({
  id: DatabaseIdSchema,
  code: DatabaseIdSchema.optional(),
  event: GameweekIdSchema.nullable(),
  kickoff_time: z.string().datetime({ offset: true }).nullable(),
  team_h: DatabaseIdSchema,
  team_a: DatabaseIdSchema,
  team_h_score: NullableFixtureScoreSchema,
  team_a_score: NullableFixtureScoreSchema,
  team_h_difficulty: z.number().finite().int().min(1).max(5),
  team_a_difficulty: z.number().finite().int().min(1).max(5),
  started: z.boolean(),
  finished: z.boolean()
}).passthrough();

export const NormalizedPlayerSchema = z.object({
  id: DatabaseIdSchema,
  code: DatabaseIdSchema.nullable(),
  firstName: z.string().max(100),
  secondName: z.string().max(100),
  webName: z.string().max(100),
  displayName: z.string().min(1).max(200),
  teamId: DatabaseIdSchema,
  position: PositionSchema,
  nowCost: z.number().finite().min(0).max(MAX_PLAYER_COST),
  status: z.string().min(1).max(32),
  chanceOfPlayingNextRound: PercentageSchema.nullable(),
  chanceOfPlayingThisRound: PercentageSchema.nullable(),
  form: z.number().finite().min(MIN_PLAYER_FORM).max(MAX_PLAYER_FORM),
  selectedByPercent: z.number().finite().min(0).max(MAX_PERCENTAGE),
  pointsPerGame: z.number().finite().min(0).max(MAX_POINTS_PER_GAME),
  valueSeason: z.number().finite().min(0).max(MAX_VALUE_SEASON),
  totalPoints: z.number().finite().int().min(MIN_TOTAL_POINTS).max(MAX_TOTAL_POINTS),
  minutes: z.number().finite().int().min(0).max(MAX_PLAYER_MINUTES),
  starts: z.number().finite().int().min(0).max(MAX_PLAYER_STARTS),
  expectedGoals: z.number().finite().min(0).max(MAX_EXPECTED_STAT),
  expectedAssists: z.number().finite().min(0).max(MAX_EXPECTED_STAT),
  expectedGoalInvolvements: z.number().finite().min(0).max(MAX_EXPECTED_STAT),
  expectedGoalsConceded: z.number().finite().min(0).max(MAX_EXPECTED_STAT)
}).strict();
export type NormalizedPlayer = z.infer<typeof NormalizedPlayerSchema>;

export const NormalizedTeamSchema = z.object({
  id: DatabaseIdSchema,
  code: DatabaseIdSchema.nullable(),
  name: z.string().min(1).max(100),
  shortName: z.string().min(1).max(10),
  strength: NullableTeamStrengthSchema,
  strengthOverallHome: NullableTeamStrengthSchema,
  strengthOverallAway: NullableTeamStrengthSchema
}).strict();
export type NormalizedTeam = z.infer<typeof NormalizedTeamSchema>;

export const NormalizedEventSchema = z.object({
  id: GameweekIdSchema,
  name: z.string().min(1).max(100),
  deadlineTime: z.string().datetime({ offset: true }),
  averageEntryScore: NullableGameweekScoreSchema,
  highestScore: NullableGameweekScoreSchema,
  finished: z.boolean(),
  dataChecked: z.boolean(),
  isCurrent: z.boolean(),
  isNext: z.boolean()
}).strict();
export type NormalizedEvent = z.infer<typeof NormalizedEventSchema>;

export const NormalizedFixtureSchema = z.object({
  id: DatabaseIdSchema,
  code: DatabaseIdSchema.nullable(),
  eventId: GameweekIdSchema.nullable(),
  kickoffTime: z.string().datetime({ offset: true }).nullable(),
  teamHId: DatabaseIdSchema,
  teamAId: DatabaseIdSchema,
  teamHScore: NullableFixtureScoreSchema,
  teamAScore: NullableFixtureScoreSchema,
  teamHDifficulty: z.number().finite().int().min(1).max(5),
  teamADifficulty: z.number().finite().int().min(1).max(5),
  started: z.boolean(),
  finished: z.boolean()
}).strict();
export type NormalizedFixture = z.infer<typeof NormalizedFixtureSchema>;

export const FplSourceMetadataSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  fetchedAt: z.string().datetime({ offset: true }),
  httpDate: z.string().max(1_000).nullable(),
  etag: z.string().max(1_000).nullable(),
  lastModified: z.string().max(1_000).nullable()
}).strict();
export type FplSourceMetadata = z.infer<typeof FplSourceMetadataSchema>;

export const FplIngestionManifestSchema = z.object({
  schemaVersion: z.literal(1),
  season: z.string().min(1).max(32).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/).nullable(),
  generatedAt: z.string().datetime({ offset: true }),
  currentEventId: GameweekIdSchema.nullable(),
  sources: z.array(FplSourceMetadataSchema).min(1).max(10),
  recordCounts: z.object({
    players: z.number().finite().int().min(0).max(MAX_FPL_PLAYERS),
    teams: z.number().finite().int().min(0).max(MAX_FPL_TEAMS),
    events: z.number().finite().int().min(0).max(MAX_FPL_EVENTS),
    fixtures: z.number().finite().int().min(0).max(MAX_FPL_FIXTURES)
  }).strict()
}).strict();
export type FplIngestionManifest = z.infer<typeof FplIngestionManifestSchema>;

export const NormalizedFplDatasetSchema = z.object({
  manifest: FplIngestionManifestSchema,
  players: z.array(NormalizedPlayerSchema).max(MAX_FPL_PLAYERS),
  teams: z.array(NormalizedTeamSchema).max(MAX_FPL_TEAMS),
  events: z.array(NormalizedEventSchema).max(MAX_FPL_EVENTS),
  fixtures: z.array(NormalizedFixtureSchema).max(MAX_FPL_FIXTURES)
}).strict();
export type NormalizedFplDataset = z.infer<typeof NormalizedFplDatasetSchema>;
