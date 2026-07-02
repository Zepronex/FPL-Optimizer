type AdvancedStatsRecord = {
  xG90?: number;
  xA90?: number;
  expMin?: number;
  avgPoints?: number;
  value?: number;
  ownership?: number;
};

export class AdvancedStatsFetcher {
  static async getAdvancedStats(playerIds: number[]): Promise<Record<number, AdvancedStatsRecord>> {
    return Object.fromEntries(playerIds.map(playerId => [playerId, {}]));
  }

  static async getFixtureDifficulty(): Promise<Record<number, number>> {
    return {};
  }

  static async getPlayerForm(playerId: number): Promise<number> {
    return 0;
  }

  static async getExpectedMinutes(playerId: number): Promise<number> {
    return 0;
  }
}

