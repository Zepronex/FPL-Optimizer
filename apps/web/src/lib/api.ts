import axios from 'axios';
import {
  ApiResponse,
  GeneratedTeamData,
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
    const response = await api.get(`/players/search?name=${encodeURIComponent(name)}`);
    return response.data;
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
    const response = await api.post('/analyze', { squad, weights });
    return response.data;
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

  async generateTeam(strategy: string, budget: number = 100): Promise<ApiResponse<GeneratedTeamData>> {
    const response = await api.post('/generate', { strategy, budget });
    return response.data;
  },

  // Suggestions API
  async getSuggestions(playerId: number, position: string, maxPrice: number, excludeIds: number[] = [], limit: number = 5) {
    const response = await api.post('/suggestions', {
      playerId,
      position,
      maxPrice,
      excludeIds,
      limit
    });
    return response.data;
  },

  // Fixtures API
  async getFixtures() {
    const response = await api.get('/fixtures');
    return response.data;
  },

  async getCurrentGameweek() {
    const response = await api.get('/fixtures/current');
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

  // Health check
  async healthCheck() {
    const response = await api.get('/health');
    return response.data;
  },

  // ML API
  async getTopPlayers(limit?: number) {
    const params = limit ? `?limit=${limit}` : '';
    const response = await api.get(`/ml/top-players${params}`);
    return response.data;
  },

  async getMLHealth() {
    const response = await api.get('/ml/health');
    return response.data;
  }
};

export default apiClient;
