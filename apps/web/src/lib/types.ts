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
  imageUrl?: string; // Player headshot image URL
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
  details?: any;
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
