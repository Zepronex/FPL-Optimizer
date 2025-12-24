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
  photo: string; // Player photo filename
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

