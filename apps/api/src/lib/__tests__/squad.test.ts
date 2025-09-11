import { SquadAnalyzer } from '../squad';
import { Squad } from '../../types';

describe('SquadAnalyzer', () => {
  const validSquad: Squad = {
    startingXI: [
      { id: 1, pos: 'GK', price: 5.5 },
      { id: 2, pos: 'DEF', price: 6.0 },
      { id: 3, pos: 'DEF', price: 5.5 },
      { id: 4, pos: 'DEF', price: 5.0 },
      { id: 5, pos: 'MID', price: 8.5 },
      { id: 6, pos: 'MID', price: 7.0 },
      { id: 7, pos: 'MID', price: 6.5 },
      { id: 8, pos: 'MID', price: 6.0 },
      { id: 9, pos: 'MID', price: 5.5 },
      { id: 10, pos: 'FWD', price: 8.0 },
      { id: 11, pos: 'FWD', price: 7.5 }
    ],
    bench: [
      { id: 12, pos: 'GK', price: 4.0 },
      { id: 13, pos: 'DEF', price: 4.0 },
      { id: 14, pos: 'MID', price: 4.5 },
      { id: 15, pos: 'FWD', price: 4.5 }
    ],
    bank: 0.5
  };

  describe('validateSquad', () => {
    it('should validate a correct squad', () => {
      const validation = SquadAnalyzer.validateSquad(validSquad);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should reject squad with wrong number of starting XI players', () => {
      const invalidSquad = {
        ...validSquad,
        startingXI: validSquad.startingXI.slice(0, 10)
      };
      
      const validation = SquadAnalyzer.validateSquad(invalidSquad);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Starting XI must have exactly 11 players');
    });

    it('should reject squad with wrong number of bench players', () => {
      const invalidSquad = {
        ...validSquad,
        bench: validSquad.bench.slice(0, 3)
      };
      
      const validation = SquadAnalyzer.validateSquad(invalidSquad);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Bench must have exactly 4 players');
    });

    it('should reject squad with invalid formation', () => {
      const invalidSquad = {
        ...validSquad,
        startingXI: [
          { id: 1, pos: 'GK', price: 5.5 },
          { id: 2, pos: 'DEF', price: 6.0 },
          { id: 3, pos: 'DEF', price: 5.5 },
          { id: 4, pos: 'DEF', price: 5.0 },
          { id: 5, pos: 'DEF', price: 4.5 },
          { id: 6, pos: 'DEF', price: 4.0 },
          { id: 7, pos: 'MID', price: 6.5 },
          { id: 8, pos: 'MID', price: 6.0 },
          { id: 9, pos: 'MID', price: 5.5 },
          { id: 10, pos: 'FWD', price: 8.0 },
          { id: 11, pos: 'FWD', price: 7.5 }
        ]
      };
      
      const validation = SquadAnalyzer.validateSquad(invalidSquad);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Invalid formation - must have 1 GK and valid DEF/MID/FWD distribution');
    });

    it('should reject squad exceeding budget', () => {
      const invalidSquad = {
        ...validSquad,
        bank: 50 // Total would exceed 100
      };
      
      const validation = SquadAnalyzer.validateSquad(invalidSquad);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Total squad value cannot exceed 100.0');
    });

    it('should reject squad with duplicate players', () => {
      const invalidSquad = {
        ...validSquad,
        startingXI: [
          ...validSquad.startingXI.slice(0, 10),
          { id: 1, pos: 'FWD', price: 7.5 } // Duplicate ID
        ]
      };
      
      const validation = SquadAnalyzer.validateSquad(invalidSquad);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Cannot have duplicate players in squad');
    });
  });
});

