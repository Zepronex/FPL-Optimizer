// Shared types for FPL Optimizer Web App

export type Pos = 'GK' | 'DEF' | 'MID' | 'FWD';

export type EnrichedPlayer = {
  id: number;
  name: string;
  teamId: number;
  teamShort: string;
  pos: Pos;
  price: number;
  form: number;
  status: 'a' | 'd' | 'i' | 's';
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
  weights: AnalysisWeights;
  timestamp: string;
};

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  details?: unknown;
};

export type CountedApiResponse<T> = ApiResponse<T> & {
  count?: number;
};

export type Formation = '3-4-3' | '3-5-2' | '4-4-2' | '4-3-3' | '4-5-1' | '5-3-2' | '5-4-1';

export type PlayerAvailability = 'available' | 'doubtful' | 'unavailable' | 'unknown';

export type PlayerPrediction = {
  playerId: number;
  playerName: string;
  position: Pos;
  teamId: number;
  teamName?: string;
  teamShortName?: string;
  price: number;
  predictedPoints: number;
  predictionRunId?: number;
  targetGameweekId?: number;
  fixtureId?: number | null;
  availability?: PlayerAvailability;
};

export type OptimizerSquadSlot = PlayerPrediction & {
  slotIndex: number;
};

export type OptimizerSquad = {
  slots: OptimizerSquadSlot[];
  budget: number;
  bank: number;
};

export type OptimizerSquadInput = {
  slots?: PlayerPrediction[];
  playerIds?: number[];
  bank?: number;
  budget?: number;
};

export type ConstraintValue = number | string | Record<string, number>;

export type ConstraintViolationCode =
  | 'duplicate_player'
  | 'invalid_budget'
  | 'invalid_captaincy'
  | 'invalid_formation'
  | 'invalid_position_count'
  | 'invalid_squad_size'
  | 'invalid_starting_xi_size'
  | 'max_players_per_team'
  | 'transfer_count_exceeded'
  | 'unknown_player';

export type ConstraintCheck = {
  key: string;
  passed: boolean;
  expected: ConstraintValue;
  actual: ConstraintValue;
};

export type ConstraintViolation = {
  code: ConstraintViolationCode;
  key: string;
  expected: ConstraintValue;
  actual: ConstraintValue;
  playerIds?: number[];
  teamId?: number;
};

export type ConstraintValidationResult = {
  valid: boolean;
  checks: ConstraintCheck[];
  violations: ConstraintViolation[];
};

export type CaptaincyRecommendation = {
  captain: OptimizerSquadSlot;
  viceCaptain: OptimizerSquadSlot;
  captainPredictedPoints: number;
  viceCaptainPredictedPoints: number;
};

export type StartingXIRecommendation = {
  formation: Formation;
  starters: OptimizerSquadSlot[];
  bench: OptimizerSquadSlot[];
  captaincy: CaptaincyRecommendation;
  totalPredictedPoints: number;
  constraintSummary: ConstraintValidationResult;
};

export type TransferMove = {
  playerOut: OptimizerSquadSlot;
  playerIn: PlayerPrediction;
  predictedPointsDelta: number;
  costDelta: number;
};

export type TransferRecommendation = {
  transferCount: 1 | 2;
  moves: TransferMove[];
  expectedPointsGain: number;
  pointsHit: number;
  netExpectedPointsGain: number;
  budgetImpact: number;
  bankAfterTransfers: number;
  squadAfterTransfers: OptimizerSquad;
  startingXi: StartingXIRecommendation;
  validation: ConstraintValidationResult;
};

export type StartingXIOptimizerResult = {
  startingXi: StartingXIRecommendation;
  predictionRunIds: number[];
  targetGameweekId?: number;
};

export type TransferOptimizerResult = {
  currentStartingXi: StartingXIRecommendation;
  recommendations: TransferRecommendation[];
  predictionRunIds: number[];
  targetGameweekId?: number;
};

export type RecommendationExplanationInput = {
  startingXi: StartingXIRecommendation;
  transferRecommendations: TransferRecommendation[];
  predictionRunIds: number[];
  targetGameweekId?: number;
};

export type ExplainRecommendationRequest = {
  optimizerResult: RecommendationExplanationInput;
};

export type RecommendationExplanationProvider = 'deterministic_fallback' | 'openai' | 'azure_openai';

export type AgentProvider = 'openai' | 'azure_openai';
export type AgentExplanationMode = 'deterministic_fallback' | 'live_provider';
export type AgentFallbackReasonCode =
  | 'agent_disabled'
  | 'missing_openai_config'
  | 'missing_azure_openai_config'
  | 'missing_provider_config'
  | 'provider_error'
  | 'schema_validation_failed'
  | 'hallucination_guard_failed';

export type AgentExplanationStatus = {
  mode: AgentExplanationMode;
  provider: RecommendationExplanationProvider;
  providerConfigured: boolean;
  fallbackReasonCode?: AgentFallbackReasonCode;
  message: string;
};

export type AgentPublicStatus = {
  enabled: boolean;
  providerPreference: AgentProvider | 'auto';
  provider: AgentProvider | null;
  requiredConfigPresent: boolean;
  activeMode: 'deterministic_fallback' | 'provider_ready';
  model: string | null;
  fallbackReasonCode?: Extract<
    AgentFallbackReasonCode,
    'agent_disabled' | 'missing_openai_config' | 'missing_azure_openai_config' | 'missing_provider_config'
  >;
};

export type RecommendationExplanation = {
  summary: string;
  recommendedActions: string[];
  startingXiReasoning: string[];
  captaincyReasoning: string[];
  transferReasoning: string[];
  risks: string[];
  alternatives: string[];
  dataLimitations: string[];
  constraintSummary: string[];
  disclaimer: string;
  provider: RecommendationExplanationProvider;
  usedFallback: boolean;
  fallbackReason?: string;
  agentStatus: AgentExplanationStatus;
};

export type OptimizerResult = {
  squad: OptimizerSquad;
  startingXi: StartingXIRecommendation;
  predictionRunIds: number[];
  targetGameweekId?: number;
};

export type StartingXIRecommendationRequest = {
  squad: OptimizerSquadInput;
  gameweekId?: number;
};

export type TransferRecommendationRequest = {
  currentSquad: OptimizerSquadInput;
  availablePlayers?: PlayerPrediction[];
  gameweekId?: number;
  freeTransfers: number;
  maxHits?: number;
};

export type SquadOptimizationRequest = {
  availablePlayers?: PlayerPrediction[];
  gameweekId?: number;
  budget?: number;
  reservedBank?: number;
};

export type GeneratedTeamData = {
  squad: Squad;
  strategy: string;
  weights: AnalysisWeights;
  budget: number;
  totalCost?: number;
  expectedPoints?: number;
  mlPredictions?: unknown[];
  fallback?: boolean;
  error?: string;
};

export type PlayerSearchResult = {
  success: boolean;
  data?: EnrichedPlayer;
  error?: string;
};

export type PlayersResponse = {
  success: boolean;
  data?: EnrichedPlayer[];
  count?: number;
  error?: string;
};
