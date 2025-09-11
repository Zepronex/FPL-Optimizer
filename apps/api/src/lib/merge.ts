import { FPLPlayer, FPLTeam, FPLFixture, EnrichedPlayer, Pos } from '../types';
import { AdvancedStatsFetcher } from './fetchers/advanced';

// Cache for enriched players data to avoid repeated API calls
let enrichedPlayersCache: EnrichedPlayer[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

// Maps FPL position IDs to our internal position types
const POSITION_MAP: Record<number, Pos> = {
  1: 'GK',
  2: 'DEF', 
  3: 'MID',
  4: 'FWD'
};

export class DataMerger {
  // Get enriched players from cache or fetch fresh data
  private static async getEnrichedPlayers(): Promise<EnrichedPlayer[]> {
    const now = Date.now();
    
    // Return cached data if it's still valid
    if (enrichedPlayersCache && (now - cacheTimestamp) < CACHE_DURATION) {
      return enrichedPlayersCache;
    }
    
    // Fetch fresh data
    const [players, teams, fixtures] = await Promise.all([
      import('./fetchers/fpl').then(m => m.FPLDataFetcher.getPlayers()),
      import('./fetchers/fpl').then(m => m.FPLDataFetcher.getTeams()),
      import('./fetchers/fpl').then(m => m.FPLDataFetcher.getFixtures())
    ]);

    const enrichedPlayers = await this.enrichPlayers(players, teams, fixtures);
    
    // Update cache
    enrichedPlayersCache = enrichedPlayers;
    cacheTimestamp = now;
    
    return enrichedPlayers;
  }

  // Clear cache (useful for testing or when data needs to be refreshed)
  static clearCache(): void {
    enrichedPlayersCache = null;
    cacheTimestamp = 0;
  }

  /**
   * Enriches FPL player data with advanced statistics and team information
   * This is the core data processing function that combines multiple data sources
   * 
   * @param players - Raw FPL player data from the official API
   * @param teams - Team information for mapping team IDs to names
   * @param fixtures - Fixture data for calculating difficulty ratings
   * @returns Promise<EnrichedPlayer[]> - Players with enhanced statistics
   */
  static async enrichPlayers(
    players: FPLPlayer[],
    teams: FPLTeam[],
    fixtures: FPLFixture[]
  ): Promise<EnrichedPlayer[]> {
    // Create lookup map for team data to avoid O(n) searches for each player
    const teamMap = new Map(teams.map(team => [team.id, team]));
    const playerIds = players.map(p => p.id);
    
    // Fetch advanced statistics and fixture difficulty data in parallel
    // This includes xG, xA, expected minutes, and fixture difficulty ratings
    const advancedStats = await AdvancedStatsFetcher.getAdvancedStats(playerIds);
    const fixtureDifficulty = await AdvancedStatsFetcher.getFixtureDifficulty();

    return players.map(player => {
      const team = teamMap.get(player.team);
      const stats = advancedStats[player.id] || {};
      
      return {
        id: player.id,
        name: `${player.first_name} ${player.second_name}`,
        teamId: player.team,
        teamShort: team?.short_name || 'UNK',
        pos: POSITION_MAP[player.element_type] || 'MID',
        price: player.now_cost / 10, // Convert from FPL format (prices stored as integers * 10)
        form: parseFloat(player.form) || 0,
        status: player.status as 'a' | 'd' | 'i' | 's',
        xg90: stats.xG90 || 0,
        xa90: stats.xA90 || 0,
        expMin: stats.expMin || 0,
        next3Ease: this.calculateNext3Ease(player.team, fixtures, fixtureDifficulty),
        // Additional metrics
        avgPoints: stats.avgPoints || 0,
        value: stats.value || 0,
        ownership: stats.ownership || 0
      };
    });
  }

  private static calculateNext3Ease(
    teamId: number,
    fixtures: FPLFixture[],
    fdr: Record<number, number>
  ): number {
    // Find next 3 fixtures for the team (home or away)
    const teamFixtures = fixtures
      .filter(f => f.team_h === teamId || f.team_a === teamId)
      .slice(0, 3);

    if (teamFixtures.length === 0) return 3; // Default medium difficulty

    // Calculate average difficulty of next 3 fixtures
    const totalDifficulty = teamFixtures.reduce((sum, fixture) => {
      const isHome = fixture.team_h === teamId;
      const opponentId = isHome ? fixture.team_a : fixture.team_h;
      const difficulty = isHome ? fixture.team_h_difficulty : fixture.team_a_difficulty;
      return sum + difficulty;
    }, 0);

    return totalDifficulty / teamFixtures.length;
  }

  static async getPlayerByName(name: string): Promise<EnrichedPlayer | null> {
    const players = await this.searchPlayersByName(name);
    return players.length > 0 ? players[0] : null;
  }

  static async searchPlayersByName(name: string, limit: number = 5): Promise<EnrichedPlayer[]> {
    try {
      // Use cached data for better performance
      const enrichedPlayers = await this.getEnrichedPlayers();
      
      // Normalize search query for better matching
      const normalizedSearchName = this.normalizeString(name);
      
      // Calculate similarity scores and rank players
      const playersWithScores = enrichedPlayers.map(player => ({
        player,
        score: this.calculateSimilarity(normalizedSearchName, this.normalizeString(player.name))
      }))
      .filter(item => item.score > 0) // Only include players with some similarity
      .sort((a, b) => b.score - a.score) // Sort by similarity score
      .slice(0, limit); // Take top results
      
      return playersWithScores.map(item => item.player);
    } catch (error) {
      // Error searching players by name
      return [];
    }
  }

  private static normalizeString(str: string): string {
    return str
      .toLowerCase()
      .trim()
      .normalize('NFD') // Decompose accented characters (é -> e + ´)
      .replace(/[\u0300-\u036f]/g, '') // Remove accent marks
      .replace(/[^a-z0-9\s]/g, '') // Remove special characters
      .replace(/\s+/g, ' '); // Normalize whitespace
  }

  private static calculateSimilarity(searchName: string, playerName: string): number {
    // Exact match gets highest score
    if (playerName === searchName) return 100;
    
    // Contains match gets high score
    if (playerName.includes(searchName)) return 80;
    
    // Word boundary match gets medium score
    const words = playerName.split(' ');
    const searchWords = searchName.split(' ');
    
    let wordMatches = 0;
    for (const searchWord of searchWords) {
      if (words.some(word => word.includes(searchWord))) {
        wordMatches++;
      }
    }
    
    if (wordMatches > 0) {
      return (wordMatches / searchWords.length) * 60;
    }
    
    // Levenshtein distance for fuzzy matching (handles typos)
    const distance = this.levenshteinDistance(searchName, playerName);
    const maxLength = Math.max(searchName.length, playerName.length);
    const similarity = ((maxLength - distance) / maxLength) * 40;
    
    return similarity > 20 ? similarity : 0; // Only return if similarity is above threshold
  }

  private static levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  static async getAllEnrichedPlayers(): Promise<EnrichedPlayer[]> {
    try {
      const [players, teams, fixtures] = await Promise.all([
        import('./fetchers/fpl').then(m => m.FPLDataFetcher.getPlayers()),
        import('./fetchers/fpl').then(m => m.FPLDataFetcher.getTeams()),
        import('./fetchers/fpl').then(m => m.FPLDataFetcher.getFixtures())
      ]);

      return await this.enrichPlayers(players, teams, fixtures);
    } catch (error) {
      // Error getting enriched players
      throw error;
    }
  }
}
