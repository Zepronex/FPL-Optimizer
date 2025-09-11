import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { apiClient } from '../lib/api';
import { EnrichedPlayer } from '../lib/types';
import { formatPrice } from '../lib/format';

interface PlayerSearchProps {
  onAddPlayer: (player: EnrichedPlayer, isStarting: boolean) => void;
}

const PlayerSearch = ({ onAddPlayer }: PlayerSearchProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<EnrichedPlayer[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await apiClient.searchPlayer(query);
      if (response.success && response.data && Array.isArray(response.data)) {
        setSearchResults(response.data);
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      handleSearch(searchQuery);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const handleAddPlayer = (player: EnrichedPlayer, isStarting: boolean = true) => {
    onAddPlayer(player, isStarting);
    setSearchQuery('');
    setSearchResults([]);
  };

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
                  {player.teamShort} • {player.pos} • {formatPrice(player.price)}
                </div>
              </div>
              <div className="flex space-x-2">
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
