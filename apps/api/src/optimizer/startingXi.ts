import { Pos } from '../types';
import {
  FPL_RULES,
  OPTIMIZER_POSITIONS,
  VALID_FORMATION_ORDER,
  VALID_FORMATIONS,
  validateSquad,
  validateStartingXi
} from './rules';
import { OptimizerInputError } from './errors';
import {
  CaptaincyRecommendation,
  ConstraintValidationResult,
  Formation,
  PlayerCandidate,
  Squad,
  SquadSlot,
  StartingXI
} from './types';

type FormationCandidate = {
  formation: Formation;
  starters: SquadSlot[];
  bench: SquadSlot[];
  captaincy: CaptaincyRecommendation;
  totalPredictedPoints: number;
  constraintSummary: ConstraintValidationResult;
};

export function optimizeStartingXi(squad: Squad): StartingXI {
  const squadValidation = validateSquad(squad);
  if (!squadValidation.valid) {
    throw new OptimizerInputError('invalid_squad', squadValidation);
  }

  const candidates = VALID_FORMATION_ORDER
    .map(formation => buildFormationCandidate(squad, formation, squadValidation))
    .filter((candidate): candidate is FormationCandidate => candidate !== null)
    .sort(compareFormationCandidates);

  const best = candidates[0];
  if (!best) {
    throw new OptimizerInputError('invalid_formation', squadValidation);
  }

  return {
    formation: best.formation,
    starters: best.starters,
    bench: best.bench,
    captaincy: best.captaincy,
    totalPredictedPoints: best.totalPredictedPoints,
    constraintSummary: best.constraintSummary
  };
}

export function comparePlayerCandidates(left: PlayerCandidate, right: PlayerCandidate): number {
  if (right.predictedPoints !== left.predictedPoints) {
    return right.predictedPoints - left.predictedPoints;
  }

  const nameComparison = left.playerName.localeCompare(right.playerName);
  if (nameComparison !== 0) return nameComparison;

  return left.playerId - right.playerId;
}

function buildFormationCandidate(
  squad: Squad,
  formation: Formation,
  squadValidation: ConstraintValidationResult
): FormationCandidate | null {
  const formationCounts = VALID_FORMATIONS[formation];
  const starters = selectFormationStarters(squad.slots, formationCounts);
  if (starters.length !== FPL_RULES.startingXiSize) return null;

  const bench = selectBench(squad.slots, starters);
  const captaincy = selectCaptaincy(starters);
  const startingValidation = validateStartingXi({
    starters,
    bench,
    captainId: captaincy.captain.playerId,
    viceCaptainId: captaincy.viceCaptain.playerId
  });
  const constraintSummary = combineValidationResults(squadValidation, startingValidation);

  if (!constraintSummary.valid) return null;

  return {
    formation,
    starters,
    bench,
    captaincy,
    totalPredictedPoints: calculateTotalPredictedPoints(starters, captaincy),
    constraintSummary
  };
}

function selectFormationStarters(
  players: readonly SquadSlot[],
  formationCounts: Record<Pos, number>
): SquadSlot[] {
  return OPTIMIZER_POSITIONS.flatMap(position =>
    players
      .filter(player => player.position === position)
      .sort(comparePlayerCandidates)
      .slice(0, formationCounts[position])
  );
}

function selectBench(players: readonly SquadSlot[], starters: readonly SquadSlot[]): SquadSlot[] {
  const starterIds = new Set(starters.map(player => player.playerId));
  const bench = players.filter(player => !starterIds.has(player.playerId));
  const outfieldBench = bench
    .filter(player => player.position !== 'GK')
    .sort(comparePlayerCandidates);
  const goalkeeperBench = bench
    .filter(player => player.position === 'GK')
    .sort(comparePlayerCandidates);

  return [...outfieldBench, ...goalkeeperBench];
}

function selectCaptaincy(starters: readonly SquadSlot[]): CaptaincyRecommendation {
  const [captain, viceCaptain] = [...starters].sort(comparePlayerCandidates);
  if (!captain || !viceCaptain) {
    throw new Error('starting_xi_captaincy_unavailable');
  }

  return {
    captain,
    viceCaptain,
    captainPredictedPoints: captain.predictedPoints,
    viceCaptainPredictedPoints: viceCaptain.predictedPoints
  };
}

function calculateTotalPredictedPoints(
  starters: readonly SquadSlot[],
  captaincy: CaptaincyRecommendation
): number {
  const startingPoints = starters.reduce((sum, player) => sum + player.predictedPoints, 0);
  return roundPoints(startingPoints + captaincy.captain.predictedPoints);
}

function compareFormationCandidates(left: FormationCandidate, right: FormationCandidate): number {
  if (right.totalPredictedPoints !== left.totalPredictedPoints) {
    return right.totalPredictedPoints - left.totalPredictedPoints;
  }

  const formationComparison =
    VALID_FORMATION_ORDER.indexOf(left.formation) - VALID_FORMATION_ORDER.indexOf(right.formation);
  if (formationComparison !== 0) return formationComparison;

  return comparePlayerIdLists(left.starters, right.starters);
}

function comparePlayerIdLists(left: readonly SquadSlot[], right: readonly SquadSlot[]): number {
  const leftIds = left.map(player => player.playerId).sort((a, b) => a - b);
  const rightIds = right.map(player => player.playerId).sort((a, b) => a - b);
  for (let index = 0; index < Math.min(leftIds.length, rightIds.length); index += 1) {
    if (leftIds[index] !== rightIds[index]) {
      return leftIds[index] - rightIds[index];
    }
  }
  return leftIds.length - rightIds.length;
}

function combineValidationResults(
  left: ConstraintValidationResult,
  right: ConstraintValidationResult
): ConstraintValidationResult {
  const violations = [...left.violations, ...right.violations];
  return {
    valid: violations.length === 0,
    checks: [...left.checks, ...right.checks],
    violations
  };
}

function roundPoints(value: number): number {
  return Math.round(value * 100) / 100;
}
