import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { apiClient } from '../lib/api';
import { EnrichedPlayer } from '../lib/types';
import SearchResults from './SearchResults';
import PlayerScoring from './PlayerScoring';
import { useDebounce } from '../hooks/useDebounce';

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
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Debounce search query to avoid excessive API calls
  const debouncedQuery = useDebounce(query, 300);

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
    if (debouncedQuery.length >= 2) {
      searchPlayers();
    } else {
      setResults([]);
    }
  }, [debouncedQuery]);

  const searchPlayers = async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.searchPlayer(debouncedQuery);
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
          onPlayerScore={() => {}} // Placeholder function
          isScoring={false}
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
