import { useState, useEffect } from 'react';
import { apiClient } from '../lib/api';
import { EnrichedPlayer } from '../lib/types';
import { formatPrice, getFormationString, calculateTotalSquadValue } from '../lib/format';
import { Search, Trash2 } from 'lucide-react';

interface SquadFormProps {
  squadState: ReturnType<typeof import('../state/useSquad').useSquad>;
}

const SquadForm = ({ squadState }: SquadFormProps) => {
  const { 
    squad, 
    addPlayer, 
    removePlayer, 
    movePlayer, 
    setBank, 
    clearSquad, 
    loadSquadFromJSON, 
    exportSquadToJSON,
    error,
    clearError
  } = squadState;
  
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
      console.error('Search error:', error);
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
    addPlayer(player, isStarting);
    setSearchQuery('');
    setSearchResults([]);
  };


  const totalValue = calculateTotalSquadValue(squad);
  const formation = getFormationString(squad.startingXI.map(slot => ({ pos: slot.pos })));



  return (
    <div className="card">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold">Squad Builder</h2>
        <div className="flex space-x-2">
          <button
            onClick={clearSquad}
            className="btn-danger text-sm"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Clear Squad
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <div className="flex justify-between items-center">
            <p className="text-red-800 text-sm">{error}</p>
            <button
              onClick={clearError}
              className="text-red-600 hover:text-red-800"
            >
              ×
            </button>
          </div>
        </div>
      )}


      {/* Squad Summary */}
      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-fpl-dark">
              {squad.startingXI.length}/11
            </div>
            <div className="text-sm text-gray-600">Starting XI</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-fpl-dark">
              {squad.bench.length}/4
            </div>
            <div className="text-sm text-gray-600">Bench</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-fpl-dark">
              {formation}
            </div>
            <div className="text-sm text-gray-600">Formation</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-fpl-dark">
              {formatPrice(totalValue)}
            </div>
            <div className="text-sm text-gray-600">Total Value</div>
          </div>
        </div>
      </div>

      {/* Player Search */}
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

        {/* Search Results */}
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

      {/* Bank Input */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Bank (Remaining Budget)
        </label>
        <div className="flex items-center space-x-2">
          <span className="text-gray-500">£</span>
          <input
            type="number"
            value={squad.bank}
            onChange={(e) => setBank(parseFloat(e.target.value) || 0)}
            step="0.1"
            min="0"
            max="100"
            className="input-field flex-1"
          />
          <span className="text-gray-500">m</span>
        </div>
      </div>

      {/* Starting XI */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3">Starting XI</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 11 }, (_, index) => {
            const slot = squad.startingXI[index];
            return (
              <div
                key={index}
                className="border-2 border-dashed border-gray-300 rounded-lg p-3 min-h-[80px] flex items-center justify-center"
              >
                {slot ? (
                  <div className="text-center">
                    <div className="font-semibold text-sm truncate" title={slot.name}>
                      {slot.name || `Player ${slot.id}`}
                    </div>
                    <div className="text-xs text-gray-600">{slot.teamShort} • {slot.pos}</div>
                    <div className="text-xs text-gray-600">{formatPrice(slot.price)}</div>
                    <button
                      onClick={() => removePlayer(slot.id)}
                      className="text-red-500 hover:text-red-700 text-xs mt-1"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="text-gray-400 text-sm">Empty Slot</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bench */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Bench</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }, (_, index) => {
            const slot = squad.bench[index];
            return (
              <div
                key={index}
                className="border-2 border-dashed border-gray-300 rounded-lg p-3 min-h-[80px] flex items-center justify-center"
              >
                {slot ? (
                  <div className="text-center">
                    <div className="font-semibold text-sm truncate" title={slot.name}>
                      {slot.name || `Player ${slot.id}`}
                    </div>
                    <div className="text-xs text-gray-600">{slot.teamShort} • {slot.pos}</div>
                    <div className="text-xs text-gray-600">{formatPrice(slot.price)}</div>
                    <button
                      onClick={() => removePlayer(slot.id)}
                      className="text-red-500 hover:text-red-700 text-xs mt-1"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="text-gray-400 text-sm">Empty Slot</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SquadForm;
