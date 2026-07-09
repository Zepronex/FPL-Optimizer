import { PlayerCandidate, Squad, SquadSlot, StartingXI, TransferRecommendation } from './types';

type ScoreInput = {
  playerId: number;
  position: PlayerCandidate['position'];
  predictedPoints?: number | null;
};

type DecoratedPlayer<T extends PlayerCandidate> = T & {
  displayScore: NonNullable<PlayerCandidate['displayScore']>;
};

export function decorateStartingXiScores(
  recommendation: StartingXI,
  comparisonPool: readonly ScoreInput[]
): StartingXI {
  const scoresByPlayerId = buildDisplayScoreMap(comparisonPool);
  const starters = decorateSquadSlots(recommendation.starters, scoresByPlayerId);
  const bench = decorateSquadSlots(recommendation.bench, scoresByPlayerId);
  const averagePlayerScoreOutOf10 = averageDisplayScore(starters);

  return {
    ...recommendation,
    starters,
    bench,
    captaincy: {
      ...recommendation.captaincy,
      captain: decorateSquadSlot(recommendation.captaincy.captain, scoresByPlayerId),
      viceCaptain: decorateSquadSlot(recommendation.captaincy.viceCaptain, scoresByPlayerId)
    },
    rawExpectedPoints: recommendation.totalPredictedPoints,
    averagePlayerScoreOutOf10,
    normalizedTeamScoreOutOf100: averagePlayerScoreOutOf10 === null
      ? null
      : roundScore(averagePlayerScoreOutOf10 * 10)
  };
}

export function decorateTransferScores(
  recommendation: TransferRecommendation,
  comparisonPool: readonly ScoreInput[]
): TransferRecommendation {
  const scoresByPlayerId = buildDisplayScoreMap(comparisonPool);

  return {
    ...recommendation,
    moves: recommendation.moves.map(move => ({
      ...move,
      playerOut: decorateSquadSlot(move.playerOut, scoresByPlayerId),
      playerIn: decoratePlayer(move.playerIn, scoresByPlayerId)
    })),
    squadAfterTransfers: decorateSquad(recommendation.squadAfterTransfers, scoresByPlayerId),
    startingXi: decorateStartingXiScores(recommendation.startingXi, comparisonPool)
  };
}

export function buildDisplayScoreMap(
  players: readonly ScoreInput[]
): Map<number, NonNullable<PlayerCandidate['displayScore']>> {
  const finitePlayers = players.filter(hasFinitePredictedPoints);
  const groups = new Map<PlayerCandidate['position'], ScoreInput[]>();

  for (const player of finitePlayers) {
    const group = groups.get(player.position) ?? [];
    group.push(player);
    groups.set(player.position, group);
  }

  const displayScores = new Map<number, NonNullable<PlayerCandidate['displayScore']>>();

  for (const player of players) {
    const rawExpectedPoints = hasFinitePredictedPoints(player) ? player.predictedPoints : null;
    const positionPool = groups.get(player.position) ?? [];

    if (rawExpectedPoints === null || positionPool.length === 0) {
      displayScores.set(player.playerId, {
        rawExpectedPoints,
        contextualScoreOutOf10: null,
        positionPercentile: null,
        positionPoolSize: positionPool.length
      });
      continue;
    }

    const scoreOutOf10 = calculatePositionScore(rawExpectedPoints, positionPool);
    displayScores.set(player.playerId, {
      rawExpectedPoints: roundScore(rawExpectedPoints),
      contextualScoreOutOf10: scoreOutOf10,
      positionPercentile: roundScore(scoreOutOf10 * 10),
      positionPoolSize: positionPool.length
    });
  }

  return displayScores;
}

function decorateSquad(squad: Squad, scoresByPlayerId: Map<number, NonNullable<PlayerCandidate['displayScore']>>): Squad {
  return {
    ...squad,
    slots: decorateSquadSlots(squad.slots, scoresByPlayerId)
  };
}

function decorateSquadSlots(
  players: readonly SquadSlot[],
  scoresByPlayerId: Map<number, NonNullable<PlayerCandidate['displayScore']>>
): SquadSlot[] {
  return players.map(player => decorateSquadSlot(player, scoresByPlayerId));
}

function decorateSquadSlot(
  player: SquadSlot,
  scoresByPlayerId: Map<number, NonNullable<PlayerCandidate['displayScore']>>
): SquadSlot {
  return decoratePlayer(player, scoresByPlayerId);
}

function decoratePlayer<T extends PlayerCandidate>(
  player: T,
  scoresByPlayerId: Map<number, NonNullable<PlayerCandidate['displayScore']>>
): DecoratedPlayer<T> {
  return {
    ...player,
    displayScore: scoresByPlayerId.get(player.playerId) ?? {
      rawExpectedPoints: hasFinitePredictedPoints(player) ? roundScore(player.predictedPoints) : null,
      contextualScoreOutOf10: null,
      positionPercentile: null,
      positionPoolSize: 0
    }
  };
}

function averageDisplayScore(players: readonly PlayerCandidate[]): number | null {
  const values = players
    .map(player => player.displayScore?.contextualScoreOutOf10)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  if (values.length === 0) return null;

  return roundScore(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function calculatePositionScore(rawExpectedPoints: number, positionPool: readonly ScoreInput[]): number {
  const sortedPoints = positionPool
    .map(player => player.predictedPoints)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    .sort((left, right) => left - right);

  if (sortedPoints.length <= 1) return 5;

  const tiedIndexes = sortedPoints
    .map((value, index) => ({ value, index }))
    .filter(entry => entry.value === rawExpectedPoints)
    .map(entry => entry.index);

  if (tiedIndexes.length === 0) return 0;

  const averageIndex = tiedIndexes.reduce((sum, index) => sum + index, 0) / tiedIndexes.length;
  return roundScore((averageIndex / (sortedPoints.length - 1)) * 10);
}

function hasFinitePredictedPoints<T extends ScoreInput>(
  player: T
): player is T & { predictedPoints: number } {
  return typeof player.predictedPoints === 'number' && Number.isFinite(player.predictedPoints);
}

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}
