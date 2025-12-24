import axios from 'axios';
import { PlayersResponse, PlayerSearchResult, OptimizeRequest, OptimizeResponse } from './types';

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
  },

  async optimizeTransfers(payload: OptimizeRequest): Promise<OptimizeResponse> {
    const response = await api.post('/optimize', payload);
    return response.data;
  }
};

export default apiClient;
