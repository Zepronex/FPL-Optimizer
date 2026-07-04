import { Pos } from '../types';
import { OptimizerInputError } from './errors';
import {
  FPL_RULES,
  OPTIMIZER_POSITIONS,
  calculateSquadCost,
  countByPosition,
  countByTeam,
  roundMoney,
  validateSquad
} from './rules';
import { comparePlayerCandidates } from './startingXi';
import { PlayerCandidate, Squad, SquadOptimizationInput, SquadSlot } from './types';

export function buildSquadFromCandidates(input: SquadOptimizationInput): Squad {
  const maxSpend = roundMoney(input.budget - (input.reservedBank ?? 0));
  if (maxSpend <= 0) {
    throw new Error('invalid_squad_budget');
  }

  const candidates = input.candidates
    .filter(candidate => candidate.availability !== 'unavailable')
    .sort(comparePlayerCandidates);
  const selected: PlayerCandidate[] = [];

  while (selected.length < FPL_RULES.squadSize) {
    const next = candidates.find(candidate => canSelectCandidate(candidate, selected, candidates, maxSpend));
    if (!next) {
      throw new Error('squad_generation_failed');
    }
    selected.push(next);
  }

  const ordered = orderSquadCandidates(selected);
  const squad: Squad = {
    budget: input.budget,
    bank: roundMoney(input.budget - calculateSquadCost(ordered)),
    slots: ordered.map((candidate, index) => ({
      ...candidate,
      slotIndex: index
    }))
  };

  const validation = validateSquad(squad);
  if (!validation.valid) {
    throw new OptimizerInputError('invalid_generated_squad', validation);
  }

  return squad;
}

function canSelectCandidate(
  candidate: PlayerCandidate,
  selected: readonly PlayerCandidate[],
  candidates: readonly PlayerCandidate[],
  maxSpend: number
): boolean {
  if (selected.some(player => player.playerId === candidate.playerId)) return false;

  const selectedPositionCounts = countByPosition(selected);
  if (selectedPositionCounts[candidate.position] >= FPL_RULES.squadPositionCounts[candidate.position]) {
    return false;
  }

  const selectedTeamCounts = countByTeam(selected);
  if ((selectedTeamCounts.get(candidate.teamId) ?? 0) >= FPL_RULES.maxPlayersPerTeam) {
    return false;
  }

  const withCandidate = [...selected, candidate];
  const currentCost = calculateSquadCost(withCandidate);
  const minimumRemainingCost = calculateMinimumRemainingCost(withCandidate, candidates);

  return roundMoney(currentCost + minimumRemainingCost) <= maxSpend;
}

function calculateMinimumRemainingCost(
  selected: readonly PlayerCandidate[],
  candidates: readonly PlayerCandidate[]
): number {
  const selectedIds = new Set(selected.map(player => player.playerId));
  const teamCounts = countByTeam(selected);
  const remainingCounts = remainingPositionCounts(selected);
  let cost = 0;

  for (const position of OPTIMIZER_POSITIONS) {
    for (let index = 0; index < remainingCounts[position]; index += 1) {
      const next = cheapestSelectableCandidate(position, candidates, selectedIds, teamCounts);
      if (!next) return Number.POSITIVE_INFINITY;

      selectedIds.add(next.playerId);
      teamCounts.set(next.teamId, (teamCounts.get(next.teamId) ?? 0) + 1);
      cost += next.price;
    }
  }

  return roundMoney(cost);
}

function cheapestSelectableCandidate(
  position: Pos,
  candidates: readonly PlayerCandidate[],
  selectedIds: ReadonlySet<number>,
  teamCounts: ReadonlyMap<number, number>
): PlayerCandidate | null {
  return [...candidates]
    .filter(candidate => candidate.position === position)
    .filter(candidate => !selectedIds.has(candidate.playerId))
    .filter(candidate => (teamCounts.get(candidate.teamId) ?? 0) < FPL_RULES.maxPlayersPerTeam)
    .sort(compareByPriceThenProjection)[0] ?? null;
}

function remainingPositionCounts(selected: readonly PlayerCandidate[]): Record<Pos, number> {
  const selectedCounts = countByPosition(selected);
  return {
    GK: FPL_RULES.squadPositionCounts.GK - selectedCounts.GK,
    DEF: FPL_RULES.squadPositionCounts.DEF - selectedCounts.DEF,
    MID: FPL_RULES.squadPositionCounts.MID - selectedCounts.MID,
    FWD: FPL_RULES.squadPositionCounts.FWD - selectedCounts.FWD
  };
}

function orderSquadCandidates(candidates: readonly PlayerCandidate[]): SquadSlot[] {
  return OPTIMIZER_POSITIONS.flatMap(position =>
    candidates
      .filter(candidate => candidate.position === position)
      .sort(comparePlayerCandidates)
  ).map((candidate, index) => ({
    ...candidate,
    slotIndex: index
  }));
}

function compareByPriceThenProjection(left: PlayerCandidate, right: PlayerCandidate): number {
  if (left.price !== right.price) return left.price - right.price;
  return comparePlayerCandidates(left, right);
}
