import NodeCache from 'node-cache';

// Cache configuration
const cache = new NodeCache({
  stdTTL: 3600, // 1 hour default TTL
  checkperiod: 600, // Check for expired keys every 10 minutes
  useClones: false
});

// Cache keys
export const CACHE_KEYS = {
  PLAYERS: 'fpl_players',
  TEAMS: 'fpl_teams',
  FIXTURES: 'fpl_fixtures',
  CURRENT_GW: 'current_gameweek',
} as const;

export class CacheService {
  static get<T>(key: string): T | undefined {
    return cache.get<T>(key);
  }

  static set<T>(key: string, value: T, ttl?: number): boolean {
    return cache.set(key, value, ttl);
  }

  static del(key: string): number {
    return cache.del(key);
  }

  static flush(): void {
    cache.flushAll();
  }

  static getStats() {
    return cache.getStats();
  }

  // Specific cache methods for FPL data
  static getPlayers() {
    return this.get(CACHE_KEYS.PLAYERS);
  }

  static setPlayers(players: any, ttl = 3600) {
    return this.set(CACHE_KEYS.PLAYERS, players, ttl);
  }

  static getTeams() {
    return this.get(CACHE_KEYS.TEAMS);
  }

  static setTeams(teams: any, ttl = 3600) {
    return this.set(CACHE_KEYS.TEAMS, teams, ttl);
  }

  static getFixtures() {
    return this.get(CACHE_KEYS.FIXTURES);
  }

  static setFixtures(fixtures: any, ttl = 3600) {
    return this.set(CACHE_KEYS.FIXTURES, fixtures, ttl);
  }

  static getCurrentGameweek() {
    return this.get(CACHE_KEYS.CURRENT_GW);
  }

  static setCurrentGameweek(gw: number, ttl = 3600) {
    return this.set(CACHE_KEYS.CURRENT_GW, gw, ttl);
  }
}

