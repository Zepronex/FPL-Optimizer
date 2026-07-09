import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  OptimizerSquadInput,
  Pos,
  SquadAnalysis,
  Squad,
  SquadSlot,
  StartingXIRecommendation,
  TransferRecommendation
} from '../lib/types';
import PlayerRow from '../components/PlayerRow';
import { formatScore, formatPrice, getFormationString } from '../lib/format';
import { apiClient } from '../lib/api';
import OptimizerRecommendations from '../components/OptimizerRecommendations';

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
      return 'The squad is invalid for optimizer rules. Check squad size, position counts, budget, duplicates, and max three players per club.';
    case 'invalid_optimizer_request':
      return 'The optimizer request is invalid. Check that the stored squad has 15 valid players.';
    case 'available_players_required':
    case 'prediction_candidates_required':
      return 'Prediction candidates are unavailable. Load prediction-serving data before requesting transfer recommendations.';
    default:
      return 'Could not load optimizer recommendations. Check that the API is running and the prediction database is reachable.';
  }
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

  const isAnalysisWeights = (value: unknown): value is SquadAnalysis['weights'] => {
    if (!isRecord(value)) return false;
    return ['form', 'xg90', 'xa90', 'expMin', 'next3Ease', 'avgPoints', 'value', 'ownership']
      .every((key) => typeof value[key] === 'number');
  };

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
      typeof value.timestamp === 'string' &&
      isAnalysisWeights(value.weights)
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
          
          // Extract the actual analysis data from the API response
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
        // Error loading analysis
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
      setOptimizerError('Optimizer recommendations require a complete 15-player squad.');
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
      
      // Store results in session storage for the analyze page
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-fpl-green mx-auto mb-4"></div>
          <p className="text-gray-600">Loading analysis results...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
            <h2 className="text-xl font-semibold text-red-800 mb-2">Error</h2>
            <p className="text-red-700 mb-4">{error}</p>
            <button
              onClick={handleNewAnalysis}
              className="btn-primary"
            >
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
          <button
            onClick={handleNewAnalysis}
            className="btn-primary"
          >
            Build Squad
          </button>
        </div>
      </div>
    );
  }

  const startingXIResults = analysis.results.filter((_, index) => index < 11);
  const benchResults = analysis.results.filter((_, index) => index >= 11);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-bold text-fpl-dark mb-2">
            Squad Analysis Results
          </h1>
          <p className="text-gray-600">
            Analysis completed at {new Date(analysis.timestamp).toLocaleString()}
          </p>
        </div>
        <div className="flex space-x-3">
          <button 
            onClick={handleReAnalyze}
            disabled={isReAnalyzing}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed text-lg px-8 py-4"
          >
            {isReAnalyzing ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Re-analyzing...
              </>
            ) : (
              'Re-analyze'
            )}
          </button>
          <button 
            onClick={handleNewAnalysis}
            className="btn-secondary text-lg px-8 py-4"
          >
            New Squad
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-red-800 font-medium">Error</h3>
              <p className="text-red-700 mt-1">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-600 hover:text-red-800"
            >
              x
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="space-y-8">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="card text-center">
              <div className="text-3xl font-bold text-fpl-green mb-2">
                {formatScore(analysis.averageScore)}
              </div>
              <div className="text-sm text-gray-600">Average Score</div>
            </div>
            
            <div className="card text-center">
              <div className="text-3xl font-bold text-fpl-dark mb-2">
                {formatScore(analysis.totalScore)}
              </div>
              <div className="text-sm text-gray-600">Total Score</div>
            </div>
            
            <div className="card text-center">
              <div className="text-3xl font-bold text-red-500 mb-2">
                {analysis.flaggedPlayers}
              </div>
              <div className="text-sm text-gray-600">Flagged Players</div>
            </div>
            
            <div className="card text-center">
              <div className="text-3xl font-bold text-blue-500 mb-2">
                {formatPrice(analysis.bankLeft)}
              </div>
              <div className="text-sm text-gray-600">Bank Remaining</div>
            </div>
          </div>

          <OptimizerRecommendations
            startingXi={optimizerState?.startingXi}
            transferRecommendations={optimizerState?.transfers}
            isLoading={isOptimizerLoading}
            error={optimizerError}
            contextNote="Transfer recommendations assume 1 free transfer and no points hits."
            onRetry={() => setOptimizerRefreshKey(current => current + 1)}
            targetGameweekId={optimizerState?.targetGameweekId}
            predictionRunIds={optimizerState?.predictionRunIds}
            emptyMessage="Prediction-backed recommendations will appear after optimizer data is available for this squad."
          />

          {/* Starting XI */}
          <div className="card">
            <h2 className="text-2xl font-semibold mb-6">
              Starting XI ({getFormationString(startingXIResults.map(r => ({ pos: r.player.pos })))})
            </h2>
            <div className="space-y-3">
              {startingXIResults.map((result) => (
                <PlayerRow
                  key={result.player.id}
                  result={result}
                />
              ))}
            </div>
          </div>

          {/* Bench */}
          <div className="card">
            <h2 className="text-2xl font-semibold mb-6">Bench</h2>
            <div className="space-y-3">
              {benchResults.map((result) => (
                <PlayerRow
                  key={result.player.id}
                  result={result}
                  isBench={true}
                />
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">Legend</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="flex items-center space-x-2">
                <span className="badge bg-green-100 text-green-800 border-green-200">Perfect</span>
                <span className="text-sm text-gray-600">Score &gt;= 8.0</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="badge bg-blue-100 text-blue-800 border-blue-200">Good</span>
                <span className="text-sm text-gray-600">Score &gt;= 6.0</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="badge bg-yellow-100 text-yellow-800 border-yellow-200">Poor</span>
                <span className="text-sm text-gray-600">Score &gt;= 4.0</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="badge bg-red-100 text-red-800 border-red-200">Urgent</span>
                <span className="text-sm text-gray-600">Score &lt; 4.0</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="badge bg-red-900 text-red-100 border-red-800">Not Playing</span>
                <span className="text-sm text-gray-600">Injured/Suspended</span>
              </div>
            </div>
          </div>
      </div>
    </div>
  );
};

export default AnalyzePage;
