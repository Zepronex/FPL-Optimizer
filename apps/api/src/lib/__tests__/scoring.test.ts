import { ScoringService } from '../scoring';
import { EnrichedPlayer, AnalysisWeights } from '../../types';

describe('ScoringService', () => {
  const mockPlayer: EnrichedPlayer = {
    id: 1,
    name: 'Test Player',
    teamId: 1,
    teamShort: 'TST',
    pos: 'MID',
    price: 8.0,
    form: 5.0,
    status: 'a',
    xg90: 0.3,
    xa90: 0.2,
    expMin: 80,
    next3Ease: 2.5
  };

  const defaultWeights: AnalysisWeights = {
    form: 0.3,
    xg90: 0.25,
    xa90: 0.2,
    expMin: 0.15,
    next3Ease: 0.1
  };

  describe('calculatePlayerScore', () => {
    it('should calculate score with default weights', () => {
      const score = ScoringService.calculatePlayerScore(mockPlayer);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(10);
    });

    it('should calculate score with custom weights', () => {
      const customWeights: AnalysisWeights = {
        form: 0.5,
        xg90: 0.3,
        xa90: 0.1,
        expMin: 0.05,
        next3Ease: 0.05
      };
      
      const score = ScoringService.calculatePlayerScore(mockPlayer, customWeights);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(10);
    });

    it('should handle edge cases', () => {
      const edgeCasePlayer: EnrichedPlayer = {
        ...mockPlayer,
        form: 0,
        xg90: 0,
        xa90: 0,
        expMin: 0,
        next3Ease: 5
      };
      
      const score = ScoringService.calculatePlayerScore(edgeCasePlayer);
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getPlayerLabel', () => {
    it('should return correct labels for different scores', () => {
      expect(ScoringService.getPlayerLabel(9.0)).toBe('perfect');
      expect(ScoringService.getPlayerLabel(7.0)).toBe('good');
      expect(ScoringService.getPlayerLabel(5.0)).toBe('poor');
      expect(ScoringService.getPlayerLabel(3.0)).toBe('urgent');
    });
  });

  describe('normalizeScores', () => {
    it('should add scores to players', () => {
      const players = [mockPlayer, { ...mockPlayer, id: 2 }];
      const normalized = ScoringService.normalizeScores(players, defaultWeights);
      
      expect(normalized[0].score).toBeDefined();
      expect(normalized[1].score).toBeDefined();
      expect(normalized[0].score).toBeGreaterThan(0);
    });
  });

  describe('getPositionAverages', () => {
    it('should calculate position averages correctly', () => {
      const players: EnrichedPlayer[] = [
        { ...mockPlayer, pos: 'GK', score: 5.0 },
        { ...mockPlayer, id: 2, pos: 'GK', score: 7.0 },
        { ...mockPlayer, id: 3, pos: 'DEF', score: 6.0 }
      ];
      
      const averages = ScoringService.getPositionAverages(players);
      
      expect(averages.GK).toBe(6.0);
      expect(averages.DEF).toBe(6.0);
      expect(averages.MID).toBe(0);
      expect(averages.FWD).toBe(0);
    });
  });

  describe('getLabelCounts', () => {
    it('should count labels correctly', () => {
      const players: EnrichedPlayer[] = [
        { ...mockPlayer, score: 9.0 },
        { ...mockPlayer, id: 2, score: 7.0 },
        { ...mockPlayer, id: 3, score: 5.0 },
        { ...mockPlayer, id: 4, score: 3.0 }
      ];
      
      const counts = ScoringService.getLabelCounts(players);
      
      expect(counts.perfect).toBe(1);
      expect(counts.good).toBe(1);
      expect(counts.poor).toBe(1);
      expect(counts.urgent).toBe(1);
    });
  });
});

