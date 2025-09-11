import axios from 'axios';
import { Squad, AnalysisWeights, SquadAnalysis, EnrichedPlayer, PlayersResponse, PlayerSearchResult } from './types';

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
  async analyzeSquad(squad: Squad, weights?: Partial<AnalysisWeights>): Promise<{ success: boolean; data?: SquadAnalysis; error?: string }> {
    const response = await api.post('/analyze', { squad, weights });
    return response.data;
  },

  async validateSquad(squad: Squad): Promise<{ success: boolean; data?: { valid: boolean; errors: string[] }; error?: string }> {
    const response = await api.post('/analyze/validate', { squad });
    return response.data;
  },

  async getDefaultWeights(): Promise<{ success: boolean; data?: AnalysisWeights; error?: string }> {
    const response = await api.get('/analyze/weights');
    return response.data;
  },

  async getWeightPresets(): Promise<{ success: boolean; data?: any[]; error?: string }> {
    const response = await api.get('/analyze/presets');
    return response.data;
  },

  async generateTeam(strategy: string, budget: number = 100): Promise<{ success: boolean; data?: any; error?: string }> {
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

  // Health check
  async healthCheck() {
    const response = await api.get('/health');
    return response.data;
  }
};

export default apiClient;
