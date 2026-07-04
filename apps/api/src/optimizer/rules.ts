import { Pos } from '../types';
import {
  ConstraintCheck,
  ConstraintValidationResult,
  ConstraintViolation,
  Formation,
  PlayerCandidate,
  Squad,
  SquadSlot
} from './types';

export const OPTIMIZER_POSITIONS: readonly Pos[] = ['GK', 'DEF', 'MID', 'FWD'];

export const SQUAD_POSITION_COUNTS: Record<Pos, number> = {
  GK: 2,
  DEF: 5,
  MID: 5,
  FWD: 3
};

export const VALID_FORMATION_ORDER: readonly Formation[] = [
  '3-4-3',
  '3-5-2',
  '4-4-2',
  '4-3-3',
  '4-5-1',
  '5-3-2',
  '5-4-1'
];

export const VALID_FORMATIONS: Record<Formation, Record<Pos, number>> = {
  '3-4-3': { GK: 1, DEF: 3, MID: 4, FWD: 3 },
  '3-5-2': { GK: 1, DEF: 3, MID: 5, FWD: 2 },
  '4-4-2': { GK: 1, DEF: 4, MID: 4, FWD: 2 },
  '4-3-3': { GK: 1, DEF: 4, MID: 3, FWD: 3 },
  '4-5-1': { GK: 1, DEF: 4, MID: 5, FWD: 1 },
  '5-3-2': { GK: 1, DEF: 5, MID: 3, FWD: 2 },
  '5-4-1': { GK: 1, DEF: 5, MID: 4, FWD: 1 }
};

export const FPL_RULES = {
  squadSize: 15,
  startingXiSize: 11,
  maxPlayersPerTeam: 3,
  squadPositionCounts: SQUAD_POSITION_COUNTS,
  validFormations: VALID_FORMATIONS
} as const;

export function countByPosition(players: readonly PlayerCandidate[]): Record<Pos, number> {
  return players.reduce<Record<Pos, number>>(
    (counts, player) => ({
      ...counts,
      [player.position]: counts[player.position] + 1
    }),
    emptyPositionCounts()
  );
}

export function countByTeam(players: readonly PlayerCandidate[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const player of players) {
    counts.set(player.teamId, (counts.get(player.teamId) ?? 0) + 1);
  }
  return counts;
}

export function calculateSquadCost(players: readonly PlayerCandidate[]): number {
  return roundMoney(players.reduce((sum, player) => sum + player.price, 0));
}

export function getFormation(starters: readonly PlayerCandidate[]): Formation | null {
  const counts = countByPosition(starters);
  const formation = `${counts.DEF}-${counts.MID}-${counts.FWD}` as Formation;
  return Object.prototype.hasOwnProperty.call(VALID_FORMATIONS, formation) ? formation : null;
}

export function validateSquad(squad: Squad): ConstraintValidationResult {
  const checks: ConstraintCheck[] = [];
  const violations: ConstraintViolation[] = [];
  const players = squad.slots;
  const totalBudget = roundMoney(calculateSquadCost(players) + squad.bank);

  pushCheck(checks, violations, {
    key: 'squad_size',
    passed: players.length === FPL_RULES.squadSize,
    expected: FPL_RULES.squadSize,
    actual: players.length,
    code: 'invalid_squad_size'
  });

  const duplicates = duplicatePlayerIds(players);
  pushCheck(checks, violations, {
    key: 'unique_players',
    passed: duplicates.length === 0,
    expected: players.length,
    actual: players.length - duplicates.length,
    code: 'duplicate_player',
    playerIds: duplicates
  });

  const positionCounts = countByPosition(players);
  for (const position of OPTIMIZER_POSITIONS) {
    pushCheck(checks, violations, {
      key: `squad_position_${position}`,
      passed: positionCounts[position] === FPL_RULES.squadPositionCounts[position],
      expected: FPL_RULES.squadPositionCounts[position],
      actual: positionCounts[position],
      code: 'invalid_position_count'
    });
  }

  const overTeamLimit = [...countByTeam(players).entries()]
    .filter(([, count]) => count > FPL_RULES.maxPlayersPerTeam)
    .sort(([leftTeamId], [rightTeamId]) => leftTeamId - rightTeamId);
  pushCheck(checks, violations, {
    key: 'max_players_per_team',
    passed: overTeamLimit.length === 0,
    expected: FPL_RULES.maxPlayersPerTeam,
    actual: overTeamLimit.length === 0 ? FPL_RULES.maxPlayersPerTeam : Math.max(...overTeamLimit.map(([, count]) => count)),
    code: 'max_players_per_team',
    teamId: overTeamLimit[0]?.[0]
  });

  pushCheck(checks, violations, {
    key: 'budget',
    passed: totalBudget <= squad.budget && squad.bank >= 0,
    expected: squad.budget,
    actual: totalBudget,
    code: 'invalid_budget'
  });

  return toValidationResult(checks, violations);
}

