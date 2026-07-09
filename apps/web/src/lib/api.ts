import axios from 'axios';
import {
  ApiResponse,
  EnrichedPlayer,
  Squad,
  AnalysisWeights,
  SquadAnalysis,
  PlayersResponse,
  PlayerSearchResult,
  WeightPreset,
  CountedApiResponse,
  AgentPublicStatus,
  EvaluationDataHealth,
  EvaluationLatest,
  EvaluationRuns,
  PredictionSummary,
  OptimizerResult,
  ExplainRecommendationRequest,
  RecommendationExplanation,
  SquadOptimizationRequest,
  StartingXIOptimizerResult,
  StartingXIRecommendationRequest,
  TransferOptimizerResult,
  TransferRecommendationRequest
} from './types';

const API_BASE_URL = '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for logging
api.interceptors.request.use(
  (config) => config,
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => Promise.reject(error)
);

export const apiClient = {
  // Players API
  async getPlayers(): Promise<PlayersResponse> {
    const response = await api.get('/players');
    return response.data;
  },

  async searchPlayer(name: string): Promise<PlayersResponse> {
    try {
      const response = await api.get(`/players/search?name=${encodeURIComponent(name)}`);
      return response.data;
    } catch (error) {
      const errorResponse = toPlayersResponse(error);
      if (errorResponse) return errorResponse;
      throw error;
    }
  },

  async getPlayerById(id: number): Promise<PlayerSearchResult> {
    const response = await api.get(`/players/${id}`);
    return response.data;
  },

  async getPlayersByPosition(position: string): Promise<PlayersResponse> {
    const response = await api.get(`/players/position/${position}`);
    return response.data;
  },

  // Analysis API
  async analyzeSquad(squad: Squad, weights?: Partial<AnalysisWeights>): Promise<ApiResponse<SquadAnalysis>> {
    try {
      const response = await api.post('/analyze', { squad, weights });
      return response.data;
    } catch (error) {
      return toApiResponse<SquadAnalysis>(
        error,
        'Could not analyze the squad. Confirm that the local API is running and prediction data is loaded.'
      );
    }
  },

  async validateSquad(squad: Squad): Promise<ApiResponse<{ valid: boolean; errors: string[] }>> {
    const response = await api.post('/analyze/validate', { squad });
    return response.data;
  },

  async getDefaultWeights(): Promise<ApiResponse<AnalysisWeights>> {
    const response = await api.get('/analyze/weights');
    return response.data;
  },

  async getWeightPresets(): Promise<ApiResponse<WeightPreset[]>> {
    const response = await api.get('/analyze/presets');
    return response.data;
  },

  // Optimizer API
  async getStartingXIRecommendation(
    request: StartingXIRecommendationRequest
  ): Promise<ApiResponse<StartingXIOptimizerResult>> {
    const response = await api.post('/optimizer/starting-xi', request);
    return response.data;
  },

  async getTransferRecommendations(
    request: TransferRecommendationRequest
  ): Promise<CountedApiResponse<TransferOptimizerResult>> {
    const response = await api.post('/optimizer/transfers', request);
    return response.data;
  },

  async getSquadRecommendation(
    request: SquadOptimizationRequest
  ): Promise<ApiResponse<OptimizerResult>> {
    const response = await api.post('/optimizer/squad', request);
    return response.data;
  },

  async explainRecommendation(
    request: ExplainRecommendationRequest
  ): Promise<ApiResponse<RecommendationExplanation>> {
    const response = await api.post('/agent/explain-recommendation', request);
    return response.data;
  },

  async getAgentStatus(): Promise<ApiResponse<AgentPublicStatus>> {
    const response = await api.get('/agent/status');
    return response.data;
  },

  // Evaluation API
  async getEvaluationLatest(): Promise<ApiResponse<EvaluationLatest>> {
    const response = await api.get('/evaluation/latest');
    return response.data;
  },

  async getEvaluationRuns(limit: number = 5): Promise<CountedApiResponse<EvaluationRuns>> {
    const response = await api.get(`/evaluation/runs?limit=${encodeURIComponent(String(limit))}`);
    return response.data;
  },

  async getEvaluationDataHealth(): Promise<ApiResponse<EvaluationDataHealth>> {
    const response = await api.get('/evaluation/data-health');
    return response.data;
  },

  async getTopPredictions(limit: number = 100): Promise<ApiResponse<PredictionSummary>> {
    try {
      const response = await api.get(`/predictions/top?limit=${encodeURIComponent(String(limit))}`);
      return response.data;
    } catch (error) {
      return toApiResponse<PredictionSummary>(
        error,
        'Could not load top players. Confirm that PostgreSQL is running and prediction data is loaded.'
      );
    }
  },

  // Health check
  async healthCheck() {
    const response = await api.get('/health');
    return response.data;
  }
};

function toPlayersResponse(error: unknown): PlayersResponse | null {
  if (!axios.isAxiosError(error)) return null;

  const payload = error.response?.data;
  if (isApiResponse<EnrichedPlayer[]>(payload)) return payload;

  return {
    success: false,
    data: [],
    count: 0,
    error: 'Could not reach the ScoutIQ API. Confirm that pnpm.cmd run dev:app is still running.'
  };
}

function toApiResponse<T>(error: unknown, fallbackError: string): ApiResponse<T> {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data;
    if (isApiResponse<T>(payload)) return payload;
  }

  return {
    success: false,
    error: fallbackError
  };
}

function isApiResponse<T>(value: unknown): value is ApiResponse<T> {
  if (typeof value !== 'object' || value === null) return false;

  const payload = value as Partial<ApiResponse<T>>;
  return typeof payload.success === 'boolean';
}

export default apiClient;
