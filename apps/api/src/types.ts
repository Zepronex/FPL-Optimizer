// Shared types for ScoutIQ

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

