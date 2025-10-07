import { useState, useEffect } from 'react';
import { X, Search } from 'lucide-react';
import { apiClient } from '../lib/api';
import { EnrichedPlayer } from '../lib/types';
import { useDebounce } from '../hooks/useDebounce';

interface PlayerSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddPlayer: (player: EnrichedPlayer, isStarting: boolean) => void;
  positionFilter?: string | null;
  isStartingXI?: boolean;
}

const PlayerSearchModal = ({ 
  isOpen, 
  onClose, 
  onAddPlayer, 
  positionFilter = null,
  isStartingXI = true 
}: PlayerSearchModalProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<EnrichedPlayer[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // debounce search to reduce api calls while typing
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const handleSearch = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await apiClient.searchPlayer(query);
      if (response.success && response.data && Array.isArray(response.data)) {
        // filter by position if positionFilter is set
        const filteredResults = positionFilter 
          ? response.data.filter((p: EnrichedPlayer) => p.pos === positionFilter)
          : response.data;
        setSearchResults(filteredResults);
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // search when debounced query or position filter changes
  useEffect(() => {
    if (isOpen) {
      handleSearch(debouncedSearchQuery);
    }
  }, [debouncedSearchQuery, positionFilter, isOpen]);

  const handleAddPlayer = (player: EnrichedPlayer) => {
    onAddPlayer(player, isStartingXI);
    onClose();
  };

  const getPositionColor = (pos: string) => {
    switch (pos) {
      case 'GK': return 'bg-green-100 text-green-800';
      case 'DEF': return 'bg-blue-100 text-blue-800';
      case 'MID': return 'bg-yellow-100 text-yellow-800';
      case 'FWD': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {positionFilter ? `Search ${positionFilter} Players` : 'Search Players'}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {isStartingXI ? 'Add to Starting XI' : 'Add to Bench'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Search Input */}
        <div className="p-6 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={positionFilter ? `Search for ${positionFilter} players...` : "Search for players..."}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-fpl-green focus:border-transparent"
              autoFocus
            />
          </div>
        </div>

        {/* Search Results */}
        <div className="flex-1 overflow-y-auto">
          {isSearching && (
            <div className="p-6 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-fpl-green mx-auto mb-2"></div>
              <p className="text-gray-600">Searching players...</p>
            </div>
          )}

          {!isSearching && searchResults.length === 0 && searchQuery.length >= 2 && (
            <div className="p-6 text-center text-gray-500">
              <p>No players found matching "{searchQuery}"</p>
            </div>
          )}

          {!isSearching && searchQuery.length < 2 && (
            <div className="p-6 text-center text-gray-500">
              <p>Type at least 2 characters to search for players</p>
            </div>
          )}

          {searchResults.length > 0 && (
            <div className="divide-y divide-gray-200">
              {searchResults.map((player) => (
                <div
                  key={player.id}
                  className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => handleAddPlayer(player)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      <span className={`text-xs font-semibold px-2 py-1 rounded ${getPositionColor(player.pos)} flex-shrink-0`}>
                        {player.pos}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900 truncate">{player.name}</div>
                        <div className="text-sm text-gray-600">
                          {player.teamShort} • £{player.price}m
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-medium text-gray-900">£{player.price}m</div>
                      <div className="text-xs text-gray-500">Click to add</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-600">
              {searchResults.length} player{searchResults.length !== 1 ? 's' : ''} found
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlayerSearchModal;
