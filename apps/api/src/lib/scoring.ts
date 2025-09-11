import { EnrichedPlayer, AnalysisWeights, PlayerLabel } from '../types';

export class ScoringService {
  static readonly DEFAULT_WEIGHTS: AnalysisWeights = {
    form: 0.3,
    xg90: 0.25,
    xa90: 0.2,
    expMin: 0.15,
    next3Ease: 0.1
  };

  static calculatePlayerScore(
    player: EnrichedPlayer,
    weights: AnalysisWeights = this.DEFAULT_WEIGHTS
  ): number {
    // Normalize each metric to 0-10 scale
    const normalizedForm = Math.min(player.form * 2, 10); // Form is typically 0-5
    const normalizedXG = Math.min(player.xg90 * 20, 10); // Scale xG90
    const normalizedXA = Math.min(player.xa90 * 25, 10); // Scale xA90
    const normalizedMinutes = (player.expMin / 90) * 10; // Minutes as percentage of 90
    const normalizedEase = (6 - player.next3Ease) * 2; // Invert difficulty (1-5 -> 10-2)

    // Apply weights and calculate weighted score
    const score = 
      normalizedForm * weights.form +
      normalizedXG * weights.xg90 +
      normalizedXA * weights.xa90 +
      normalizedMinutes * weights.expMin +
      normalizedEase * weights.next3Ease;

    return Math.round(score * 100) / 100; // Round to 2 decimal places
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
}

