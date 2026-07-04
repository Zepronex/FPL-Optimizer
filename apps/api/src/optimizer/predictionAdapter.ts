import { FPLStatus, PlayerPrediction } from '../types';
import { PlayerAvailability, PlayerCandidate } from './types';
import { comparePlayerCandidates } from './startingXi';

type CandidateAccumulator = {
  candidate: PlayerCandidate;
  fixtureIds: number[];
};

export function predictionsToCandidates(predictions: readonly PlayerPrediction[]): PlayerCandidate[] {
  const grouped = new Map<number, CandidateAccumulator>();

  for (const prediction of predictions) {
    const existing = grouped.get(prediction.playerId);
    if (existing) {
      existing.candidate.predictedPoints = roundPoints(
        existing.candidate.predictedPoints + prediction.predictedPoints
      );
      if (prediction.fixtureId !== null) existing.fixtureIds.push(prediction.fixtureId);
      existing.candidate.fixtureId = existing.fixtureIds.length === 1 ? existing.fixtureIds[0] : null;
      continue;
    }

    grouped.set(prediction.playerId, {
      candidate: {
        playerId: prediction.playerId,
        playerName: prediction.playerName,
        position: prediction.position,
        teamId: prediction.teamId,
        teamName: prediction.teamName,
        teamShortName: prediction.teamShortName,
        price: prediction.price,
        predictedPoints: prediction.predictedPoints,
        predictionRunId: prediction.predictionRunId,
        targetGameweekId: prediction.targetGameweekId,
        fixtureId: prediction.fixtureId,
        availability: toPlayerAvailability(prediction.status, prediction.chanceOfPlayingNextRound)
      },
      fixtureIds: prediction.fixtureId === null ? [] : [prediction.fixtureId]
    });
  }

  return [...grouped.values()]
    .map(value => value.candidate)
    .sort(comparePlayerCandidates);
}

export function toPlayerAvailability(
  status: FPLStatus,
  chanceOfPlayingNextRound: number | null
): PlayerAvailability {
  if (chanceOfPlayingNextRound === 0) return 'unavailable';
  if (status === 'a') return chanceOfPlayingNextRound === null || chanceOfPlayingNextRound >= 100
    ? 'available'
    : 'doubtful';
  if (status === 'd') return 'doubtful';
  if (status === 'i' || status === 'n' || status === 's' || status === 'u') return 'unavailable';
  return 'unknown';
}

function roundPoints(value: number): number {
  return Math.round(value * 100) / 100;
}
