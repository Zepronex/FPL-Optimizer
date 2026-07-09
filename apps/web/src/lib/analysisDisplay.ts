import { formatScore } from './format';
import { Pos, SquadAnalysis, StartingXIRecommendation } from './types';

export type ScoreSummary = {
  totalScore: number;
  averagePlayerScore: number;
  scoreSource: 'optimizer' | 'analysis';
};

export const formatScoreOutOf = (value: number | null | undefined, scale: 10 | 100): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return `n/a/${scale}`;
  }

  return `${formatScore(value)}/${scale}`;
};

export const getScoreSummary = (
  analysis: SquadAnalysis,
  startingXi?: StartingXIRecommendation | null
): ScoreSummary => {
  const optimizerTotal = finiteNumberOrNull(startingXi?.normalizedTeamScoreOutOf100);
  const optimizerAverage = finiteNumberOrNull(startingXi?.averagePlayerScoreOutOf10);

  if (optimizerTotal !== null && optimizerAverage !== null) {
    return {
      totalScore: optimizerTotal,
      averagePlayerScore: optimizerAverage,
      scoreSource: 'optimizer'
    };
  }

  return {
    totalScore: analysis.totalScore,
    averagePlayerScore: analysis.averageScore,
    scoreSource: 'analysis'
  };
};

export const groupPlayersByPosition = <T extends { position: Pos }>(
  players: readonly T[]
): Record<Pos, T[]> => ({
  GK: players.filter(player => player.position === 'GK'),
  DEF: players.filter(player => player.position === 'DEF'),
  MID: players.filter(player => player.position === 'MID'),
  FWD: players.filter(player => player.position === 'FWD')
});

const finiteNumberOrNull = (value: number | null | undefined): number | null => {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};
