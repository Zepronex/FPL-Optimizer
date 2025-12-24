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

export type OptimizeRequest = {
  squad_player_ids: number[];
  bank: number;
  free_transfers: number;
  horizon: number;
  allow_hits?: boolean;
  max_extra_transfers?: number;
};

export type TransferPick = {
  player_id: number;
  name: string;
  price: number;
};

export type OptimizeResponse = {
  transfers_out: TransferPick[];
  transfers_in: TransferPick[];
  projected_points: {
    horizon: number;
    before: number;
    after: number;
    delta: number;
    hit_cost: number;
  };
  starting_xi_next_gw?: number[];
  meta?: Record<string, any>;
};