export function validateStartingXi(params: {
  starters: readonly SquadSlot[];
  bench: readonly SquadSlot[];
  captainId: number;
  viceCaptainId: number;
}): ConstraintValidationResult {
  const checks: ConstraintCheck[] = [];
  const violations: ConstraintViolation[] = [];
  const formation = getFormation(params.starters);
  const starterIds = new Set(params.starters.map(player => player.playerId));

  pushCheck(checks, violations, {
    key: 'starting_xi_size',
    passed: params.starters.length === FPL_RULES.startingXiSize,
    expected: FPL_RULES.startingXiSize,
    actual: params.starters.length,
    code: 'invalid_starting_xi_size'
  });

  pushCheck(checks, violations, {
    key: 'bench_size',
    passed: params.bench.length === FPL_RULES.squadSize - FPL_RULES.startingXiSize,
    expected: FPL_RULES.squadSize - FPL_RULES.startingXiSize,
    actual: params.bench.length,
    code: 'invalid_squad_size'
  });

  pushCheck(checks, violations, {
    key: 'formation',
    passed: formation !== null,
    expected: Object.keys(VALID_FORMATIONS).join(','),
    actual: formation ?? `${countByPosition(params.starters).DEF}-${countByPosition(params.starters).MID}-${countByPosition(params.starters).FWD}`,
    code: 'invalid_formation'
  });

  pushCheck(checks, violations, {
    key: 'captain_in_starting_xi',
    passed: starterIds.has(params.captainId),
    expected: 'starter_player_id',
    actual: params.captainId,
    code: 'invalid_captaincy',
    playerIds: [params.captainId]
  });

  pushCheck(checks, violations, {
    key: 'vice_captain_in_starting_xi',
    passed: starterIds.has(params.viceCaptainId),
    expected: 'starter_player_id',
    actual: params.viceCaptainId,
    code: 'invalid_captaincy',
    playerIds: [params.viceCaptainId]
  });

  pushCheck(checks, violations, {
    key: 'captain_vice_captain_distinct',
    passed: params.captainId !== params.viceCaptainId,
    expected: 'different_player_ids',
    actual: params.captainId === params.viceCaptainId ? 'same_player_id' : 'different_player_ids',
    code: 'invalid_captaincy',
    playerIds: [params.captainId, params.viceCaptainId]
  });

  return toValidationResult(checks, violations);
}

export function emptyPositionCounts(): Record<Pos, number> {
  return { GK: 0, DEF: 0, MID: 0, FWD: 0 };
}

export function roundMoney(value: number): number {
  return Math.round(value * 10) / 10;
}

function duplicatePlayerIds(players: readonly PlayerCandidate[]): number[] {
  const seen = new Set<number>();
  const duplicates = new Set<number>();
  for (const player of players) {
    if (seen.has(player.playerId)) {
      duplicates.add(player.playerId);
    }
    seen.add(player.playerId);
  }
  return [...duplicates].sort((left, right) => left - right);
}

function pushCheck(
  checks: ConstraintCheck[],
  violations: ConstraintViolation[],
  input: ConstraintCheck & Omit<ConstraintViolation, 'key' | 'expected' | 'actual'>
): void {
  const check: ConstraintCheck = {
    key: input.key,
    passed: input.passed,
    expected: input.expected,
    actual: input.actual
  };
  checks.push(check);

  if (!input.passed) {
    violations.push({
      code: input.code,
      key: input.key,
      expected: input.expected,
      actual: input.actual,
      playerIds: input.playerIds,
      teamId: input.teamId
    });
  }
}

function toValidationResult(
  checks: ConstraintCheck[],
  violations: ConstraintViolation[]
): ConstraintValidationResult {
  return {
    valid: violations.length === 0,
    checks,
    violations
  };
}
