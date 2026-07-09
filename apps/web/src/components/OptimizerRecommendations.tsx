import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileText,
  RefreshCw,
  ShieldCheck
} from 'lucide-react';
import {
  ConstraintValidationResult,
  OptimizerSquadSlot,
  PlayerPrediction,
  RecommendationExplanation,
  StartingXIRecommendation,
  TransferRecommendation
} from '../lib/types';
import { formatDelta, formatPrice, formatScore } from '../lib/format';
import LoadingSpinner from './LoadingSpinner';
import { apiClient } from '../lib/api';

type OptimizerRecommendationsProps = {
  startingXi?: StartingXIRecommendation | null;
  transferRecommendations?: TransferRecommendation[];
  isLoading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  contextNote?: string;
  onRetry?: () => void;
  targetGameweekId?: number;
  predictionRunIds?: number[];
};

const DEFAULT_EMPTY_MESSAGE = 'No optimizer recommendation is available for this squad yet.';
const EMPTY_TRANSFER_RECOMMENDATIONS: TransferRecommendation[] = [];

const OptimizerRecommendations = ({
  startingXi,
  transferRecommendations = EMPTY_TRANSFER_RECOMMENDATIONS,
  isLoading = false,
  error,
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
  contextNote,
  onRetry,
  targetGameweekId,
  predictionRunIds = []
}: OptimizerRecommendationsProps) => {
  const [explanation, setExplanation] = useState<RecommendationExplanation | null>(null);
  const [isExplanationLoading, setIsExplanationLoading] = useState(false);
  const [explanationError, setExplanationError] = useState<string | null>(null);
  const [explanationRefreshKey, setExplanationRefreshKey] = useState(0);

  useEffect(() => {
    if (!startingXi) {
      setExplanation(null);
      setExplanationError(null);
      setIsExplanationLoading(false);
      return;
    }

    let cancelled = false;

    const loadExplanation = async () => {
      setIsExplanationLoading(true);
      setExplanationError(null);

      try {
        const response = await apiClient.explainRecommendation({
          optimizerResult: {
            startingXi,
            transferRecommendations,
            targetGameweekId,
            predictionRunIds
          }
        });

        if (!response.success || !response.data) {
          throw response;
        }

        if (!cancelled) {
          setExplanation(response.data);
        }
      } catch {
        if (!cancelled) {
          setExplanation(null);
          setExplanationError('Could not load the recommendation explanation. Optimizer recommendations remain unchanged.');
        }
      } finally {
        if (!cancelled) {
          setIsExplanationLoading(false);
        }
      }
    };

    loadExplanation();

    return () => {
      cancelled = true;
    };
  }, [startingXi, transferRecommendations, targetGameweekId, predictionRunIds, explanationRefreshKey]);

  if (isLoading) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <LoadingSpinner text="Loading optimizer recommendations..." />
      </section>
    );
  }

  if (error) {
    return (
      <StatusPanel
        tone="error"
        title="Optimizer unavailable"
        message={error}
        action={onRetry ? { label: 'Retry optimizer', onClick: onRetry } : undefined}
      />
    );
  }

  if (!startingXi && transferRecommendations.length === 0) {
    return (
      <StatusPanel
        tone="info"
        title="No recommendation"
        message={emptyMessage}
        action={onRetry ? { label: 'Retry optimizer', onClick: onRetry } : undefined}
      />
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-fpl-dark">Transfer recommendation</h2>
          {contextNote && <p className="mt-1 text-sm text-gray-600">{contextNote}</p>}
        </div>
        <RecommendationMeta targetGameweekId={targetGameweekId} predictionRunIds={predictionRunIds} />
      </div>

      <TransfersSection recommendations={transferRecommendations} />

      <ExplanationDetails
        explanation={explanation}
        isLoading={isExplanationLoading}
        error={explanationError}
        onRetry={() => setExplanationRefreshKey(current => current + 1)}
      />

      {startingXi && <ConstraintDetails validation={startingXi.constraintSummary} />}
    </section>
  );
};

type StatusTone = 'error' | 'warning' | 'info';

type StatusPanelProps = {
  tone: StatusTone;
  title: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
};

