import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { apiClient } from '../lib/api';
import { EnrichedPlayer } from '../lib/types';
import SearchResults from './SearchResults';
import { useDebounce } from '../hooks/useDebounce';
import { PLAYER_SEARCH_MAX_LENGTH } from '../lib/inputLimits';

interface GlobalPlayerSearchProps {
  onPlayerSelect?: (player: EnrichedPlayer) => void;
  placeholder?: string;
  className?: string;
}

const GlobalPlayerSearch = ({ placeholder = "Search for any player...", className = "" }: GlobalPlayerSearchProps) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EnrichedPlayer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('No players found');
  const [statusTone, setStatusTone] = useState<'info' | 'error'>('info');
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // debounce search to reduce api calls while typing
  const debouncedQuery = useDebounce(query, 300);

  // close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // search when debounced query changes
  useEffect(() => {
    const normalizedQuery = debouncedQuery.trim();

    if (normalizedQuery.length >= 2 && normalizedQuery.length <= PLAYER_SEARCH_MAX_LENGTH) {
      searchPlayers(normalizedQuery);
    } else if (normalizedQuery.length > PLAYER_SEARCH_MAX_LENGTH) {
      setResults([]);
      setStatusMessage(`Search terms must be ${PLAYER_SEARCH_MAX_LENGTH} characters or fewer.`);
      setStatusTone('error');
    } else {
      setResults([]);
      setStatusMessage('No players found');
      setStatusTone('info');
    }
  }, [debouncedQuery]);

  const searchPlayers = async (normalizedQuery: string) => {
    setIsLoading(true);
    setStatusMessage('No players found');
    setStatusTone('info');

    try {
      const response = await apiClient.searchPlayer(normalizedQuery);
      if (response.success && response.data) {
        setResults(response.data.slice(0, 8)); // Limit to 8 results
      } else {
        setResults([]);
        setStatusMessage(response.error || 'Could not load player search results.');
        setStatusTone('error');
      }
    } catch {
      setResults([]);
      setStatusMessage('Could not load player search results. Confirm that the local API is running.');
      setStatusTone('error');
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
          maxLength={PLAYER_SEARCH_MAX_LENGTH}
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

      {/* search results dropdown */}
      {isOpen && query.length >= 2 && (
        <SearchResults
          results={results}
          isLoading={isLoading}
          onPlayerSelect={handlePlayerClick}
          emptyMessage={statusMessage}
          tone={statusTone}
        />
      )}
    </div>
  );
};

export default GlobalPlayerSearch;
