import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, UserPlus, X } from 'lucide-react';
import {
  AnalysisResult,
  OptimizerSquadInput,
  OptimizerSquadSlot,
  Pos,
  Squad,
  SquadAnalysis,
  SquadSlot,
  StartingXIRecommendation,
  TransferRecommendation
} from '../lib/types';
import { formatPrice, getFormationString } from '../lib/format';
import { formatScoreOutOf, getScoreSummary } from '../lib/analysisDisplay';
import { apiClient } from '../lib/api';
import OptimizerRecommendations from '../components/OptimizerRecommendations';
import LineupPitch, { LineupPlayer } from '../components/LineupPitch';

type OptimizerRecommendationState = {
  startingXi: StartingXIRecommendation | null;
  transfers: TransferRecommendation[];
  targetGameweekId?: number;
  predictionRunIds: number[];
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const toOptimizerSquadInput = (squad: Squad): OptimizerSquadInput => ({
  playerIds: [...squad.startingXI, ...squad.bench].map(player => player.id),
  bank: squad.bank,
  budget: 100
});

const mergePredictionRunIds = (...runIdGroups: number[][]): number[] => {
  return [...new Set(runIdGroups.flat())].sort((left, right) => left - right);
};

const getOptimizerErrorCode = (value: unknown): string | undefined => {
  const payload = isRecord(value) && isRecord(value.response)
    ? value.response.data
    : value;

  return isRecord(payload) && typeof payload.error === 'string'
    ? payload.error
    : undefined;
};

const getOptimizerErrorMessage = (value: unknown): string => {
  const code = getOptimizerErrorCode(value);

  switch (code) {
    case 'no_prediction_runs_loaded':
      return 'Prediction data is missing. Run the prediction pipeline and load predictions into PostgreSQL.';
    case 'squad_predictions_missing':
      return 'Some squad players do not have prediction rows. Re-run the prediction pipeline and reload predictions into PostgreSQL.';
    case 'invalid_squad':
      return 'The squad is invalid. Check squad size, position counts, budget, duplicates, and max three players per club.';
    case 'invalid_optimizer_request':
      return 'The recommendation request is invalid. Check that the stored squad has 15 valid players.';
    case 'available_players_required':
    case 'prediction_candidates_required':
      return 'Prediction candidates are unavailable. Load prediction-serving data before requesting transfer recommendations.';
    default:
      return 'Could not load recommendations. Check that the API is running and the prediction database is reachable.';
  }
};

const toOptimizerLineupPlayer = (
  player: OptimizerSquadSlot,
  captaincy: StartingXIRecommendation['captaincy']
): LineupPlayer => ({
  id: player.playerId,
  name: player.playerName,
  position: player.position,
  teamShort: player.teamShortName || player.teamName,
  price: player.price,
  rawExpectedPoints: player.displayScore?.rawExpectedPoints ?? player.predictedPoints,
  contextualScoreOutOf10: player.displayScore?.contextualScoreOutOf10,
  captainMarker: player.playerId === captaincy.captain.playerId
    ? 'C'
    : player.playerId === captaincy.viceCaptain.playerId
      ? 'VC'
      : undefined,
  availability: player.availability
});

const toAnalysisLineupPlayer = (result: AnalysisResult): LineupPlayer => ({
  id: result.player.id,
  name: result.player.name,
  position: result.player.pos,
  teamShort: result.player.teamShort,
  price: result.player.price,
  contextualScoreOutOf10: result.score
});

const getFallbackFormation = (results: readonly AnalysisResult[]): string | undefined => {
  const formation = getFormationString(results.map(result => ({ pos: result.player.pos })));
  return formation === 'Invalid' ? undefined : formation;
};

const AnalyzePage = () => {
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState<SquadAnalysis | null>(null);
  const [originalSquad, setOriginalSquad] = useState<Squad | null>(null);
  const [optimizerState, setOptimizerState] = useState<OptimizerRecommendationState | null>(null);
  const [isOptimizerLoading, setIsOptimizerLoading] = useState(false);
  const [optimizerError, setOptimizerError] = useState<string | null>(null);
  const [optimizerRefreshKey, setOptimizerRefreshKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isReAnalyzing, setIsReAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPos = (value: unknown): value is Pos => {
    return value === 'GK' || value === 'DEF' || value === 'MID' || value === 'FWD';
  };

  const isSquadSlot = (value: unknown): value is SquadSlot => {
    return (
      isRecord(value) &&
      typeof value.id === 'number' &&
      isPos(value.pos) &&
      typeof value.price === 'number' &&
      (value.name === undefined || typeof value.name === 'string') &&
      (value.teamShort === undefined || typeof value.teamShort === 'string')
    );
  };

  const isSquad = (value: unknown): value is Squad => {
    return (
      isRecord(value) &&
      Array.isArray(value.startingXI) &&
      value.startingXI.every(isSquadSlot) &&
      Array.isArray(value.bench) &&
      value.bench.every(isSquadSlot) &&
      typeof value.bank === 'number'
    );
  };

  const isSquadAnalysis = (value: unknown): value is SquadAnalysis => {
    if (!isRecord(value)) return false;
    return (
      Array.isArray(value.results) &&
      typeof value.averageScore === 'number' &&
      typeof value.flaggedPlayers === 'number' &&
      typeof value.bankLeft === 'number' &&
      typeof value.totalScore === 'number' &&
      typeof value.timestamp === 'string'
    );
  };

  const extractSquadAnalysis = (value: unknown): SquadAnalysis | null => {
    if (isSquadAnalysis(value)) return value;
    if (isRecord(value) && value.success === true && isSquadAnalysis(value.data)) {
      return value.data;
    }
    return null;
  };

  useEffect(() => {
    const loadAnalysis = () => {
      try {
        const storedAnalysis = sessionStorage.getItem('fpl-analysis-results');
        const storedSquad = sessionStorage.getItem('fpl-original-squad');

        if (storedAnalysis && storedSquad) {
          const parsed: unknown = JSON.parse(storedAnalysis);
          const squadData: unknown = JSON.parse(storedSquad);
          const analysisData = extractSquadAnalysis(parsed);

          if (!analysisData) {
            setError('Failed to load analysis results.');
            return;
          }

          if (!isSquad(squadData)) {
            setError('Failed to load original squad.');
            return;
          }

          setAnalysis(analysisData);
          setOriginalSquad(squadData);
        } else {
          setError('No analysis results found. Please analyze your squad first.');
        }
      } catch {
        setError('Failed to load analysis results.');
      } finally {
        setIsLoading(false);
      }
    };

    loadAnalysis();
  }, []);

  useEffect(() => {
    if (!originalSquad) return;

    const playerIds = [...originalSquad.startingXI, ...originalSquad.bench].map(player => player.id);
    if (playerIds.length !== 15) {
      setOptimizerState(null);
      setOptimizerError('Recommendations require a complete 15-player squad.');
      return;
    }

    let cancelled = false;

    const loadOptimizerRecommendations = async () => {
      setIsOptimizerLoading(true);
      setOptimizerError(null);
      setOptimizerState(null);

      try {
        const optimizerSquad = toOptimizerSquadInput(originalSquad);
        const [startingXiResponse, transfersResponse] = await Promise.all([
          apiClient.getStartingXIRecommendation({ squad: optimizerSquad }),
          apiClient.getTransferRecommendations({
            currentSquad: optimizerSquad,
            freeTransfers: 1,
            maxHits: 0
          })
        ]);

        if (!startingXiResponse.success || !startingXiResponse.data) {
          throw startingXiResponse;
        }

        if (!transfersResponse.success || !transfersResponse.data) {
          throw transfersResponse;
        }

        if (!cancelled) {
          setOptimizerState({
            startingXi: startingXiResponse.data.startingXi,
            transfers: transfersResponse.data.recommendations,
            targetGameweekId: startingXiResponse.data.targetGameweekId ?? transfersResponse.data.targetGameweekId,
            predictionRunIds: mergePredictionRunIds(
              startingXiResponse.data.predictionRunIds,
              transfersResponse.data.predictionRunIds
            )
          });
        }
      } catch (optimizerRequestError) {
        if (!cancelled) {
          setOptimizerError(getOptimizerErrorMessage(optimizerRequestError));
        }
      } finally {
        if (!cancelled) {
          setIsOptimizerLoading(false);
        }
      }
    };

    loadOptimizerRecommendations();

    return () => {
      cancelled = true;
    };
  }, [originalSquad, optimizerRefreshKey]);

  const handleNewAnalysis = () => {
    sessionStorage.removeItem('fpl-analysis-results');
    sessionStorage.removeItem('fpl-original-squad');
    navigate('/squad');
  };

  const handleReAnalyze = async () => {
    if (!originalSquad) return;

    setIsReAnalyzing(true);
    setError(null);

    try {
      const response = await apiClient.analyzeSquad(originalSquad);
      sessionStorage.setItem('fpl-analysis-results', JSON.stringify(response));

      if (response.success && response.data) {
        setAnalysis(response.data);
      } else {
        setError(response.error || 'Re-analysis failed. Please try again.');
      }
    } catch {
      setError('Re-analysis failed. Please try again.');
    } finally {
      setIsReAnalyzing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-fpl-green mx-auto mb-4" />
          <p className="text-gray-600">Loading analysis results...</p>
        </div>
      </div>
    );
  }

  if (error && !analysis) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
            <h2 className="text-xl font-semibold text-red-800 mb-2">Error</h2>
            <p className="text-red-700 mb-4">{error}</p>
            <button onClick={handleNewAnalysis} className="btn-primary">
              Start New Analysis
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">No Analysis Found</h2>
          <p className="text-gray-600 mb-6">Please analyze your squad first.</p>
          <button onClick={handleNewAnalysis} className="btn-primary">
            Build Squad
          </button>
        </div>
      </div>
    );
  }

  const startingXIResults = analysis.results.filter((_, index) => index < 11);
  const benchResults = analysis.results.filter((_, index) => index >= 11);
  const recommendation = optimizerState?.startingXi;
  const scoreSummary = getScoreSummary(analysis, recommendation);
  const lineupStarters = recommendation
    ? recommendation.starters.map(player => toOptimizerLineupPlayer(player, recommendation.captaincy))
    : startingXIResults.map(toAnalysisLineupPlayer);
  const lineupBench = recommendation
    ? recommendation.bench.map(player => toOptimizerLineupPlayer(player, recommendation.captaincy))
    : benchResults.map(toAnalysisLineupPlayer);
  const formation = recommendation?.formation ?? getFallbackFormation(startingXIResults);
  const completedAt = new Date(analysis.timestamp).toLocaleString();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-fpl-dark">Analysis Results</h1>
          <p className="mt-1 text-sm text-gray-600">Completed {completedAt}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            onClick={handleReAnalyze}
            disabled={isReAnalyzing}
            className="btn-primary inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isReAnalyzing ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Re-running
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Re-run Analysis
              </>
            )}
          </button>
          <button
            onClick={handleNewAnalysis}
            className="btn-secondary inline-flex items-center justify-center gap-2"
          >
            <UserPlus className="h-4 w-4" />
            New Squad
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex justify-between gap-4">
            <div>
              <h3 className="font-medium text-red-800">Error</h3>
              <p className="mt-1 text-sm text-red-700">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-red-600 hover:text-red-800"
              aria-label="Dismiss error"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric
          label="Total Score"
          value={formatScoreOutOf(scoreSummary.totalScore, 100)}
          helper={scoreSummary.scoreSource === 'optimizer' ? 'Comparison score' : 'Stored squad score'}
        />
        <SummaryMetric
          label="Average Player Score"
          value={formatScoreOutOf(scoreSummary.averagePlayerScore, 10)}
          helper={scoreSummary.scoreSource === 'optimizer' ? 'Starter average' : 'Squad average'}
        />
        <SummaryMetric label="Bank Remaining" value={formatPrice(analysis.bankLeft)} />
        <SummaryMetric label="Formation" value={formation ?? 'Pending'} />
      </div>

      <LineupPitch
        title="Recommended Starting XI"
        subtitle={recommendation
          ? 'Best current XI and bench order.'
          : 'Stored squad shown while recommendations load.'}
        starters={lineupStarters}
        bench={lineupBench}
        formation={formation}
      />

      <ScoreLegend scoreSource={scoreSummary.scoreSource} />

      <OptimizerRecommendations
        startingXi={optimizerState?.startingXi}
        transferRecommendations={optimizerState?.transfers}
        isLoading={isOptimizerLoading}
        error={optimizerError}
        contextNote="Assumes 1 free transfer and no hits."
        onRetry={() => setOptimizerRefreshKey(current => current + 1)}
        targetGameweekId={optimizerState?.targetGameweekId}
        predictionRunIds={optimizerState?.predictionRunIds}
        emptyMessage="Recommendations will appear when prediction data is available for this squad."
      />
    </div>
  );
};

