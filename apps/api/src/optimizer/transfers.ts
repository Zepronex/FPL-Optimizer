import { comparePlayerCandidates, optimizeStartingXi } from './startingXi';
import {
  PlayerCandidate,
  Squad,
  SquadSlot,
  TransferMove,
  TransferOptimizationInput,
  TransferRecommendation
} from './types';
import { roundMoney, validateSquad } from './rules';

const POINTS_PER_TRANSFER_HIT = 4;

export function recommendTransfers(input: TransferOptimizationInput): TransferRecommendation[] {
  const currentStartingXi = optimizeStartingXi(input.currentSquad);
  const maxHits = input.maxHits ?? 0;
  const recommendations: TransferRecommendation[] = [];

  const oneTransfer = bestRecommendationForCount(input, 1, currentStartingXi.totalPredictedPoints, maxHits);
  if (oneTransfer) recommendations.push(oneTransfer);

  const twoTransfer = bestRecommendationForCount(input, 2, currentStartingXi.totalPredictedPoints, maxHits);
  if (twoTransfer) recommendations.push(twoTransfer);

  return recommendations;
}

function bestRecommendationForCount(
  input: TransferOptimizationInput,
  transferCount: 1 | 2,
  currentProjectedPoints: number,
  maxHits: number
): TransferRecommendation | null {
  if (!isTransferCountAllowed(transferCount, input.freeTransfers, maxHits)) return null;

  const recommendations = transferCount === 1
    ? enumerateSingleTransfers(input, currentProjectedPoints)
    : enumerateDoubleTransfers(input, currentProjectedPoints);

  return recommendations.sort(compareTransferRecommendations)[0] ?? null;
}

function enumerateSingleTransfers(
  input: TransferOptimizationInput,
  currentProjectedPoints: number
): TransferRecommendation[] {
  const currentPlayerIds = new Set(input.currentSquad.slots.map(player => player.playerId));
  const candidates = filterIncomingCandidates(input.availablePlayers, currentPlayerIds);
  const recommendations: TransferRecommendation[] = [];

  for (const playerOut of input.currentSquad.slots) {
    for (const playerIn of candidates.filter(candidate => candidate.position === playerOut.position)) {
      const recommendation = buildRecommendation({
        currentSquad: input.currentSquad,
        moves: [toTransferMove(playerOut, playerIn)],
        freeTransfers: input.freeTransfers,
        currentProjectedPoints
      });
      if (recommendation) recommendations.push(recommendation);
    }
  }

  return recommendations;
}

function enumerateDoubleTransfers(
  input: TransferOptimizationInput,
  currentProjectedPoints: number
): TransferRecommendation[] {
  const currentPlayerIds = new Set(input.currentSquad.slots.map(player => player.playerId));
  const candidates = filterIncomingCandidates(input.availablePlayers, currentPlayerIds);
  const recommendations: TransferRecommendation[] = [];

  for (let firstOutIndex = 0; firstOutIndex < input.currentSquad.slots.length; firstOutIndex += 1) {
    for (let secondOutIndex = firstOutIndex + 1; secondOutIndex < input.currentSquad.slots.length; secondOutIndex += 1) {
      const firstOut = input.currentSquad.slots[firstOutIndex];
      const secondOut = input.currentSquad.slots[secondOutIndex];
      const firstPositionCandidates = candidates.filter(candidate => candidate.position === firstOut.position);
      const secondPositionCandidates = candidates.filter(candidate => candidate.position === secondOut.position);

      for (const firstIn of firstPositionCandidates) {
        for (const secondIn of secondPositionCandidates) {
          if (firstIn.playerId === secondIn.playerId) continue;

          const recommendation = buildRecommendation({
            currentSquad: input.currentSquad,
            moves: [toTransferMove(firstOut, firstIn), toTransferMove(secondOut, secondIn)],
            freeTransfers: input.freeTransfers,
            currentProjectedPoints
          });
          if (recommendation) recommendations.push(recommendation);
        }
      }
    }
  }

  return recommendations;
}

