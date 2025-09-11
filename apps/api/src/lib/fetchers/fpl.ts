import axios from 'axios';
import { FPLPlayer, FPLTeam, FPLFixture } from '../types';
import { CacheService } from '../cache';

const FPL_API_BASE = 'https://fantasy.premierleague.com/api';

// Rate limiting and retry logic
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const makeRequest = async (url: string, retries = 3): Promise<any> => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'FPL-Optimizer/1.0'
        }
      });
      return response.data;
    } catch (error) {
      // Request failed, retrying...
      if (i === retries - 1) throw error;
      await sleep(1000 * Math.pow(2, i)); // Exponential backoff
    }
  }
};

export class FPLDataFetcher {
  static async getPlayers(): Promise<FPLPlayer[]> {
    const cached = CacheService.getPlayers();
    if (cached) return cached;

    try {
      const data = await makeRequest(`${FPL_API_BASE}/bootstrap-static/`);
      const players = data.elements;
      CacheService.setPlayers(players);
      return players;
    } catch (error) {
      // Failed to fetch players
      throw new Error('Failed to fetch player data');
    }
  }

  static async getTeams(): Promise<FPLTeam[]> {
    const cached = CacheService.getTeams();
    if (cached) return cached;

    try {
      const data = await makeRequest(`${FPL_API_BASE}/bootstrap-static/`);
      const teams = data.teams;
      CacheService.setTeams(teams);
      return teams;
    } catch (error) {
      // Failed to fetch teams
      throw new Error('Failed to fetch team data');
    }
  }

  static async getFixtures(): Promise<FPLFixture[]> {
    const cached = CacheService.getFixtures();
    if (cached) return cached;

    try {
      const data = await makeRequest(`${FPL_API_BASE}/fixtures/`);
      CacheService.setFixtures(data);
      return data;
    } catch (error) {
      // Failed to fetch fixtures
      throw new Error('Failed to fetch fixture data');
    }
  }

  static async getCurrentGameweek(): Promise<number> {
    const cached = CacheService.getCurrentGameweek();
    if (cached) return cached;

    try {
      const data = await makeRequest(`${FPL_API_BASE}/bootstrap-static/`);
      const currentGw = data.current_event;
      CacheService.setCurrentGameweek(currentGw);
      return currentGw;
    } catch (error) {
      // Failed to fetch current gameweek
      return 1; // Fallback
    }
  }

  static async refreshAllData(): Promise<void> {
    try {
      await Promise.all([
        this.getPlayers(),
        this.getTeams(),
        this.getFixtures(),
        this.getCurrentGameweek()
      ]);
      // All FPL data refreshed successfully
    } catch (error) {
      // Failed to refresh FPL data
      throw error;
    }
  }
}

