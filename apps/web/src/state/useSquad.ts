import { useState, useCallback } from 'react';
import { Squad, SquadSlot, EnrichedPlayer, Pos } from '../lib/types';

// Default empty squad state
const initialSquad: Squad = {
  startingXI: [],
  bench: [],
  bank: 0
};

// Position order for sorting (GK first, then DEF, MID, FWD)
const POSITION_ORDER: Record<Pos, number> = {
  'GK': 1,
  'DEF': 2,
  'MID': 3,
  'FWD': 4
};

// Sort players by position order
const sortPlayersByPosition = (players: SquadSlot[]): SquadSlot[] => {
  return [...players].sort((a, b) => POSITION_ORDER[a.pos] - POSITION_ORDER[b.pos]);
};

export const useSquad = () => {
  const [squad, setSquad] = useState<Squad>(initialSquad);
  const [isLoading, _setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addPlayer = useCallback((player: EnrichedPlayer, isStarting: boolean = true) => {
    // Clear any existing errors before attempting to add player
    setError(null);
    
    setSquad(prev => {
      const newSlot: SquadSlot = {
        id: player.id,
        pos: player.pos,
        price: player.price,
        name: player.name,
        teamShort: player.teamShort
      };

      if (isStarting) {
        // Validate starting XI capacity (max 11 players)
        if (prev.startingXI.length >= 11) {
          setError('Starting XI is full (11 players)');
          return prev;
        }
        
        // Prevent duplicate players in squad
        if (prev.startingXI.some(slot => slot.id === player.id) || 
            prev.bench.some(slot => slot.id === player.id)) {
          setError('Player is already in squad');
          return prev;
        }

        const newSquad = {
          ...prev,
          startingXI: sortPlayersByPosition([...prev.startingXI, newSlot])
        };
        return newSquad;
      } else {
        // Check if we can add to bench (max 4 players)
        if (prev.bench.length >= 4) {
          setError('Bench is full (4 players)');
          return prev;
        }
        
        // Check if player is already in squad
        if (prev.startingXI.some(slot => slot.id === player.id) || 
            prev.bench.some(slot => slot.id === player.id)) {
          setError('Player is already in squad');
          return prev;
        }

        const newSquad = {
          ...prev,
          bench: sortPlayersByPosition([...prev.bench, newSlot])
        };
        return newSquad;
      }
    });
  }, []);

  const removePlayer = useCallback((playerId: number) => {
    setSquad(prev => ({
      ...prev,
      startingXI: prev.startingXI.filter(slot => slot.id !== playerId),
      bench: prev.bench.filter(slot => slot.id !== playerId)
    }));
  }, []);

  const movePlayer = useCallback((playerId: number, fromStarting: boolean) => {
    setSquad(prev => {
      if (fromStarting) {
        // Move from starting XI to bench
        const player = prev.startingXI.find(slot => slot.id === playerId);
        if (!player || prev.bench.length >= 4) return prev;
        
        return {
          ...prev,
          startingXI: prev.startingXI.filter(slot => slot.id !== playerId),
          bench: sortPlayersByPosition([...prev.bench, player])
        };
      } else {
        // Move from bench to starting XI
        const player = prev.bench.find(slot => slot.id === playerId);
        if (!player || prev.startingXI.length >= 11) return prev;
        
        return {
          ...prev,
          bench: prev.bench.filter(slot => slot.id !== playerId),
          startingXI: sortPlayersByPosition([...prev.startingXI, player])
        };
      }
    });
  }, []);

  const setBank = useCallback((bank: number) => {
    setSquad(prev => ({ ...prev, bank }));
  }, []);

  const clearSquad = useCallback(() => {
    setSquad(initialSquad);
    setError(null);
  }, []);

  const loadSquadFromJSON = useCallback((jsonString: string) => {
    try {
      const parsedSquad = JSON.parse(jsonString);
      
      // Validate the squad structure
      if (!parsedSquad.startingXI || !parsedSquad.bench || typeof parsedSquad.bank !== 'number') {
        setError('Invalid squad format');
        return;
      }

      if (!Array.isArray(parsedSquad.startingXI) || !Array.isArray(parsedSquad.bench)) {
        setError('Invalid squad format');
        return;
      }

      setSquad(parsedSquad);
      setError(null);
    } catch (err) {
      setError('Invalid JSON format');
    }
  }, []);

  const exportSquadToJSON = useCallback(() => {
    return JSON.stringify(squad, null, 2);
  }, [squad]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    squad,
    isLoading,
    error,
    addPlayer,
    removePlayer,
    movePlayer,
    setBank,
    clearSquad,
    loadSquadFromJSON,
    exportSquadToJSON,
    clearError
  };
};
