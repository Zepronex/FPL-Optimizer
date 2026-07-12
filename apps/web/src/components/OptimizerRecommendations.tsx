import { useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Coins,
  FileText,
  RefreshCw,
  ShieldCheck,
  Trophy,
  Users
} from 'lucide-react';
import {
  ConstraintValidationResult,
  OptimizerSquadSlot,
  RecommendationExplanation,
  StartingXIRecommendation,
  TransferRecommendation
} from '../lib/types';
import { formatDelta, formatPrice, formatScore, getPositionColor } from '../lib/format';
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
      <section className="rounded-lg border border-gray-200 bg-white p-6">
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
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-fpl-dark">Optimizer recommendations</h2>
          <p className="text-sm text-gray-600">
            Prediction-backed squad decisions for the selected gameweek.
          </p>
          {contextNote && (
            <p className="mt-1 text-xs text-gray-500">{contextNote}</p>
          )}
        </div>
        <RecommendationMeta
          targetGameweekId={targetGameweekId}
          predictionRunIds={predictionRunIds}
        />
      </div>

      {startingXi && (
        <StartingXiSection recommendation={startingXi} />
      )}

      {transferRecommendations.length > 0 ? (
        <TransfersSection recommendations={transferRecommendations} />
      ) : (
        <StatusPanel
          tone="info"
          title="No transfer improvement found"
          message="The optimizer did not find a valid transfer that improves projected points under the current squad rules."
        />
      )}

      <ExplanationPanel
        explanation={explanation}
        isLoading={isExplanationLoading}
        error={explanationError}
        onRetry={() => setExplanationRefreshKey(current => current + 1)}
      />
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
    info: 'border-blue-200 bg-blue-50 text-blue-800'
  }[tone];

  return (
    <section className={`rounded-lg border p-5 ${toneClass}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-1 text-sm">{message}</p>
          {action && (
            <button
              onClick={action.onClick}
              className="mt-3 inline-flex items-center rounded-md border border-current bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
            >
              <RefreshCw className="mr-1 h-4 w-4" />
              {action.label}
            </button>
          )}
        </div>
      </div>
    </section>
  );
};

type ExplanationPanelProps = {
  explanation: RecommendationExplanation | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
};

const ExplanationPanel = ({ explanation, isLoading, error, onRetry }: ExplanationPanelProps) => {
  if (isLoading) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <LoadingSpinner text="Preparing recommendation explanation..." />
        <p className="mt-3 text-center text-sm text-gray-600">
          The optimizer result has already been produced; this step only prepares explanatory text.
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <StatusPanel
        tone="warning"
        title="Explanation unavailable"
        message={error}
        action={{ label: 'Retry explanation', onClick: onRetry }}
      />
    );
  }

  if (!explanation) {
    return (
      <StatusPanel
        tone="info"
        title="Explanation pending"
        message="An explanation will appear after the optimizer returns a recommendation payload."
        action={{ label: 'Retry explanation', onClick: onRetry }}
      />
    );
  }

  const modeLabel = formatAgentModeLabel(explanation);
  const fallbackMessage = explanation.fallbackReason ?? explanation.agentStatus.message;

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-gray-100 p-2 text-gray-700">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-fpl-dark">Recommendation explanation</h3>
            <p className="mt-1 text-sm text-gray-600">{explanation.summary}</p>
          </div>
        </div>
        <div className="w-fit rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <div className="text-xs font-semibold uppercase text-gray-500">Explanation mode</div>
          <div className="font-medium text-gray-900">{modeLabel}</div>
          <div className="mt-1 max-w-xs text-xs text-gray-600">{explanation.agentStatus.message}</div>
        </div>
      </div>

      {explanation.agentStatus.mode === 'deterministic_fallback' && (
        <div className="mb-5 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
          <p>{fallbackMessage}</p>
          <p className="mt-2">
            Recommendations remain valid because the optimizer selected the players, transfers, captaincy and bench order before this explanation was generated.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ExplanationSection title="Recommended actions" items={explanation.recommendedActions} />
        <ExplanationSection title="Starting XI reasoning" items={explanation.startingXiReasoning} />
        <ExplanationSection title="Captaincy reasoning" items={explanation.captaincyReasoning} />
        <ExplanationSection title="Transfer reasoning" items={explanation.transferReasoning} />
        <ExplanationSection title="Risks" items={explanation.risks} />
        <ExplanationSection title="Alternatives" items={explanation.alternatives} />
        <ExplanationSection title="Data notes" items={explanation.dataLimitations} />
        <ExplanationSection title="Rule-check details" items={explanation.constraintSummary} />
      </div>

      <div className="mt-5 rounded-md border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-700" />
          <div>
            <h4 className="text-sm font-semibold text-gray-900">Why this is safe</h4>
            <p className="mt-1 text-sm text-gray-600">
              The optimizer result remains unchanged. Provider narrative is size-bounded and must pass schema and grounding checks before display, but free text is not treated as a new optimizer decision. If checks fail, deterministic fallback is used.
            </p>
          </div>
        </div>
      </div>

      <p className="mt-5 border-t border-gray-200 pt-4 text-sm text-gray-600">
        {explanation.disclaimer}
      </p>
    </section>
  );
};

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

type ExplanationSectionProps = {
  title: string;
  items: string[];
};

const ExplanationSection = ({ title, items }: ExplanationSectionProps) => {
  if (items.length === 0) return null;

  return (
    <div className="rounded-md border border-gray-100 bg-gray-50 p-4">
      <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
      <ul className="mt-3 space-y-2 text-sm text-gray-700">
        {items.map((item, index) => (
          <li key={`${title}-${index}`} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-gray-400" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
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
        <span className="rounded-full border border-gray-200 bg-white px-3 py-1">
          GW {targetGameweekId}
        </span>
      )}
      {predictionRunIds.length > 0 && (
        <span className="rounded-full border border-gray-200 bg-white px-3 py-1">
          Prediction run {predictionRunIds.join(', ')}
        </span>
      )}
    </div>
  );
};

type StartingXiSectionProps = {
  recommendation: StartingXIRecommendation;
};

const StartingXiSection = ({ recommendation }: StartingXiSectionProps) => {
  const unavailablePlayers = [...recommendation.starters, ...recommendation.bench]
    .filter(player => player.availability === 'doubtful' || player.availability === 'unavailable');

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <MetricTile
          icon={<Users className="h-5 w-5" />}
          label="Formation"
          value={recommendation.formation}
        />
        <MetricTile
          icon={<Trophy className="h-5 w-5" />}
          label="Expected points"
          value={formatScore(recommendation.totalPredictedPoints)}
        />
        <MetricTile
          icon={<ShieldCheck className="h-5 w-5" />}
          label="Rule checks"
          value={recommendation.constraintSummary.valid ? 'Valid' : 'Invalid'}
          tone={recommendation.constraintSummary.valid ? 'success' : 'warning'}
        />
      </div>

      <CaptaincyPanel recommendation={recommendation} />

      {unavailablePlayers.length > 0 && (
        <StatusPanel
          tone="warning"
          title="Availability warning"
          message={`${unavailablePlayers.length} recommended player(s) are marked doubtful or unavailable in the prediction data.`}
        />
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Recommended starting XI</h3>
            <span className="text-sm text-gray-500">{recommendation.starters.length} players</span>
          </div>
          <div className="space-y-2">
            {recommendation.starters.map(player => (
              <PlayerProjectionRow
                key={player.playerId}
                player={player}
              />
            ))}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Bench order</h3>
            <span className="text-sm text-gray-500">{recommendation.bench.length} players</span>
          </div>
          <div className="space-y-2">
            {recommendation.bench.map((player, index) => (
              <PlayerProjectionRow
                key={player.playerId}
                player={player}
                prefix={`${index + 1}`}
              />
            ))}
          </div>
        </div>
      </div>

      <ConstraintSummary validation={recommendation.constraintSummary} />
    </div>
  );
};

type MetricTileProps = {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning';
};

const MetricTile = ({ icon, label, value, tone = 'default' }: MetricTileProps) => {
  const toneClass = {
    default: 'bg-gray-50 text-fpl-dark',
    success: 'bg-green-50 text-green-700',
    warning: 'bg-yellow-50 text-yellow-700'
  }[tone];

  return (
    <div className={`rounded-lg border border-gray-200 p-4 ${toneClass}`}>
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
};

type CaptaincyPanelProps = {
  recommendation: StartingXIRecommendation;
};

const CaptaincyPanel = ({ recommendation }: CaptaincyPanelProps) => {
  const { captaincy } = recommendation;

  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-2">
      <CaptaincyPlayer
        label="Captain"
        badge="C"
        player={captaincy.captain}
        points={captaincy.captainPredictedPoints}
      />
      <CaptaincyPlayer
        label="Vice captain"
        badge="VC"
        player={captaincy.viceCaptain}
        points={captaincy.viceCaptainPredictedPoints}
      />
    </div>
  );
};

type CaptaincyPlayerProps = {
  label: string;
  badge: string;
  player: OptimizerSquadSlot;
  points: number;
};

const CaptaincyPlayer = ({ label, badge, player, points }: CaptaincyPlayerProps) => (
  <div className="rounded-lg border border-green-200 bg-green-50 p-4">
    <div className="mb-2 flex items-center justify-between">
      <span className="text-sm font-medium text-green-800">{label}</span>
      <span className="rounded-full bg-green-700 px-2 py-1 text-xs font-bold text-white">{badge}</span>
    </div>
    <div className="font-semibold text-gray-900">{player.playerName}</div>
    <div className="mt-1 text-sm text-gray-600">
      {player.position} - {formatScore(points)} projected points
    </div>
  </div>
);

type PlayerProjectionRowProps = {
  player: OptimizerSquadSlot;
  prefix?: string;
};

const PlayerProjectionRow = ({ player, prefix }: PlayerProjectionRowProps) => (
  <div className="flex items-center gap-3 rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
    {prefix && (
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-gray-600">
        {prefix}
      </span>
    )}
    <span className={`rounded px-2 py-1 text-xs font-semibold ${getPositionColor(player.position)}`}>
      {player.position}
    </span>
    <div className="min-w-0 flex-1">
      <div className="truncate font-medium text-gray-900">{player.playerName}</div>
      <div className="truncate text-xs text-gray-500">
        {player.teamShortName || player.teamName || 'Team unknown'} - {formatPrice(player.price)}
      </div>
    </div>
    {player.availability && player.availability !== 'available' && player.availability !== 'unknown' && (
      <span className="rounded bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800">
        {player.availability}
      </span>
    )}
    <div className="text-right">
      <div className="font-semibold text-fpl-dark">{formatScore(player.predictedPoints)}</div>
      <div className="text-xs text-gray-500">pts</div>
    </div>
  </div>
);

type ConstraintSummaryProps = {
  validation: ConstraintValidationResult;
};

const ConstraintSummary = ({ validation }: ConstraintSummaryProps) => (
  <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4">
    <div className="flex items-center gap-2">
      {validation.valid ? (
        <CheckCircle2 className="h-5 w-5 text-green-600" />
      ) : (
        <AlertTriangle className="h-5 w-5 text-yellow-600" />
      )}
      <h3 className="font-semibold text-gray-900">Rule validation</h3>
    </div>
    <p className="mt-1 text-sm text-gray-600">
      {validation.valid
        ? `All ${validation.checks.length} optimizer checks passed.`
        : `${validation.violations.length} rule issue(s) need attention.`}
    </p>
    {!validation.valid && (
      <ul className="mt-3 space-y-2 text-sm text-gray-700">
        {validation.violations.slice(0, 3).map(violation => (
          <li key={`${violation.code}-${violation.key}`} className="rounded border border-yellow-200 bg-white p-2">
            <span className="font-medium">{humanizeKey(violation.key)}:</span>{' '}
            expected {formatConstraintValue(violation.expected)}, got {formatConstraintValue(violation.actual)}
          </li>
        ))}
      </ul>
    )}
  </div>
);

type TransfersSectionProps = {
  recommendations: TransferRecommendation[];
};

const TransfersSection = ({ recommendations }: TransfersSectionProps) => (
  <div className="rounded-lg border border-gray-200 bg-white p-5">
    <div className="mb-4 flex items-center justify-between">
      <div>
        <h3 className="text-xl font-semibold text-fpl-dark">Recommended transfer options</h3>
        <p className="text-sm text-gray-600">Ranked by net projected points gain.</p>
      </div>
      <Coins className="h-6 w-6 text-fpl-green" />
    </div>

    <div className="space-y-4">
      {recommendations.map(recommendation => (
        <TransferOption
          key={recommendation.moves.map(move => `${move.playerOut.playerId}-${move.playerIn.playerId}`).join('|')}
          recommendation={recommendation}
        />
      ))}
    </div>
  </div>
);

type TransferOptionProps = {
  recommendation: TransferRecommendation;
};

const TransferOption = ({ recommendation }: TransferOptionProps) => (
  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
    <div className="mb-4 grid gap-3 sm:grid-cols-4">
      <TransferMetric label="Transfers" value={`${recommendation.transferCount}`} />
      <TransferMetric label="Expected gain" value={formatDelta(recommendation.expectedPointsGain)} />
      <TransferMetric label="Net gain" value={formatDelta(recommendation.netExpectedPointsGain)} />
      <TransferMetric label="Bank after" value={formatPrice(recommendation.bankAfterTransfers)} />
    </div>

    <div className="space-y-3">
      {recommendation.moves.map(move => (
        <div
          key={`${move.playerOut.playerId}-${move.playerIn.playerId}`}
          className="grid gap-3 rounded-md bg-white p-3 sm:grid-cols-[1fr_auto_1fr]"
        >
          <TransferPlayer label="Out" name={move.playerOut.playerName} points={move.playerOut.predictedPoints} price={move.playerOut.price} />
          <div className="flex items-center justify-center text-gray-400">
            <ArrowRight className="h-5 w-5" />
          </div>
          <TransferPlayer label="In" name={move.playerIn.playerName} points={move.playerIn.predictedPoints} price={move.playerIn.price} />
        </div>
      ))}
    </div>

    <div className="mt-4 grid gap-2 text-sm text-gray-600 sm:grid-cols-3">
      <span>Points hit: {recommendation.pointsHit}</span>
      <span>Budget impact: {formatMoneyDelta(recommendation.budgetImpact)}</span>
      <span>Projected XI: {formatScore(recommendation.startingXi.totalPredictedPoints)} pts</span>
    </div>

    <ConstraintSummary validation={recommendation.validation} />
  </div>
);

type TransferMetricProps = {
  label: string;
  value: string;
};

const TransferMetric = ({ label, value }: TransferMetricProps) => (
  <div className="rounded-md bg-white p-3 text-center">
    <div className="text-lg font-bold text-fpl-dark">{value}</div>
    <div className="text-xs text-gray-500">{label}</div>
  </div>
);

type TransferPlayerProps = {
  label: string;
  name: string;
  points: number;
  price: number;
};

const TransferPlayer = ({ label, name, points, price }: TransferPlayerProps) => (
  <div>
    <div className="text-xs font-semibold uppercase text-gray-500">{label}</div>
    <div className="font-medium text-gray-900">{name}</div>
    <div className="text-sm text-gray-600">
      {formatScore(points)} pts - {formatPrice(price)}
    </div>
  </div>
);

const formatMoneyDelta = (value: number): string => {
  if (value === 0) return formatPrice(0);
  return `${value > 0 ? '+' : '-'}${formatPrice(Math.abs(value))}`;
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
