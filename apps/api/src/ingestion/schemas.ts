import { z } from 'zod';

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

const nullableNumber = z.number().nullable();
const optionalNullableNumber = nullableNumber.optional();
const optionalString = z.string().optional();

export const RawFplPlayerSchema = z.object({
  id: z.number().int().positive(),
  code: z.number().int().positive().optional(),
  first_name: z.string(),
  second_name: z.string(),
  web_name: z.string(),
  team: z.number().int().positive(),
  element_type: z.number().int().min(1).max(4),
  now_cost: z.number().int().nonnegative(),
  status: z.string().min(1),
  chance_of_playing_next_round: optionalNullableNumber,
  chance_of_playing_this_round: optionalNullableNumber,
  form: optionalString,
  selected_by_percent: optionalString,
  points_per_game: optionalString,
  value_season: optionalString,
  total_points: z.number().int().optional(),
  minutes: z.number().int().nonnegative().optional(),
  starts: z.number().int().nonnegative().optional(),
  expected_goals: optionalString,
  expected_assists: optionalString,
  expected_goal_involvements: optionalString,
  expected_goals_conceded: optionalString
}).passthrough();

export const RawFplTeamSchema = z.object({
  id: z.number().int().positive(),
  code: z.number().int().positive().optional(),
  name: z.string().min(1),
  short_name: z.string().min(1),
  strength: z.number().int().optional(),
  strength_overall_home: z.number().int().optional(),
  strength_overall_away: z.number().int().optional()
}).passthrough();

export const RawFplEventSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  deadline_time: z.string().min(1),
  average_entry_score: optionalNullableNumber,
  highest_score: optionalNullableNumber,
  finished: z.boolean(),
  data_checked: z.boolean(),
  is_current: z.boolean(),
  is_next: z.boolean()
}).passthrough();

export const RawBootstrapStaticSchema = z.object({
  elements: z.array(RawFplPlayerSchema),
  teams: z.array(RawFplTeamSchema),
  events: z.array(RawFplEventSchema),
  current_event: z.number().int().positive().nullable().optional()
}).passthrough();

export const RawFplFixtureSchema = z.object({
  id: z.number().int().positive(),
  code: z.number().int().positive().optional(),
  event: z.number().int().positive().nullable(),
  kickoff_time: z.string().nullable(),
  team_h: z.number().int().positive(),
  team_a: z.number().int().positive(),
  team_h_score: z.number().int().nullable(),
  team_a_score: z.number().int().nullable(),
  team_h_difficulty: z.number().int().min(1).max(5),
  team_a_difficulty: z.number().int().min(1).max(5),
  started: z.boolean(),
  finished: z.boolean()
}).passthrough();

export const NormalizedPlayerSchema = z.object({
  id: z.number().int().positive(),
  code: z.number().int().positive().nullable(),
  firstName: z.string(),
  secondName: z.string(),
  webName: z.string(),
  displayName: z.string(),
  teamId: z.number().int().positive(),
  position: PositionSchema,
  nowCost: z.number().nonnegative(),
  status: z.string().min(1),
  chanceOfPlayingNextRound: z.number().int().min(0).max(100).nullable(),
  chanceOfPlayingThisRound: z.number().int().min(0).max(100).nullable(),
  form: z.number(),
  selectedByPercent: z.number().min(0),
  pointsPerGame: z.number().min(0),
  valueSeason: z.number().min(0),
  totalPoints: z.number().int(),
  minutes: z.number().int().nonnegative(),
  starts: z.number().int().nonnegative(),
  expectedGoals: z.number(),
  expectedAssists: z.number(),
  expectedGoalInvolvements: z.number(),
  expectedGoalsConceded: z.number()
}).strict();
export type NormalizedPlayer = z.infer<typeof NormalizedPlayerSchema>;

export const NormalizedTeamSchema = z.object({
  id: z.number().int().positive(),
  code: z.number().int().positive().nullable(),
  name: z.string().min(1),
  shortName: z.string().min(1),
  strength: z.number().int().nullable(),
  strengthOverallHome: z.number().int().nullable(),
  strengthOverallAway: z.number().int().nullable()
}).strict();
export type NormalizedTeam = z.infer<typeof NormalizedTeamSchema>;

export const NormalizedEventSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  deadlineTime: z.string().datetime({ offset: true }),
  averageEntryScore: z.number().nullable(),
  highestScore: z.number().nullable(),
  finished: z.boolean(),
  dataChecked: z.boolean(),
  isCurrent: z.boolean(),
  isNext: z.boolean()
}).strict();
export type NormalizedEvent = z.infer<typeof NormalizedEventSchema>;

export const NormalizedFixtureSchema = z.object({
  id: z.number().int().positive(),
  code: z.number().int().positive().nullable(),
  eventId: z.number().int().positive().nullable(),
  kickoffTime: z.string().datetime({ offset: true }).nullable(),
  teamHId: z.number().int().positive(),
  teamAId: z.number().int().positive(),
  teamHScore: z.number().int().nullable(),
  teamAScore: z.number().int().nullable(),
  teamHDifficulty: z.number().int().min(1).max(5),
  teamADifficulty: z.number().int().min(1).max(5),
  started: z.boolean(),
  finished: z.boolean()
}).strict();
export type NormalizedFixture = z.infer<typeof NormalizedFixtureSchema>;

export const FplSourceMetadataSchema = z.object({
  name: z.string(),
  url: z.string().url(),
  fetchedAt: z.string().datetime({ offset: true }),
  httpDate: z.string().nullable(),
  etag: z.string().nullable(),
  lastModified: z.string().nullable()
}).strict();
export type FplSourceMetadata = z.infer<typeof FplSourceMetadataSchema>;

export const FplIngestionManifestSchema = z.object({
  schemaVersion: z.literal(1),
  season: z.string().nullable(),
  generatedAt: z.string().datetime({ offset: true }),
  currentEventId: z.number().int().positive().nullable(),
  sources: z.array(FplSourceMetadataSchema),
  recordCounts: z.object({
    players: z.number().int().nonnegative(),
    teams: z.number().int().nonnegative(),
    events: z.number().int().nonnegative(),
    fixtures: z.number().int().nonnegative()
  }).strict()
}).strict();
export type FplIngestionManifest = z.infer<typeof FplIngestionManifestSchema>;

export const NormalizedFplDatasetSchema = z.object({
  manifest: FplIngestionManifestSchema,
  players: z.array(NormalizedPlayerSchema),
  teams: z.array(NormalizedTeamSchema),
  events: z.array(NormalizedEventSchema),
  fixtures: z.array(NormalizedFixtureSchema)
}).strict();
export type NormalizedFplDataset = z.infer<typeof NormalizedFplDatasetSchema>;
