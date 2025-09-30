// Shared types for FPL Optimizer

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
};

export type FPLPlayer = {
  id: number;
  first_name: string;
  second_name: string;
  web_name: string;
  team: number;
  element_type: number;
  now_cost: number;
  form: string;
  status: string;
  expected_goals: string;
  expected_assists: string;
  expected_goal_involvements: string;
  expected_goals_conceded: string;
  minutes: number;
};

export type FPLTeam = {
  id: number;
  name: string;
  short_name: string;
};

export type FPLFixture = {
  id: number;
  team_h: number;
  team_a: number;
  team_h_difficulty: number;
  team_a_difficulty: number;
  event: number;
};

