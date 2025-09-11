import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { EnrichedPlayer, AnalysisWeights } from '../lib/types';
import { apiClient } from '../lib/api';
import { formatPrice, formatForm, formatXG, formatXA } from '../lib/format';
import { ArrowLeft, TrendingUp, TrendingDown, Users, Target, Clock } from 'lucide-react';

interface PlayerSuggestion {
  id: number;
  name: string;
  teamShort: string;
  price: number;
  score: number;
  form: number;
  xg90: number;
  xa90: number;
  next3Ease: number;
  delta: number;
}

interface SuggestionsResponse {
  currentPlayer: {
    id: number;
    name: string;
    score: number;
  };
  suggestions: PlayerSuggestion[];
  count: number;
}

const PlayerDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [player, setPlayer] = useState<EnrichedPlayer | null>(null);
  const [suggestions, setSuggestions] = useState<PlayerSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (id) {
      loadPlayerData();
    }
  }, [id]);

  const loadPlayerData = async () => {
    if (!id) return;

    setIsLoading(true);
    setError(null);

    try {
      // Load player data
      const playerResponse = await apiClient.getPlayerById(parseInt(id));
      if (playerResponse.success && playerResponse.data) {
        setPlayer(playerResponse.data);
        // Load suggestions after player data is loaded
        loadSuggestions(playerResponse.data);
      } else {
        setError('Player not found');
      }
    } catch (error) {
      console.error('Failed to load player:', error);
      setError('Failed to load player data');
    } finally {
      setIsLoading(false);
    }
  };

  const loadSuggestions = async (playerData: EnrichedPlayer) => {
    setIsLoadingSuggestions(true);

    try {
      const response = await fetch('/api/suggestions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playerId: playerData.id,
          position: playerData.pos,
          maxPrice: playerData.price + 2, // Allow some flexibility in price
          excludeIds: [],
          limit: 5
        }),
      });

      const data: { success: boolean; data?: SuggestionsResponse; error?: string } = await response.json();

      if (data.success && data.data) {
        setSuggestions(data.data.suggestions);
      }
    } catch (error) {
      console.error('Failed to load suggestions:', error);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const getScoreLabel = (score: number): { label: string; color: string } => {
    if (score >= 8) return { label: 'Perfect', color: 'text-green-600 bg-green-100' };
    if (score >= 6) return { label: 'Good', color: 'text-blue-600 bg-blue-100' };
    if (score >= 4) return { label: 'Poor', color: 'text-yellow-600 bg-yellow-100' };
    return { label: 'Urgent', color: 'text-red-600 bg-red-100' };
  };

  const getPositionColor = (pos: string): string => {
    switch (pos) {
      case 'GK': return 'bg-green-100 text-green-800';
      case 'DEF': return 'bg-blue-100 text-blue-800';
      case 'MID': return 'bg-yellow-100 text-yellow-800';
      case 'FWD': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-fpl-green mx-auto mb-4"></div>
          <p className="text-gray-600">Loading player data...</p>
        </div>
      </div>
    );
  }

  if (error || !player) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-red-800 mb-2">Player Not Found</h1>
          <p className="text-red-600 mb-4">{error || 'The requested player could not be found.'}</p>
          <button 
            onClick={() => navigate('/')} 
            className="btn-primary"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  const scoreInfo = getScoreLabel(player.score || 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center text-gray-600 hover:text-fpl-dark transition-colors mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back
          </button>
          
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-4 mb-4">
                  <span className={`badge ${getPositionColor(player.pos)}`}>
                    {player.pos}
                  </span>
                  <h1 className="text-3xl font-bold text-gray-900">{player.name}</h1>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-gray-500">Team</div>
                    <div className="font-semibold">{player.teamShort}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Price</div>
                    <div className="font-semibold">{formatPrice(player.price)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Form</div>
                    <div className="font-semibold">{formatForm(player.form)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Status</div>
                    <div className="font-semibold capitalize">
                      {player.status === 'a' ? 'Available' : 'Unavailable'}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="text-right">
                <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${scoreInfo.color}`}>
                  {scoreInfo.label}
                </div>
                <div className="text-2xl font-bold text-gray-900 mt-2">
                  {(player.score || 0).toFixed(1)}
                </div>
                <div className="text-sm text-gray-500">Score</div>
              </div>
            </div>
          </div>
        </div>

        {/* Player Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Performance Stats */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
              <Target className="w-5 h-5 mr-2" />
              Performance Stats
            </h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Expected Goals (xG/90)</span>
                <span className="font-semibold">{formatXG(player.xg90)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Expected Assists (xA/90)</span>
                <span className="font-semibold">{formatXA(player.xa90)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Expected Minutes</span>
                <span className="font-semibold">{player.expMin.toFixed(0)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Next 3 Fixture Ease</span>
                <span className="font-semibold">{player.next3Ease.toFixed(1)}</span>
              </div>
            </div>
          </div>

          {/* FPL Stats */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
              <Users className="w-5 h-5 mr-2" />
              FPL Stats
            </h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Average Points</span>
                <span className="font-semibold">{player.avgPoints.toFixed(1)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Value (Pts/£M)</span>
                <span className="font-semibold">{player.value.toFixed(1)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Ownership</span>
                <span className="font-semibold">{player.ownership.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Alternative Players */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
            <TrendingUp className="w-5 h-5 mr-2" />
            Alternative Players
          </h2>
          
          {isLoadingSuggestions ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-fpl-green mx-auto mb-2"></div>
              <p className="text-gray-600">Loading alternatives...</p>
            </div>
          ) : suggestions.length > 0 ? (
            <div className="space-y-3">
              {suggestions.map((suggestion) => (
                <div
                  key={suggestion.id}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0">
                      <span className={`badge ${getPositionColor(player.pos)}`}>
                        {player.pos}
                      </span>
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">{suggestion.name}</div>
                      <div className="text-sm text-gray-600">
                        {suggestion.teamShort} • {formatPrice(suggestion.price)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-6">
                    <div className="text-right">
                      <div className="text-sm text-gray-500">Score</div>
                      <div className="font-semibold">{suggestion.score.toFixed(1)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-500">Form</div>
                      <div className="font-semibold">{formatForm(suggestion.form)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-500">Improvement</div>
                      <div className={`font-semibold flex items-center ${
                        suggestion.delta > 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {suggestion.delta > 0 ? (
                          <TrendingUp className="w-4 h-4 mr-1" />
                        ) : (
                          <TrendingDown className="w-4 h-4 mr-1" />
                        )}
                        {suggestion.delta > 0 ? '+' : ''}{suggestion.delta.toFixed(1)}
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/player/${suggestion.id}`)}
                      className="btn-primary text-sm px-4 py-2"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Clock className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p>No alternative players found for this position and budget.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlayerDetailPage;
