import { 
  formatPrice, 
  formatScore, 
  formatDelta, 
  getLabelColor, 
  getLabelText, 
  getPositionColor,
  getDifficultyColor,
  getDifficultyText,
  calculateTotalSquadValue,
  isValidFormation,
  getFormationString
} from '../format';
import { Squad } from '../../types';

describe('format utilities', () => {
  describe('formatPrice', () => {
    it('should format price correctly', () => {
      expect(formatPrice(8.5)).toBe('£8.5m');
      expect(formatPrice(10.0)).toBe('£10.0m');
      expect(formatPrice(4.5)).toBe('£4.5m');
    });
  });

  describe('formatScore', () => {
    it('should format score correctly', () => {
      expect(formatScore(7.5)).toBe('7.5');
      expect(formatScore(8.0)).toBe('8.0');
      expect(formatScore(6.25)).toBe('6.3');
    });
  });

  describe('formatDelta', () => {
    it('should format delta correctly', () => {
      expect(formatDelta(1.5)).toBe('+1.5');
      expect(formatDelta(-0.5)).toBe('-0.5');
      expect(formatDelta(0)).toBe('+0.0');
    });
  });

  describe('getLabelColor', () => {
    it('should return correct colors for labels', () => {
      expect(getLabelColor('perfect')).toContain('green');
      expect(getLabelColor('good')).toContain('blue');
      expect(getLabelColor('poor')).toContain('yellow');
      expect(getLabelColor('urgent')).toContain('red');
    });
  });

  describe('getLabelText', () => {
    it('should return correct text for labels', () => {
      expect(getLabelText('perfect')).toBe('Perfect');
      expect(getLabelText('good')).toBe('Good');
      expect(getLabelText('poor')).toBe('Poor');
      expect(getLabelText('urgent')).toBe('Urgent');
    });
  });

  describe('getPositionColor', () => {
    it('should return correct colors for positions', () => {
      expect(getPositionColor('GK')).toContain('purple');
      expect(getPositionColor('DEF')).toContain('blue');
      expect(getPositionColor('MID')).toContain('green');
      expect(getPositionColor('FWD')).toContain('red');
    });
  });

  describe('getDifficultyColor', () => {
    it('should return correct colors for difficulty', () => {
      expect(getDifficultyColor(1)).toContain('green');
      expect(getDifficultyColor(3)).toContain('yellow');
      expect(getDifficultyColor(5)).toContain('red');
    });
  });

  describe('getDifficultyText', () => {
    it('should return correct text for difficulty', () => {
      expect(getDifficultyText(1)).toBe('Easy');
      expect(getDifficultyText(3)).toBe('Medium');
      expect(getDifficultyText(5)).toBe('Hard');
    });
  });

  describe('calculateTotalSquadValue', () => {
    it('should calculate total squad value correctly', () => {
      const squad: Squad = {
        startingXI: [
          { id: 1, pos: 'GK', price: 5.0 },
          { id: 2, pos: 'DEF', price: 6.0 }
        ],
        bench: [
          { id: 3, pos: 'GK', price: 4.0 }
        ],
        bank: 1.0
      };
      
      expect(calculateTotalSquadValue(squad)).toBe(16.0);
    });
  });

  describe('isValidFormation', () => {
    it('should validate correct formations', () => {
      const validFormation = [
        { pos: 'GK' },
        { pos: 'DEF' },
        { pos: 'DEF' },
        { pos: 'DEF' },
        { pos: 'MID' },
        { pos: 'MID' },
        { pos: 'MID' },
        { pos: 'MID' },
        { pos: 'FWD' },
        { pos: 'FWD' },
        { pos: 'FWD' }
      ];
      
      expect(isValidFormation(validFormation)).toBe(true);
    });

    it('should reject invalid formations', () => {
      const invalidFormation = [
        { pos: 'GK' },
        { pos: 'DEF' },
        { pos: 'DEF' },
        { pos: 'DEF' },
        { pos: 'MID' },
        { pos: 'MID' },
        { pos: 'MID' },
        { pos: 'MID' },
        { pos: 'FWD' },
        { pos: 'FWD' }
      ];
      
      expect(isValidFormation(invalidFormation)).toBe(false);
    });
  });

  describe('getFormationString', () => {
    it('should return correct formation string', () => {
      const formation = [
        { pos: 'GK' },
        { pos: 'DEF' },
        { pos: 'DEF' },
        { pos: 'DEF' },
        { pos: 'MID' },
        { pos: 'MID' },
        { pos: 'MID' },
        { pos: 'MID' },
        { pos: 'FWD' },
        { pos: 'FWD' },
        { pos: 'FWD' }
      ];
      
      expect(getFormationString(formation)).toBe('3-4-3');
    });
  });
});

