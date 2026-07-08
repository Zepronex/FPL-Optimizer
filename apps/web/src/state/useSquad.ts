import { useState, useCallback, useEffect } from 'react';
import { Squad, SquadSlot, Pos } from '../lib/types';

const SQUAD_STORAGE_KEY = 'scoutiq-squad-builder-state';

const initialSquad: Squad = {
  startingXI: [],
  bench: [],
  bank: 100
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

const POSITION_LABELS: Record<Pos, { singular: string; plural: string }> = {
  GK: { singular: 'goalkeeper', plural: 'goalkeepers' },
  DEF: { singular: 'defender', plural: 'defenders' },
  MID: { singular: 'midfielder', plural: 'midfielders' },
  FWD: { singular: 'forward', plural: 'forwards' }
};

// Sort players by position order
const sortPlayersByPosition = (players: SquadSlot[]): SquadSlot[] => {
  return [...players].sort((a, b) => POSITION_ORDER[a.pos] - POSITION_ORDER[b.pos]);
};

export const useSquad = () => {
  const [squad, setSquad] = useState<Squad>(() => readStoredSquad());
  const [isLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    writeStoredSquad(squad);
  }, [squad]);

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
        const limit = SQUAD_POSITION_LIMITS[player.pos];
        setError(`Full squad can include at most ${limit} ${formatPositionLabel(player.pos, limit)}`);
        return prev;
      }

      if (isStarting) {
        if (prev.startingXI.length >= 11) {
          setError('Starting XI is full (11 players)');
          return prev;
        }

        const startingPositionCount = countPlayersByPosition(prev.startingXI, player.pos);
        if (startingPositionCount >= STARTING_XI_POSITION_LIMITS[player.pos]) {
          const limit = STARTING_XI_POSITION_LIMITS[player.pos];
          setError(`Starting XI can include at most ${limit} ${formatPositionLabel(player.pos, limit)}`);
          return prev;
        }

        const startingXI = sortPlayersByPosition([...prev.startingXI, newSlot]);
        const newSquad = {
          ...prev,
          startingXI,
          bank: calculateRemainingBank(startingXI, prev.bench)
        };
        return newSquad;
      } else {
        if (prev.bench.length >= 4) {
          setError('Bench is full (4 players)');
          return prev;
        }

        const bench = sortPlayersByPosition([...prev.bench, newSlot]);
        const newSquad = {
          ...prev,
          bench,
          bank: calculateRemainingBank(prev.startingXI, bench)
        };
        return newSquad;
      }
    });
  }, []);

  const removePlayer = useCallback((playerId: number) => {
    setSquad(prev => {
      const startingXI = prev.startingXI.filter(slot => slot.id !== playerId);
      const bench = prev.bench.filter(slot => slot.id !== playerId);
      return {
        ...prev,
        startingXI,
        bench,
        bank: calculateRemainingBank(startingXI, bench)
      };
    });
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
        
        const startingXI = prev.startingXI.filter(slot => slot.id !== playerId);
        const bench = sortPlayersByPosition([...prev.bench, player]);

        return {
          ...prev,
          startingXI,
          bench,
          bank: calculateRemainingBank(startingXI, bench)
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
          const limit = STARTING_XI_POSITION_LIMITS[player.pos];
          setError(`Starting XI can include at most ${limit} ${formatPositionLabel(player.pos, limit)}`);
          return prev;
        }
        
        const bench = prev.bench.filter(slot => slot.id !== playerId);
        const startingXI = sortPlayersByPosition([...prev.startingXI, player]);

        return {
          ...prev,
          bench,
          startingXI,
          bank: calculateRemainingBank(startingXI, bench)
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

function formatPositionLabel(position: Pos, count: number): string {
  return count === 1 ? POSITION_LABELS[position].singular : POSITION_LABELS[position].plural;
}

function calculateRemainingBank(startingXI: readonly SquadSlot[], bench: readonly SquadSlot[]): number {
  const spent = [...startingXI, ...bench].reduce((sum, player) => sum + player.price, 0);
  return Math.max(0, Math.round((100 - spent) * 10) / 10);
}

function readStoredSquad(): Squad {
  if (typeof window === 'undefined') return initialSquad;

  try {
    const stored = window.sessionStorage.getItem(SQUAD_STORAGE_KEY);
    if (!stored) return initialSquad;

    const parsed: unknown = JSON.parse(stored);
    return isSquad(parsed)
      ? {
          ...parsed,
          bank: calculateRemainingBank(parsed.startingXI, parsed.bench)
        }
      : initialSquad;
  } catch {
    return initialSquad;
  }
}

function writeStoredSquad(squad: Squad): void {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(SQUAD_STORAGE_KEY, JSON.stringify(squad));
  } catch {
    // Ignore storage failures; in-memory state still works for the current session.
  }
}

function isSquad(value: unknown): value is Squad {
  if (!isRecord(value)) return false;

  return (
    Array.isArray(value.startingXI) &&
    value.startingXI.every(isSquadSlot) &&
    Array.isArray(value.bench) &&
    value.bench.every(isSquadSlot) &&
    typeof value.bank === 'number'
  );
}

function isSquadSlot(value: unknown): value is SquadSlot {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === 'number' &&
    isPos(value.pos) &&
    typeof value.price === 'number' &&
    (value.name === undefined || typeof value.name === 'string') &&
    (value.teamShort === undefined || typeof value.teamShort === 'string')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPos(value: unknown): value is Pos {
  return value === 'GK' || value === 'DEF' || value === 'MID' || value === 'FWD';
}
