// Shared types for ScoutIQ API data

export type Pos = 'GK' | 'DEF' | 'MID' | 'FWD';

export type EnrichedPlayer = {
  id: number;
  name: string;
  teamId: number;
  teamShort: string;
  pos: Pos;
  price: number;
  form: number;
  status: FPLStatus;
  xg90: number;
  xa90: number;
  expMin: number;
  next3Ease: number;
  // Additional metrics for enhanced scoring
  avgPoints: number; // Average FPL points per game
  value: number; // Points per million (value metric)
  ownership: number; // Ownership percentage (0-100)
  score?: number;
};

export type SquadSlot = {
  id: number;
  pos: Pos;
  price: number;
  name?: string;
  teamShort?: string;
};

export type Squad = {
  startingXI: SquadSlot[];
  bench: SquadSlot[];
  bank: number;
};

export type Suggestion = {
  id: number;
  name: string;
  price: number;
  delta: number;
};

export type AnalysisWeights = {
  form: number;
  xg90: number;
  xa90: number;
  expMin: number;
  next3Ease: number;
  avgPoints: number;
  value: number;
  ownership: number;
};

export type WeightPreset = {
  name: string;
  description: string;
  weights: AnalysisWeights;
};

export type PlayerLabel = 'perfect' | 'good' | 'poor' | 'urgent' | 'not-playing';

export type AnalysisResult = {
  player: EnrichedPlayer;
  score: number;
  label: PlayerLabel;
  suggestions: Suggestion[];
};

export type SquadAnalysis = {
  results: AnalysisResult[];
  averageScore: number;
  flaggedPlayers: number;
  bankLeft: number;
  totalScore: number;
};

export type FPLPlayer = {
  id: number;
  code?: number;
  first_name: string;
  second_name: string;
  web_name: string;
  team: number;
  element_type: number;
  now_cost: number;
  form: string;
  status: FPLStatus;
  chance_of_playing_next_round?: number | null;
  chance_of_playing_this_round?: number | null;
  selected_by_percent?: string;
  points_per_game?: string;
  value_season?: string;
  total_points?: number;
  starts?: number;
  expected_goals: string;
  expected_assists: string;
  expected_goal_involvements: string;
  expected_goals_conceded: string;
  minutes: number;
};

export type FPLTeam = {
  id: number;
  code?: number;
  name: string;
  short_name: string;
};

export type FPLFixture = {
  id: number;
  code?: number;
  team_h: number;
  team_a: number;
  team_h_difficulty: number;
  team_a_difficulty: number;
  team_h_score?: number | null;
  team_a_score?: number | null;
  event: number | null;
  kickoff_time?: string | null;
  started?: boolean;
  finished?: boolean;
};

export type FPLStatus = 'a' | 'd' | 'i' | 'n' | 's' | 'u';

export type PredictionRun = {
  id: number;
  runKey: string;
  modelName: string;
  modelVersion: string;
  targetGameweekId: number;
  predictionFileHash: string;
  modelArtifactHash: string | null;
  featureSnapshotHash: string | null;
  sourceSnapshotHash: string | null;
  sourceGeneratedAt: string | null;
  sourceRunId: number | null;
  predictionCount: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type PlayerPrediction = {
  id: number;
  predictionRunId: number;
  playerId: number;
  playerName: string;
  position: Pos;
  teamId: number;
  teamName: string;
  teamShortName: string;
  price: number;
  status: FPLStatus;
  chanceOfPlayingNextRound: number | null;
  chanceOfPlayingThisRound: number | null;
  targetGameweekId: number;
  fixtureId: number | null;
  predictedPoints: number;
  baselinePredictedPoints: number | null;
  confidence: number | null;
  uncertainty: number | null;
  sourceSnapshotHash: string | null;
  featureSnapshotHash: string | null;
  featureValues: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type PredictionSummary = {
  run: PredictionRun;
  predictions: PlayerPrediction[];
  count: number;
};

export type ModelEvaluation = {
  id: number;
  evaluationKey: string;
  modelName: string;
  modelVersion: string;
  evaluationType: string;
  predictionCount: number;
  metrics: Record<string, unknown>;
  baselineMetrics: Record<string, unknown> | null;
  metricsByPosition: Record<string, unknown> | null;
  baselineMetricsByPosition: Record<string, unknown> | null;
  evaluatedGameweeks: number[];
  skippedGameweeks: number[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type EvaluationMetricName = 'mae' | 'rmse';

export type EvaluationMetricComparison = {
  metric: EvaluationMetricName;
  modelValue: number | null;
  baselineValue: number | null;
  differenceVsBaseline: number | null;
  modelBeatsBaseline: boolean | null;
  lowerIsBetter: true;
};

export type EvaluationRunSummary = {
  id: number;
  evaluationKey: string;
  modelName: string;
  modelVersion: string;
  evaluationType: string;
  backtestRows: number | null;
  predictionCount: number;
  mae: EvaluationMetricComparison;
  rmse: EvaluationMetricComparison;
  evaluatedGameweeks: number[];
  skippedGameweeks: number[];
  evaluatedGameweekCount: number;
  skippedGameweekCount: number;
  createdAt: string;
  updatedAt: string;
  warnings: string[];
};

export type EvaluationPredictionRunMetadata = {
  id: number;
  runKey: string;
  modelName: string;
  modelVersion: string;
  targetGameweekId: number;
  predictionCount: number;
  sourceGeneratedAt: string | null;
  sourceSnapshotHash: string | null;
  featureSnapshotHash: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EvaluationLatest = {
  latestRun: EvaluationRunSummary | null;
  latestPredictionRun: EvaluationPredictionRunMetadata | null;
  requiredCommands: string[];
  limitations: string[];
  warnings: string[];
};

export type EvaluationRuns = {
  runs: EvaluationRunSummary[];
  count: number;
  warnings: string[];
};

export type EvaluationDataCoverageCounts = {
  players: number;
  teams: number;
  gameweeks: number;
  fixtures: number;
  playerGameweekHistoryRows: number | null;
  playerGameweekHistoryPlayers: number | null;
  latestPredictionRows: number;
  predictionRuns: number;
  evaluationRuns: number;
};

export type PlayerGameweekHistoryArtifact = {
  path: string;
  generatedAt: string | null;
  sourceName: string | null;
  playerCount: number | null;
  rowCount: number | null;
};

export type EvaluationDataHealth = {
  generatedAt: string;
  coverage: EvaluationDataCoverageCounts;
  latestPredictionRun: EvaluationPredictionRunMetadata | null;
  playerGameweekHistory: PlayerGameweekHistoryArtifact | null;
  requiredCommands: string[];
  warnings: string[];
};

