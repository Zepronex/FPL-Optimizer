import { useState, useCallback } from 'react';
import { Squad, SquadSlot, Pos } from '../lib/types';

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

const SQUAD_POSITION_LIMITS: Record<Pos, number> = {
  GK: 2,
  DEF: 5,
  MID: 5,
  FWD: 3
};

const STARTING_XI_POSITION_LIMITS: Record<Pos, number> = {
  GK: 1,
  DEF: 5,
  MID: 5,
  FWD: 3
};

const POSITION_LABELS: Record<Pos, string> = {
  GK: 'goalkeepers',
  DEF: 'defenders',
  MID: 'midfielders',
  FWD: 'forwards'
};

// Sort players by position order
const sortPlayersByPosition = (players: SquadSlot[]): SquadSlot[] => {
  return [...players].sort((a, b) => POSITION_ORDER[a.pos] - POSITION_ORDER[b.pos]);
};

export const useSquad = () => {
  const [squad, setSquad] = useState<Squad>(initialSquad);
  const [isLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addPlayer = useCallback((player: SquadSlot, isStarting: boolean = true) => {
    setError(null);
    
    setSquad(prev => {
      const newSlot: SquadSlot = {
        id: player.id,
        pos: player.pos,
        price: player.price,
        name: player.name,
        teamShort: player.teamShort
      };

      if (prev.startingXI.some(slot => slot.id === player.id) ||
          prev.bench.some(slot => slot.id === player.id)) {
        setError('Player is already in squad');
        return prev;
      }

      const squadPositionCount = countPlayersByPosition([...prev.startingXI, ...prev.bench], player.pos);
      if (squadPositionCount >= SQUAD_POSITION_LIMITS[player.pos]) {
        setError(`Full squad can include at most ${SQUAD_POSITION_LIMITS[player.pos]} ${POSITION_LABELS[player.pos]}`);
        return prev;
      }

      if (isStarting) {
        if (prev.startingXI.length >= 11) {
          setError('Starting XI is full (11 players)');
          return prev;
        }

        const startingPositionCount = countPlayersByPosition(prev.startingXI, player.pos);
        if (startingPositionCount >= STARTING_XI_POSITION_LIMITS[player.pos]) {
          setError(`Starting XI can include at most ${STARTING_XI_POSITION_LIMITS[player.pos]} ${POSITION_LABELS[player.pos]}`);
          return prev;
        }

        const newSquad = {
          ...prev,
          startingXI: sortPlayersByPosition([...prev.startingXI, newSlot])
        };
        return newSquad;
      } else {
        if (prev.bench.length >= 4) {
          setError('Bench is full (4 players)');
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
    setError(null);

    setSquad(prev => {
      if (fromStarting) {
        const player = prev.startingXI.find(slot => slot.id === playerId);
        if (!player) return prev;
        if (prev.bench.length >= 4) {
          setError('Bench is full (4 players)');
          return prev;
        }
        
        return {
          ...prev,
          startingXI: prev.startingXI.filter(slot => slot.id !== playerId),
          bench: sortPlayersByPosition([...prev.bench, player])
        };
      } else {
        const player = prev.bench.find(slot => slot.id === playerId);
        if (!player) return prev;
        if (prev.startingXI.length >= 11) {
          setError('Starting XI is full (11 players)');
          return prev;
        }
        const startingPositionCount = countPlayersByPosition(prev.startingXI, player.pos);
        if (startingPositionCount >= STARTING_XI_POSITION_LIMITS[player.pos]) {
          setError(`Starting XI can include at most ${STARTING_XI_POSITION_LIMITS[player.pos]} ${POSITION_LABELS[player.pos]}`);
          return prev;
        }
        
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
    } catch {
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

function countPlayersByPosition(players: readonly SquadSlot[], position: Pos): number {
  return players.filter(player => player.pos === position).length;
}
