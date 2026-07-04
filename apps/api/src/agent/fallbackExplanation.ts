import {
  RecommendationExplanation,
  RecommendationExplanationInput,
  RecommendationExplanationSchema
} from './schemas';

export function buildFallbackExplanation(
  input: RecommendationExplanationInput,
  fallbackReason = 'Agent provider is disabled or unavailable.'
): RecommendationExplanation {
  const topTransfer = input.transferRecommendations[0];
  const invalidTransfer = input.transferRecommendations.find(recommendation => !recommendation.validation.valid);
  const players = collectPlayers(input);
  const unavailablePlayers = uniquePlayers(players)
    .filter(player => player.availability === 'doubtful' || player.availability === 'unavailable');
  const playersMissingPredictionRun = uniquePlayers(players)
    .filter(player => player.predictionRunId === undefined);

  const explanation = {
    summary: buildSummary(input, topTransfer),
    recommendedActions: buildRecommendedActions(input, topTransfer),
    startingXiReasoning: buildStartingXiReasoning(input),
    captaincyReasoning: buildCaptaincyReasoning(input),
    transferReasoning: buildTransferReasoning(input),
    risks: buildRisks(input, unavailablePlayers, invalidTransfer),
    alternatives: buildAlternatives(input),
    dataLimitations: buildDataLimitations(input, playersMissingPredictionRun),
    constraintSummary: buildConstraintSummary(input, invalidTransfer),
    disclaimer: 'The optimizer makes the recommendation. This explanation only summarizes optimizer output and prediction metadata.',
    provider: 'deterministic_fallback' as const,
    usedFallback: true,
    fallbackReason
  };

  return RecommendationExplanationSchema.parse(explanation);
}

function buildSummary(
  input: RecommendationExplanationInput,
  topTransfer: RecommendationExplanationInput['transferRecommendations'][number] | undefined
): string {
  const xi = input.startingXi;
  if (!topTransfer) {
    return `Optimizer recommends a ${xi.formation} starting XI projected for ${formatPoints(xi.totalPredictedPoints)} with no positive transfer option returned.`;
  }

  return `Optimizer recommends a ${xi.formation} starting XI projected for ${formatPoints(xi.totalPredictedPoints)}. The top transfer option has ${formatSignedPoints(topTransfer.netExpectedPointsGain)} net expected points.`;
}

function buildRecommendedActions(
  input: RecommendationExplanationInput,
  topTransfer: RecommendationExplanationInput['transferRecommendations'][number] | undefined
): string[] {
  const actions = [
    `Start ${input.startingXi.formation} with ${input.startingXi.starters.map(player => player.playerName).join(', ')}.`,
    `Captain ${input.startingXi.captaincy.captain.playerName} and vice captain ${input.startingXi.captaincy.viceCaptain.playerName}.`,
    `Bench order: ${input.startingXi.bench.map(player => player.playerName).join(', ')}.`
  ];

  if (topTransfer) {
    actions.push(`Top transfer option: ${formatTransferMoves(topTransfer)}.`);
  } else {
    actions.push('Hold transfers unless new optimizer data produces a positive expected points gain.');
  }

  return actions;
}

function buildStartingXiReasoning(input: RecommendationExplanationInput): string[] {
  const xi = input.startingXi;
  const highestStarter = [...xi.starters].sort(sortByPredictedPointsDesc)[0];
  const lowestBench = [...xi.bench].sort(sortByPredictedPointsDesc)[0];

  return [
    `${xi.formation} is the optimizer-selected valid formation for this squad.`,
    `The selected XI totals ${formatPoints(xi.totalPredictedPoints)} before captaincy display adjustments.`,
    `${highestStarter.playerName} is the highest projected starter at ${formatPoints(highestStarter.predictedPoints)}.`,
    `${lowestBench.playerName} is first bench with ${formatPoints(lowestBench.predictedPoints)}.`
  ];
}

function buildCaptaincyReasoning(input: RecommendationExplanationInput): string[] {
  const { captaincy } = input.startingXi;

  return [
    `${captaincy.captain.playerName} is captain on ${formatPoints(captaincy.captainPredictedPoints)}.`,
    `${captaincy.viceCaptain.playerName} is vice captain on ${formatPoints(captaincy.viceCaptainPredictedPoints)}.`,
    'Captaincy is reported from the optimizer output and is not recalculated by the explanation layer.'
  ];
}

function buildTransferReasoning(input: RecommendationExplanationInput): string[] {
  if (input.transferRecommendations.length === 0) {
    return ['No transfer recommendation was returned by the optimizer for this payload.'];
  }

  return input.transferRecommendations.slice(0, 3).map((recommendation, index) => {
    const rank = index + 1;
    return `Option ${rank}: ${formatTransferMoves(recommendation)} changes expected points by ${formatSignedPoints(recommendation.expectedPointsGain)}, applies a ${recommendation.pointsHit} point hit, and nets ${formatSignedPoints(recommendation.netExpectedPointsGain)}.`;
  });
}

