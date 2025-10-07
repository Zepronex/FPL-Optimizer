import { EnrichedPlayer, AnalysisWeights, PlayerLabel, WeightPreset } from '../types';

/**
 * ScoringService handles the calculation of player scores based on various metrics
 * The scoring algorithm combines multiple factors to provide a comprehensive player rating
 * that helps FPL managers make informed decisions about their team selections.
 */
export class ScoringService {
  /**
   * Simplified weight configuration for player scoring
   * Focus on the most important and reliable FPL metrics
   */
  static readonly DEFAULT_WEIGHTS: AnalysisWeights = {
    form: 0.4,        // Recent performance (most important)
    xg90: 0.0,        // Disabled - using mock data
    xa90: 0.0,        // Disabled - using mock data
    expMin: 0.3,      // Expected minutes (playing time likelihood)
    next3Ease: 0.0,   // Disabled - using mock data
    avgPoints: 0.3,   // Historical FPL points average
    value: 0.0,       // Disabled - using mock data
    ownership: 0.0    // Disabled - using mock data
  };

  static readonly WEIGHT_PRESETS: WeightPreset[] = [
    {
      name: 'Form Focused',
      description: 'Prioritize players in good form - perfect for short-term gains',
      weights: {
        form: 0.6,
        xg90: 0.0,
        xa90: 0.0,
        expMin: 0.2,
        next3Ease: 0.0,
        avgPoints: 0.2,
        value: 0.0,
        ownership: 0.0
      }
    },
    {
      name: 'Consistent Performers',
      description: 'Focus on reliable players with good average points and minutes',
      weights: {
        form: 0.3,
        xg90: 0.0,
        xa90: 0.0,
        expMin: 0.4,
        next3Ease: 0.0,
        avgPoints: 0.3,
        value: 0.0,
        ownership: 0.0
      }
    },
    {
      name: 'Balanced',
      description: 'Equal weight on form, minutes, and average points',
      weights: {
        form: 0.4,
        xg90: 0.0,
        xa90: 0.0,
        expMin: 0.3,
        next3Ease: 0.0,
        avgPoints: 0.3,
        value: 0.0,
        ownership: 0.0
      }
    }
  ];

  /**
   * Calculates a comprehensive score for a player based on multiple weighted metrics
   * The score ranges from 0-10 and helps rank players for FPL selection
   * 
   * @param player - The enriched player data containing all relevant metrics
   * @param weights - Custom weight configuration (defaults to DEFAULT_WEIGHTS)
   * @returns number - Player score between 0-10 (higher is better)
   */
  static calculatePlayerScore(
    player: EnrichedPlayer,
    weights: AnalysisWeights = this.DEFAULT_WEIGHTS
  ): number {
    // Use only real FPL data - ignore mock advanced stats
    // Form is the most reliable metric from FPL (0-10 scale)
    const formScore = Math.min(player.form * 2, 10); // FPL form is 0-5, scale to 0-10
    
    // Expected minutes based on player status and position
    let minutesScore = 5; // Default average
    if (player.status === 'a') {
      minutesScore = 8; // Available players get high minutes
    } else if (player.status === 'd') {
      minutesScore = 3; // Doubtful players get lower minutes
    } else if (player.status === 'i' || player.status === 's') {
      minutesScore = 0; // Injured/suspended get no minutes
    }
    
    // Average points from FPL (if available, otherwise estimate from form)
    let avgPointsScore = 5; // Default average
    if (player.avgPoints > 0) {
      avgPointsScore = Math.min(player.avgPoints * 0.5, 10); // Scale avg points
    } else {
      // Estimate from form if no avg points data
      avgPointsScore = formScore;
    }
    
    // Position-based adjustments
    let positionBonus = 0;
    if (player.pos === 'GK') {
      // Goalkeepers are more consistent, less volatile
      positionBonus = 0.5;
    } else if (player.pos === 'DEF') {
      // Defenders get clean sheet potential
      positionBonus = 0.3;
    } else if (player.pos === 'FWD') {
      // Forwards are more volatile but higher ceiling
      positionBonus = 0.2;
    }
    
    // Calculate final score using only reliable metrics
    const score = 
      formScore * weights.form +
      minutesScore * weights.expMin +
      avgPointsScore * weights.avgPoints +
      positionBonus;

    // Ensure score is between 0-10
    return Math.max(0, Math.min(10, Math.round(score * 100) / 100));
  }

  static getPlayerLabel(score: number, player: EnrichedPlayer): PlayerLabel {
    // Check if player is injured, suspended, or doubtful
    if (player.status === 'i' || player.status === 's' || player.status === 'd') {
      return 'not-playing';
    }
    
    if (score >= 8) return 'perfect';
    if (score >= 6) return 'good';
    if (score >= 4) return 'poor';
    return 'urgent';
  }

  static normalizeScores(players: EnrichedPlayer[], weights: AnalysisWeights): EnrichedPlayer[] {
    return players.map(player => ({
      ...player,
      score: this.calculatePlayerScore(player, weights)
    }));
  }

  static getPositionAverages(players: EnrichedPlayer[]): Record<string, number> {
    const positionGroups: Record<string, number[]> = {
      GK: [],
      DEF: [],
      MID: [],
      FWD: []
    };

    players.forEach(player => {
      if (player.score !== undefined) {
        positionGroups[player.pos].push(player.score);
      }
    });

    const averages: Record<string, number> = {};
    Object.entries(positionGroups).forEach(([pos, scores]) => {
      if (scores.length > 0) {
        averages[pos] = scores.reduce((sum, score) => sum + score, 0) / scores.length;
      } else {
        averages[pos] = 0;
      }
    });

    return averages;
  }

  static getLabelCounts(players: EnrichedPlayer[]): Record<PlayerLabel, number> {
    const counts: Record<PlayerLabel, number> = {
      perfect: 0,
      good: 0,
      poor: 0,
      urgent: 0,
      'not-playing': 0
    };

    players.forEach(player => {
      if (player.score !== undefined) {
        const label = this.getPlayerLabel(player.score, player);
        counts[label]++;
      }
    });

    return counts;
  }

  static calculateTotalScore(players: EnrichedPlayer[]): number {
    return players.reduce((sum, player) => sum + (player.score || 0), 0);
  }

  static calculateAverageScore(players: EnrichedPlayer[]): number {
    const validScores = players.filter(p => p.score !== undefined);
    if (validScores.length === 0) return 0;
    
    return this.calculateTotalScore(validScores) / validScores.length;
  }

  static getWeightPresets(): WeightPreset[] {
    return this.WEIGHT_PRESETS;
  }

  static getPresetByName(name: string): WeightPreset | null {
    return this.WEIGHT_PRESETS.find(preset => preset.name === name) || null;
  }
}

