import { Pos } from '../types';

export type Formation = '3-4-3' | '3-5-2' | '4-4-2' | '4-3-3' | '4-5-1' | '5-3-2' | '5-4-1';

export type PlayerAvailability = 'available' | 'doubtful' | 'unavailable' | 'unknown';

export type PlayerCandidate = {
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

export type SquadSlot = PlayerCandidate & {
  slotIndex: number;
};

export type Squad = {
  slots: SquadSlot[];
  budget: number;
  bank: number;
};

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
  expected: number | string | Record<string, number>;
  actual: number | string | Record<string, number>;
};

export type ConstraintViolation = {
  code: ConstraintViolationCode;
  key: string;
  expected: number | string | Record<string, number>;
  actual: number | string | Record<string, number>;
  playerIds?: number[];
  teamId?: number;
};

export type ConstraintValidationResult = {
  valid: boolean;
  checks: ConstraintCheck[];
  violations: ConstraintViolation[];
};

export type CaptaincyRecommendation = {
  captain: SquadSlot;
  viceCaptain: SquadSlot;
  captainPredictedPoints: number;
  viceCaptainPredictedPoints: number;
};

export type StartingXI = {
  formation: Formation;
  starters: SquadSlot[];
  bench: SquadSlot[];
  captaincy: CaptaincyRecommendation;
  totalPredictedPoints: number;
  constraintSummary: ConstraintValidationResult;
};

export type TransferMove = {
  playerOut: SquadSlot;
  playerIn: PlayerCandidate;
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
  squadAfterTransfers: Squad;
  startingXi: StartingXI;
  validation: ConstraintValidationResult;
};

export type OptimizerResult = {
  squad: Squad;
  startingXi: StartingXI;
  transferRecommendations: TransferRecommendation[];
  predictionRunIds: number[];
  targetGameweekId?: number;
};