type SummaryMetricProps = {
  label: string;
  value: string;
  helper?: string;
};

const SummaryMetric = ({ label, value, helper }: SummaryMetricProps) => (
  <div className="rounded-lg border border-slate-200 bg-white p-4">
    <div className="text-sm font-medium text-gray-600">{label}</div>
    <div className="mt-2 text-2xl font-bold text-fpl-dark">{value}</div>
    {helper && <div className="mt-1 text-xs text-gray-500">{helper}</div>}
  </div>
);

const ScoreLegend = ({ scoreSource }: { scoreSource: 'optimizer' | 'analysis' }) => (
  <div className="rounded-lg border border-slate-200 bg-white p-4">
    <h3 className="text-sm font-semibold text-gray-950">Legend</h3>
    <div className="mt-3 grid gap-3 text-sm text-gray-700 md:grid-cols-3">
      <div>
        <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-gray-800">/10</span>
        <span className="ml-2">Player comparison score</span>
      </div>
      <div>
        <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-gray-800">xPts</span>
        <span className="ml-2">Raw expected points</span>
      </div>
      <div>
        <span className="rounded border border-green-200 bg-green-50 px-2 py-1 text-xs font-semibold text-green-800">C / VC</span>
        <span className="ml-2">Captain and vice captain</span>
      </div>
    </div>
    <p className="mt-3 text-xs text-gray-500">
      {scoreSource === 'optimizer'
        ? 'Scores compare players in the current prediction pool. xPts is the raw model output.'
        : 'Stored analysis scores are shown until comparison scores are available.'}
    </p>
  </div>
);

export default AnalyzePage;
