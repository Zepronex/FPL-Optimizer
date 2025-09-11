import { useState, useEffect, useRef } from 'react';
import { Search, X, User, TrendingUp, DollarSign } from 'lucide-react';
import { apiClient } from '../lib/api';
import { EnrichedPlayer, AnalysisWeights } from '../lib/types';
import { formatPrice } from '../lib/format';

interface GlobalPlayerSearchProps {
  onPlayerSelect?: (player: EnrichedPlayer) => void;
  placeholder?: string;
  className?: string;
}

const GlobalPlayerSearch = ({ onPlayerSelect, placeholder = "Search for any player...", className = "" }: GlobalPlayerSearchProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EnrichedPlayer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<EnrichedPlayer | null>(null);
  const [playerScore, setPlayerScore] = useState<number | null>(null);
  const [isScoring, setIsScoring] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Default weights for scoring
  const defaultWeights: AnalysisWeights = {
    form: 0.2,
    xg90: 0.15,
    xa90: 0.15,
    expMin: 0.15,
    next3Ease: 0.1,
    avgPoints: 0.15,
    value: 0.05,
    ownership: 0.05
  };

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

  const handlePlayerClick = async (player: EnrichedPlayer) => {
    setSelectedPlayer(player);
    setIsOpen(false);
    setQuery(player.name);
    
    // Calculate player score
    setIsScoring(true);
    try {
      // For now, we'll calculate a simple score based on available data
      // In a real implementation, you'd call an API endpoint for individual player scoring
      const score = calculateSimpleScore(player);
      setPlayerScore(score);
    } catch (error) {
      console.error('Scoring failed:', error);
    } finally {
      setIsScoring(false);
    }

    if (onPlayerSelect) {
      onPlayerSelect(player);
    }
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
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-center text-gray-500">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto mb-2"></div>
              Searching players...
            </div>
          ) : results.length > 0 ? (
            <div className="py-1">
              {results.map((player) => (
                <button
                  key={player.id}
                  onClick={() => handlePlayerClick(player)}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                          <User className="w-4 h-4 text-gray-600" />
                        </div>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{player.name}</div>
                        <div className="text-sm text-gray-500">
                          {player.teamShort} • {player.pos} • {formatPrice(player.price)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-gray-900">{player.form.toFixed(1)}</div>
                      <div className="text-xs text-gray-500">Form</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-4 text-center text-gray-500">
              No players found for "{query}"
            </div>
          )}
        </div>
      )}

      {/* Selected Player Details */}
      {selectedPlayer && (
        <div className="mt-4 p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                <User className="w-6 h-6 text-gray-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{selectedPlayer.name}</h3>
                <p className="text-sm text-gray-600">
                  {selectedPlayer.teamShort} • {selectedPlayer.pos} • {formatPrice(selectedPlayer.price)}
                </p>
              </div>
            </div>
            <button
              onClick={clearSelection}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Player Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <div className="text-lg font-semibold text-blue-600">{selectedPlayer.form.toFixed(1)}</div>
              <div className="text-xs text-gray-500">Form</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-green-600">{selectedPlayer.xg90.toFixed(2)}</div>
              <div className="text-xs text-gray-500">xG/90</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-purple-600">{selectedPlayer.xa90.toFixed(2)}</div>
              <div className="text-xs text-gray-500">xA/90</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-orange-600">{selectedPlayer.avgPoints.toFixed(1)}</div>
              <div className="text-xs text-gray-500">Avg Points</div>
            </div>
          </div>

          {/* Player Score */}
          {isScoring ? (
            <div className="text-center py-2">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto mb-2"></div>
              <div className="text-sm text-gray-500">Calculating score...</div>
            </div>
          ) : playerScore !== null ? (
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-5 h-5 text-gray-600" />
                <span className="font-medium text-gray-900">Player Score</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-2xl font-bold text-gray-900">{playerScore.toFixed(1)}</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getScoreLabel(playerScore).color}`}>
                  {getScoreLabel(playerScore).label}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default GlobalPlayerSearch;