function buildRisks(
  input: RecommendationExplanationInput,
  unavailablePlayers: ReturnType<typeof collectPlayers>,
  invalidTransfer: RecommendationExplanationInput['transferRecommendations'][number] | undefined
): string[] {
  const risks: string[] = [];

  if (!input.startingXi.constraintSummary.valid) {
    risks.push(`Starting XI constraints are invalid: ${formatViolations(input.startingXi.constraintSummary.violations)}.`);
  }

  if (invalidTransfer) {
    risks.push(`At least one transfer option has invalid constraints: ${formatViolations(invalidTransfer.validation.violations)}.`);
  }

  if (unavailablePlayers.length > 0) {
    risks.push(`Availability flags require review for ${unavailablePlayers.map(player => player.playerName).join(', ')}.`);
  }

  if (input.transferRecommendations.some(recommendation => recommendation.netExpectedPointsGain < 0)) {
    risks.push('One or more transfer options are negative after points hits.');
  }

  return risks.length > 0 ? risks : ['No optimizer constraint or availability risk was flagged in the supplied payload.'];
}

function buildAlternatives(input: RecommendationExplanationInput): string[] {
  const alternatives = input.transferRecommendations.slice(1, 4).map((recommendation, index) => {
    return `Alternative ${index + 1}: ${formatTransferMoves(recommendation)} for ${formatSignedPoints(recommendation.netExpectedPointsGain)} net expected points.`;
  });

  if (alternatives.length > 0) return alternatives;
  return ['No additional transfer alternatives were returned by the optimizer.'];
}

function buildDataLimitations(
  input: RecommendationExplanationInput,
  playersMissingPredictionRun: ReturnType<typeof collectPlayers>
): string[] {
  const limitations: string[] = [];

  if (input.predictionRunIds.length === 0) {
    limitations.push('No prediction run id was supplied with the optimizer result.');
  }

  if (!input.targetGameweekId) {
    limitations.push('No target gameweek id was supplied with the optimizer result.');
  }

  if (playersMissingPredictionRun.length > 0) {
    limitations.push(`${playersMissingPredictionRun.length} player(s) do not include prediction run metadata.`);
  }

  limitations.push('Prediction quality, player status, and fixture assumptions are limited to the supplied optimizer payload.');

  return limitations;
}

function buildConstraintSummary(
  input: RecommendationExplanationInput,
  invalidTransfer: RecommendationExplanationInput['transferRecommendations'][number] | undefined
): string[] {
  const xiValidation = input.startingXi.constraintSummary;
  const summary = [
    xiValidation.valid
      ? `Starting XI constraints passed ${xiValidation.checks.length} check(s).`
      : `Starting XI constraints failed ${xiValidation.violations.length} check(s): ${formatViolations(xiValidation.violations)}.`
  ];

  if (input.transferRecommendations.length === 0) {
    summary.push('No transfer constraints were supplied because no transfer recommendation was returned.');
  } else if (invalidTransfer) {
    summary.push(`Transfer constraints include an invalid option: ${formatViolations(invalidTransfer.validation.violations)}.`);
  } else {
    summary.push(`All ${input.transferRecommendations.length} supplied transfer option(s) passed validation.`);
  }

  return summary;
}

function collectPlayers(input: RecommendationExplanationInput) {
  const transferPlayers = input.transferRecommendations.flatMap(recommendation => [
    ...recommendation.moves.flatMap(move => [move.playerOut, move.playerIn]),
    ...recommendation.squadAfterTransfers.slots,
    ...recommendation.startingXi.starters,
    ...recommendation.startingXi.bench
  ]);

  return [
    ...input.startingXi.starters,
    ...input.startingXi.bench,
    ...transferPlayers
  ];
}

function uniquePlayers<T extends { playerId: number }>(players: T[]): T[] {
  const seen = new Set<number>();
  return players.filter(player => {
    if (seen.has(player.playerId)) return false;
    seen.add(player.playerId);
    return true;
  });
}

function sortByPredictedPointsDesc(
  left: { predictedPoints: number; playerId: number },
  right: { predictedPoints: number; playerId: number }
): number {
  return right.predictedPoints - left.predictedPoints || left.playerId - right.playerId;
}

function formatTransferMoves(recommendation: RecommendationExplanationInput['transferRecommendations'][number]): string {
  return recommendation.moves
    .map(move => `${move.playerOut.playerName} to ${move.playerIn.playerName}`)
    .join(', ');
}

function formatViolations(
  violations: Array<{ key: string; expected: number | string | Record<string, number>; actual: number | string | Record<string, number> }>
): string {
  if (violations.length === 0) return 'no violation details supplied';

  return violations
    .slice(0, 3)
    .map(violation => `${humanizeKey(violation.key)} expected ${formatConstraintValue(violation.expected)} and got ${formatConstraintValue(violation.actual)}`)
    .join('; ');
}

function humanizeKey(value: string): string {
  return value
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatConstraintValue(value: number | string | Record<string, number>): string {
  if (typeof value === 'number' || typeof value === 'string') {
    return String(value);
  }

  return Object.entries(value)
    .map(([key, entryValue]) => `${key}: ${entryValue}`)
    .join(', ');
}

function formatPoints(value: number): string {
  return `${formatNumber(value)} pts`;
}

function formatSignedPoints(value: number): string {
  return `${value >= 0 ? '+' : ''}${formatNumber(value)} pts`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
