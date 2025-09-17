import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { apiClient } from '../lib/api';
import { EnrichedPlayer } from '../lib/types';
import SearchResults from './SearchResults';
import PlayerScoring from './PlayerScoring';

interface GlobalPlayerSearchProps {
  onPlayerSelect?: (player: EnrichedPlayer) => void;
  placeholder?: string;
  className?: string;
}

const GlobalPlayerSearch = ({ onPlayerSelect, placeholder = "Search for any player...", className = "" }: GlobalPlayerSearchProps) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EnrichedPlayer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<EnrichedPlayer | null>(null);
  const [playerScore, setPlayerScore] = useState<number | null>(null);
  const [isScoring, setIsScoring] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (query.length >= 2) {
      searchPlayers();
    } else {
      setResults([]);
    }
  }, [query]);

  const searchPlayers = async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.searchPlayer(query);
      if (response.success && response.data) {
        setResults(response.data.slice(0, 8)); // Limit to 8 results
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlayerClick = (player: EnrichedPlayer) => {
    setIsOpen(false);
    setQuery('');
    navigate(`/player/${player.id}`);
  };

  const calculateSimpleScore = (player: EnrichedPlayer): number => {
    // Simple scoring calculation based on available metrics
    const formScore = Math.min(player.form * 2, 10);
    const xgScore = Math.min(player.xg90 * 20, 10);
    const xaScore = Math.min(player.xa90 * 25, 10);
    const minutesScore = (player.expMin / 90) * 10;
    const avgPointsScore = Math.min(player.avgPoints * 0.5, 10);
    const valueScore = Math.min(player.value * 2, 10);
    const ownershipScore = (player.ownership / 10);

    return Math.round((
      formScore * defaultWeights.form +
      xgScore * defaultWeights.xg90 +
      xaScore * defaultWeights.xa90 +
      minutesScore * defaultWeights.expMin +
      avgPointsScore * defaultWeights.avgPoints +
      valueScore * defaultWeights.value +
      ownershipScore * defaultWeights.ownership
    ) * 100) / 100;
  };

  const getScoreLabel = (score: number): { label: string; color: string } => {
    if (score >= 8) return { label: 'Perfect', color: 'text-green-600 bg-green-100' };
    if (score >= 6) return { label: 'Good', color: 'text-blue-600 bg-blue-100' };
    if (score >= 4) return { label: 'Poor', color: 'text-yellow-600 bg-yellow-100' };
    return { label: 'Urgent', color: 'text-red-600 bg-red-100' };
  };

  const clearSelection = () => {
    setSelectedPlayer(null);
    setPlayerScore(null);
    setQuery('');
    setIsOpen(false);
  };

  return (
    <div ref={searchRef} className={`relative ${className}`}>
      {/* Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="block w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        {query && (
          <button
            onClick={clearSelection}
            className="absolute inset-y-0 right-0 pr-3 flex items-center"
          >
            <X className="h-5 w-5 text-gray-400 hover:text-gray-600" />
          </button>
        )}
      </div>

      {/* Search Results Dropdown */}
      {isOpen && query.length >= 2 && (
        <SearchResults
          results={results}
          isLoading={isLoading}
          onPlayerSelect={handlePlayerClick}
          onPlayerScore={handlePlayerScore}
          isScoring={isScoring}
        />
      )}

      {/* Player Scoring Modal */}
      {selectedPlayer && (
        <PlayerScoring
          player={selectedPlayer}
          onClose={clearSelection}
          onScoreCalculated={setPlayerScore}
        />
      )}
    </div>
  );
};

export default GlobalPlayerSearch;
