import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { apiClient } from '../lib/api';
import { EnrichedPlayer } from '../lib/types';
import { useDebounce } from '../hooks/useDebounce';

interface PlayerSearchProps {
  onAddPlayer: (player: EnrichedPlayer, isStarting: boolean) => void;
}

type SearchStatus = 'idle' | 'loading' | 'loaded' | 'error';

const PlayerSearch = ({ onAddPlayer }: PlayerSearchProps) => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<EnrichedPlayer[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>('idle');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [requiredCommands, setRequiredCommands] = useState<string[]>([]);
  
  // debounce search to reduce api calls while typing
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const handleSearch = async (query: string) => {
    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 2) {
      setSearchResults([]);
      setSearchStatus('idle');
      setSearchError(null);
      setRequiredCommands([]);
      return;
    }

    setIsSearching(true);
    setSearchStatus('loading');
    setSearchError(null);
    setRequiredCommands([]);

    try {
      const response = await apiClient.searchPlayer(trimmedQuery);
      if (response.success && response.data && Array.isArray(response.data)) {
        setSearchResults(response.data);
        setSearchStatus('loaded');
      } else {
        setSearchResults([]);
        setSearchStatus('error');
        setSearchError(response.error || 'Could not load player search results.');
        setRequiredCommands(response.requiredCommands || []);
      }
    } catch {
      setSearchResults([]);
      setSearchStatus('error');
      setSearchError('Could not load player search results. Confirm that the local API is running.');
      setRequiredCommands([]);
    } finally {
      setIsSearching(false);
    }
  };

  // search when debounced query changes
  useEffect(() => {
    handleSearch(debouncedSearchQuery);
  }, [debouncedSearchQuery]);

  const handleAddPlayer = (player: EnrichedPlayer, isStarting: boolean = true) => {
    onAddPlayer(player, isStarting);
    setSearchQuery('');
    setSearchResults([]);
    setSearchStatus('idle');
    setSearchError(null);
    setRequiredCommands([]);
  };

  const showNoMatches = (
    !isSearching &&
    searchStatus === 'loaded' &&
    debouncedSearchQuery.trim().length >= 2 &&
    searchResults.length === 0
  );

  return (
    <div className="mb-6">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search for players..."
          className="input-field pl-10"
        />
      </div>

      {searchQuery.length > 0 && searchQuery.trim().length < 2 && (
        <p className="mt-2 text-sm text-gray-500">Enter at least 2 characters to search loaded players.</p>
      )}

      {searchResults.length > 0 && (
        <div className="mt-2 border border-gray-200 rounded-lg bg-white shadow-lg max-h-60 overflow-y-auto">
          {searchResults.map((player) => (
            <div
              key={player.id}
              className="flex items-center justify-between p-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
            >
              <div className="flex-1">
                <div className="font-semibold">{player.name}</div>
                <div className="text-sm text-gray-600">
                  {player.teamShort}
                </div>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => navigate(`/player/${player.id}`)}
                  className="btn-secondary text-xs px-3 py-1"
                >
                  View Details
                </button>
                <button
                  onClick={() => handleAddPlayer(player, true)}
                  className="btn-primary text-xs px-3 py-1"
                >
                  Starting XI
                </button>
                <button
                  onClick={() => handleAddPlayer(player, false)}
                  className="btn-secondary text-xs px-3 py-1"
                >
                  Bench
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNoMatches && (
        <div className="mt-2 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
          No matching players were found for "{debouncedSearchQuery.trim()}".
        </div>
      )}

      {!isSearching && searchStatus === 'error' && (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">Player search unavailable</p>
          <p className="mt-1">{searchError}</p>
          {requiredCommands.length > 0 && (
            <div className="mt-3">
              <p className="font-medium">Run the local data pipeline:</p>
              <pre className="mt-2 overflow-x-auto rounded-md bg-white p-3 text-xs text-gray-800">
                {requiredCommands.join('\n')}
              </pre>
            </div>
          )}
        </div>
      )}

      {isSearching && (
        <div className="mt-2 text-center text-gray-500">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-fpl-green mx-auto"></div>
          <p className="text-sm mt-2">Searching...</p>
        </div>
      )}
    </div>
  );
};

export default PlayerSearch;