const StatusPanel = ({ tone, title, message, action }: StatusPanelProps) => {
  const toneClass = {
    error: 'border-red-200 bg-red-50 text-red-800',
    warning: 'border-yellow-200 bg-yellow-50 text-yellow-800',
    info: 'border-gray-200 bg-white text-gray-800'
  }[tone];

  return (
    <section className={`rounded-lg border p-4 ${toneClass}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-1 text-sm">{message}</p>
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className="mt-3 inline-flex items-center gap-2 rounded-md border border-current bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4" />
              {action.label}
            </button>
          )}
        </div>
      </div>
    </section>
  );
};

type RecommendationMetaProps = {
  targetGameweekId?: number;
  predictionRunIds: number[];
};

const RecommendationMeta = ({ targetGameweekId, predictionRunIds }: RecommendationMetaProps) => {
  if (!targetGameweekId && predictionRunIds.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 text-xs text-gray-600">
      {targetGameweekId && (
        <span className="rounded-full border border-gray-200 bg-white px-3 py-1">GW {targetGameweekId}</span>
      )}
      {predictionRunIds.length > 0 && (
        <span className="rounded-full border border-gray-200 bg-white px-3 py-1">
          Prediction run {predictionRunIds.join(', ')}
        </span>
      )}
    </div>
  );
};

type TransfersSectionProps = {
  recommendations: TransferRecommendation[];
};

const TransfersSection = ({ recommendations }: TransfersSectionProps) => {
  if (recommendations.length === 0) {
    return (
      <StatusPanel
        tone="info"
        title="No transfer recommended"
        message="The optimizer did not find a valid transfer that improves projected points under the current constraints."
      />
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {recommendations.slice(0, 2).map((recommendation, index) => (
        <TransferCard
          key={recommendation.moves.map(move => `${move.playerOut.playerId}-${move.playerIn.playerId}`).join('|')}
          recommendation={recommendation}
          index={index}
        />
      ))}
    </div>
  );
};

type TransferCardProps = {
  recommendation: TransferRecommendation;
  index: number;
};

const TransferCard = ({ recommendation, index }: TransferCardProps) => (
  <article className="rounded-lg border border-gray-200 bg-white p-4">
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h3 className="font-semibold text-gray-950">
          Option {index + 1}: {recommendation.transferCount} transfer{recommendation.transferCount > 1 ? 's' : ''}
        </h3>
        <p className="text-sm text-gray-600">Net projected gain {formatDelta(recommendation.netExpectedPointsGain)} pts</p>
      </div>
      <span className="rounded-md border border-green-200 bg-green-50 px-2 py-1 text-sm font-semibold text-green-800">
        {formatDelta(recommendation.expectedPointsGain)}
      </span>
    </div>

    <div className="space-y-2">
      {recommendation.moves.map(move => (
        <div
          key={`${move.playerOut.playerId}-${move.playerIn.playerId}`}
          className="grid gap-2 rounded-md border border-gray-100 bg-gray-50 p-3 sm:grid-cols-[1fr_auto_1fr]"
        >
          <TransferPlayer label="Out" player={move.playerOut} />
          <div className="flex items-center justify-center text-gray-400">
            <ArrowRight className="h-4 w-4" />
          </div>
          <TransferPlayer label="In" player={move.playerIn} />
        </div>
      ))}
    </div>

    <div className="mt-3 grid gap-2 text-xs text-gray-600 sm:grid-cols-3">
      <span>Points hit: {recommendation.pointsHit}</span>
      <span>Bank after: {formatPrice(recommendation.bankAfterTransfers)}</span>
      <span>Projected XI: {formatScore(recommendation.startingXi.totalPredictedPoints)} xPts</span>
    </div>
  </article>
);

type TransferPlayerProps = {
  label: string;
  player: OptimizerSquadSlot | PlayerPrediction;
};

const TransferPlayer = ({ label, player }: TransferPlayerProps) => (
  <div className="min-w-0">
    <div className="text-xs font-semibold uppercase text-gray-500">{label}</div>
    <div className="truncate font-medium text-gray-950" title={player.playerName}>{player.playerName}</div>
    <div className="text-xs text-gray-600">
      {player.position} - {player.teamShortName || player.teamName || 'Team n/a'} - {formatPrice(player.price)}
    </div>
    <div className="text-xs text-gray-500">{formatScore(player.predictedPoints)} xPts</div>
  </div>
);

type ExplanationDetailsProps = {
  explanation: RecommendationExplanation | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
};

const ExplanationDetails = ({ explanation, isLoading, error, onRetry }: ExplanationDetailsProps) => (
  <details className="rounded-lg border border-gray-200 bg-white p-4">
    <summary className="cursor-pointer text-sm font-semibold text-gray-950">Explanation and limitations</summary>
    <div className="mt-4">
      {isLoading && <LoadingSpinner text="Preparing recommendation explanation..." />}
      {error && (
        <StatusPanel
          tone="warning"
          title="Explanation unavailable"
          message={error}
          action={{ label: 'Retry explanation', onClick: onRetry }}
        />
      )}
      {!isLoading && !error && !explanation && (
        <StatusPanel
          tone="info"
          title="Explanation pending"
          message="Explanation text appears after the optimizer returns a recommendation payload."
          action={{ label: 'Retry explanation', onClick: onRetry }}
        />
      )}
      {!isLoading && !error && explanation && <ExplanationContent explanation={explanation} />}
    </div>
  </details>
);

const ExplanationContent = ({ explanation }: { explanation: RecommendationExplanation }) => (
  <div className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-gray-100 p-2 text-gray-700">
          <FileText className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-950">Recommendation explanation</h3>
          <p className="mt-1 text-sm text-gray-700">{explanation.summary}</p>
        </div>
      </div>
      <div className="w-fit rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
        <div className="font-semibold text-gray-900">{formatAgentModeLabel(explanation)}</div>
        <div>{explanation.agentStatus.message}</div>
      </div>
    </div>

    {explanation.agentStatus.mode === 'deterministic_fallback' && (
      <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
        {explanation.fallbackReason ?? explanation.agentStatus.message}
      </div>
    )}

    <div className="grid gap-3 lg:grid-cols-2">
      <ExplanationList title="Recommended actions" items={explanation.recommendedActions} />
      <ExplanationList title="Risks" items={explanation.risks} />
      <ExplanationList title="Data limitations" items={explanation.dataLimitations} />
      <ExplanationList title="Constraint summary" items={explanation.constraintSummary} />
    </div>

    <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-700" />
        <p className="text-sm text-gray-700">{explanation.disclaimer}</p>
      </div>
    </div>
  </div>
);

const ExplanationList = ({ title, items }: { title: string; items: string[] }) => {
  if (items.length === 0) return null;

  return (
    <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
      <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
      <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
        {items.slice(0, 4).map((item, index) => (
          <li key={`${title}-${index}`} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-gray-400" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const ConstraintDetails = ({ validation }: { validation: ConstraintValidationResult }) => (
  <details className="rounded-lg border border-gray-200 bg-white p-4">
    <summary className="cursor-pointer text-sm font-semibold text-gray-950">Optimizer constraint details</summary>
    <div className="mt-3 flex items-start gap-2 text-sm text-gray-700">
      {validation.valid ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-700" />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-yellow-700" />
      )}
      <div>
        <p>
          {validation.valid
            ? `All ${validation.checks.length} optimizer checks passed.`
            : `${validation.violations.length} constraint issue(s) need attention.`}
        </p>
        {!validation.valid && (
          <ul className="mt-2 space-y-1">
            {validation.violations.slice(0, 3).map(violation => (
              <li key={`${violation.code}-${violation.key}`}>
                {humanizeKey(violation.key)}: expected {formatConstraintValue(violation.expected)}, got {formatConstraintValue(violation.actual)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  </details>
);

const formatAgentModeLabel = (explanation: RecommendationExplanation): string => {
  if (explanation.agentStatus.mode === 'deterministic_fallback') {
    return 'Deterministic fallback';
  }

  return `${formatProviderName(explanation.agentStatus.provider)} provider`;
};

const formatProviderName = (provider: RecommendationExplanation['agentStatus']['provider']): string => {
  switch (provider) {
    case 'openai':
      return 'OpenAI';
    case 'azure_openai':
      return 'Azure OpenAI';
    case 'deterministic_fallback':
      return 'Deterministic fallback';
  }
};

const humanizeKey = (value: string): string => {
  return value
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const formatConstraintValue = (value: number | string | Record<string, number>): string => {
  if (typeof value === 'number' || typeof value === 'string') {
    return String(value);
  }

  return Object.entries(value)
    .map(([key, entryValue]) => `${key}: ${entryValue}`)
    .join(', ');
};

export default OptimizerRecommendations;
