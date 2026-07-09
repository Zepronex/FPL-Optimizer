import { isValidFormation } from './format';
import { Pos, Squad, SquadSlot } from './types';

const SQUAD_POSITION_COUNTS: Record<Pos, number> = {
  GK: 2,
  DEF: 5,
  MID: 5,
  FWD: 3
};

const MAX_PLAYERS_PER_TEAM = 3;
const BUDGET_LIMIT = 100;

export type SquadValidationResult = {
  valid: boolean;
  errors: string[];
};

export function validateSquadForAnalysis(squad: Squad): SquadValidationResult {
  const errors: string[] = [];
  const allPlayers = [...squad.startingXI, ...squad.bench];

  if (squad.startingXI.length !== 11) {
    errors.push(`Complete your starting XI (${squad.startingXI.length}/11 players).`);
  }

  if (squad.bench.length !== 4) {
    errors.push(`Complete your bench (${squad.bench.length}/4 players).`);
  }

  const duplicatePlayerIds = findDuplicatePlayerIds(allPlayers);
  if (duplicatePlayerIds.length > 0) {
    errors.push('Duplicate players are not allowed.');
  }

  const fullPositionCounts = countByPosition(allPlayers);
  const hasValidFullComposition = Object.entries(SQUAD_POSITION_COUNTS)
    .every(([position, expected]) => fullPositionCounts[position as Pos] === expected);

  if (allPlayers.length === 15 && !hasValidFullComposition) {
    errors.push('Full squad must include exactly 2 goalkeepers, 5 defenders, 5 midfielders and 3 forwards.');
  }

  const startingPositionCounts = countByPosition(squad.startingXI);
  if (squad.startingXI.length === 11 && startingPositionCounts.GK !== 1) {
    errors.push('Starting XI must include exactly 1 goalkeeper.');
  } else if (squad.startingXI.length === 11 && !isValidFormation(squad.startingXI)) {
    errors.push('Starting XI must use a valid formation: 3-5 defenders, 2-5 midfielders, 1-3 forwards.');
  }

  if (roundMoney(calculateSquadCost(allPlayers)) > BUDGET_LIMIT) {
    errors.push('Squad exceeds the 100.0m budget.');
  }

  if (hasTeamIds(allPlayers) && hasTeamLimitViolation(allPlayers)) {
    errors.push('A squad can include at most 3 players from the same club.');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function countByPosition(players: readonly SquadSlot[]): Record<Pos, number> {
  return players.reduce<Record<Pos, number>>(
    (counts, player) => ({
      ...counts,
      [player.pos]: counts[player.pos] + 1
    }),
    { GK: 0, DEF: 0, MID: 0, FWD: 0 }
  );
}

function findDuplicatePlayerIds(players: readonly SquadSlot[]): number[] {
  const seen = new Set<number>();
  const duplicates = new Set<number>();

  for (const player of players) {
    if (seen.has(player.id)) duplicates.add(player.id);
    seen.add(player.id);
  }

  return [...duplicates];
}

function calculateSquadCost(players: readonly SquadSlot[]): number {
  return players.reduce((sum, player) => sum + player.price, 0);
}

function hasTeamIds(players: readonly SquadSlot[]): boolean {
  return players.every(player => typeof player.teamId === 'number');
}

function hasTeamLimitViolation(players: readonly SquadSlot[]): boolean {
  const counts = new Map<number, number>();

  for (const player of players) {
    if (player.teamId === undefined) continue;
    const count = (counts.get(player.teamId) ?? 0) + 1;
    if (count > MAX_PLAYERS_PER_TEAM) return true;
    counts.set(player.teamId, count);
  }

  return false;
}

function roundMoney(value: number): number {
  return Math.round(value * 10) / 10;
}