function buildRecommendation(params: {
  currentSquad: Squad;
  moves: TransferMove[];
  freeTransfers: number;
  currentProjectedPoints: number;
}): TransferRecommendation | null {
  const budgetImpact = roundMoney(params.moves.reduce((sum, move) => sum + move.costDelta, 0));
  const bankAfterTransfers = roundMoney(params.currentSquad.bank - budgetImpact);
  if (bankAfterTransfers < 0) return null;

  const squadAfterTransfers = applyTransferMoves(params.currentSquad, params.moves, bankAfterTransfers);
  const validation = validateSquad(squadAfterTransfers);
  if (!validation.valid) return null;

  const startingXi = optimizeStartingXi(squadAfterTransfers);
  const expectedPointsGain = roundPoints(startingXi.totalPredictedPoints - params.currentProjectedPoints);
  const pointsHit = Math.max(0, params.moves.length - params.freeTransfers) * POINTS_PER_TRANSFER_HIT;

  return {
    transferCount: params.moves.length as 1 | 2,
    moves: params.moves,
    expectedPointsGain,
    pointsHit,
    netExpectedPointsGain: roundPoints(expectedPointsGain - pointsHit),
    budgetImpact,
    bankAfterTransfers,
    squadAfterTransfers,
    startingXi,
    validation
  };
}

function applyTransferMoves(currentSquad: Squad, moves: TransferMove[], bank: number): Squad {
  const replacements = new Map<number, PlayerCandidate>();
  for (const move of moves) {
    replacements.set(move.playerOut.playerId, move.playerIn);
  }

  return {
    budget: currentSquad.budget,
    bank,
    slots: currentSquad.slots.map(slot => {
      const replacement = replacements.get(slot.playerId);
      return replacement ? toSquadSlot(replacement, slot.slotIndex) : slot;
    })
  };
}

function filterIncomingCandidates(
  availablePlayers: readonly PlayerCandidate[],
  currentPlayerIds: ReadonlySet<number>
): PlayerCandidate[] {
  return availablePlayers
    .filter(player => !currentPlayerIds.has(player.playerId))
    .filter(player => player.availability !== 'unavailable')
    .sort(comparePlayerCandidates);
}

function toTransferMove(playerOut: SquadSlot, playerIn: PlayerCandidate): TransferMove {
  return {
    playerOut,
    playerIn,
    predictedPointsDelta: roundPoints(playerIn.predictedPoints - playerOut.predictedPoints),
    costDelta: roundMoney(playerIn.price - playerOut.price)
  };
}

function toSquadSlot(player: PlayerCandidate, slotIndex: number): SquadSlot {
  return {
    ...player,
    slotIndex
  };
}

function isTransferCountAllowed(transferCount: number, freeTransfers: number, maxHits: number): boolean {
  const paidTransfers = Math.max(0, transferCount - freeTransfers);
  return paidTransfers <= maxHits;
}

function compareTransferRecommendations(
  left: TransferRecommendation,
  right: TransferRecommendation
): number {
  if (right.netExpectedPointsGain !== left.netExpectedPointsGain) {
    return right.netExpectedPointsGain - left.netExpectedPointsGain;
  }

  if (right.expectedPointsGain !== left.expectedPointsGain) {
    return right.expectedPointsGain - left.expectedPointsGain;
  }

  if (left.budgetImpact !== right.budgetImpact) {
    return left.budgetImpact - right.budgetImpact;
  }

  return transferKey(left).localeCompare(transferKey(right));
}

function transferKey(recommendation: TransferRecommendation): string {
  return recommendation.moves
    .map(move => `${move.playerOut.playerId}:${move.playerIn.playerName}:${move.playerIn.playerId}`)
    .join('|');
}

function roundPoints(value: number): number {
  return Math.round(value * 100) / 100;
}
