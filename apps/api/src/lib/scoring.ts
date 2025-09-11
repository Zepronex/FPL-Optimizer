import { EnrichedPlayer, AnalysisWeights, PlayerLabel, WeightPreset } from '../types';

/**
 * ScoringService handles the calculation of player scores based on various metrics
 * The scoring algorithm combines multiple factors to provide a comprehensive player rating
 * that helps FPL managers make informed decisions about their team selections.
 */
export class ScoringService {
  /**
   * Default weight configuration for player scoring
   * These weights determine how much each metric contributes to the final score
   * All weights should sum to 1.0 for proper normalization
   */
  static readonly DEFAULT_WEIGHTS: AnalysisWeights = {
    form: 0.2,        // Recent performance (last 5 games)
    xg90: 0.15,       // Expected goals per 90 minutes
    xa90: 0.15,       // Expected assists per 90 minutes
    expMin: 0.15,     // Expected minutes (playing time likelihood)
    next3Ease: 0.1,   // Fixture difficulty for next 3 games
    avgPoints: 0.15,  // Historical FPL points average
    value: 0.05,      // Points per million (value for money)
    ownership: 0.05   // Ownership percentage (differential factor)
  };

  static readonly WEIGHT_PRESETS: WeightPreset[] = [
    {
      name: 'Balanced',
      description: 'Well-rounded approach considering all factors equally',
      weights: {
        form: 0.2,
        xg90: 0.15,
        xa90: 0.15,
        expMin: 0.15,
        next3Ease: 0.1,
        avgPoints: 0.15,
        value: 0.05,
        ownership: 0.05
      }
    },
    {
      name: 'Historical Performance',
      description: 'Focus on proven track record and consistency',
      weights: {
        form: 0.1,
        xg90: 0.1,
        xa90: 0.1,
        expMin: 0.2,
        next3Ease: 0.05,
        avgPoints: 0.3,
        value: 0.05,
        ownership: 0.1
      }
    },
    {
      name: 'Cost-Effective',
      description: 'Maximize value for money and budget efficiency',
      weights: {
        form: 0.15,
        xg90: 0.1,
        xa90: 0.1,
        expMin: 0.15,
        next3Ease: 0.1,
        avgPoints: 0.1,
        value: 0.25,
        ownership: 0.05
      }
    },
    {
      name: 'Trending Up',
      description: 'Prioritize current form and upcoming fixtures',
      weights: {
        form: 0.35,
        xg90: 0.2,
        xa90: 0.15,
        expMin: 0.1,
        next3Ease: 0.15,
        avgPoints: 0.03,
        value: 0.01,
        ownership: 0.01
      }
    },
    {
      name: 'Risky',
      description: 'High-risk, high-reward strategy focusing heavily on form',
      weights: {
        form: 0.6,
        xg90: 0.15,
        xa90: 0.1,
        expMin: 0.05,
        next3Ease: 0.05,
        avgPoints: 0.02,
        value: 0.02,
        ownership: 0.01
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
    // Normalize each metric to 0-10 scale for consistent comparison
    // This ensures all metrics contribute equally regardless of their original scale
    const normalizedForm = Math.min(player.form * 2, 10); // Form is typically 0-5, scale to 0-10
    const normalizedXG = Math.min(player.xg90 * 20, 10); // Scale xG90 (0-0.5 -> 0-10)
    const normalizedXA = Math.min(player.xa90 * 25, 10); // Scale xA90 (0-0.4 -> 0-10)
    const normalizedMinutes = (player.expMin / 90) * 10; // Minutes as percentage of 90
    const normalizedEase = (6 - player.next3Ease) * 2; // Invert difficulty (1-5 -> 10-2)
    
    // Additional metrics normalization for enhanced scoring
    const normalizedAvgPoints = Math.min(player.avgPoints * 0.5, 10); // Scale avg points (typically 0-20)
    const normalizedValue = Math.min(player.value * 2, 10); // Scale value metric (points per million)
    const normalizedOwnership = (player.ownership / 10); // Scale ownership % (0-100 -> 0-10)

    // Apply weights and calculate weighted score
    // Each metric is multiplied by its weight and summed for the final score
    const score = 
      normalizedForm * weights.form +
      normalizedXG * weights.xg90 +
      normalizedXA * weights.xa90 +
      normalizedMinutes * weights.expMin +
      normalizedEase * weights.next3Ease +
      normalizedAvgPoints * weights.avgPoints +
      normalizedValue * weights.value +
      normalizedOwnership * weights.ownership;

    return Math.round(score * 100) / 100; // Round to 2 decimal places for precision
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

