import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { EnrichedPlayer, AnalysisWeights } from '../lib/types';
import { apiClient } from '../lib/api';
import { formatPrice, formatForm } from '../lib/format';
import { ArrowLeft } from 'lucide-react';
import PlayerStats from '../components/PlayerStats';
import PlayerAlternatives from '../components/PlayerAlternatives';

/**
 * PlayerDetailPage displays comprehensive information about a specific player
 * including their FPL stats, performance metrics, and alternative player suggestions.
 * This page is accessed when users click on a player from search results.
 */

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

  // Default weights for scoring - these match the backend scoring algorithm
  // Used for consistent player evaluation across the application
  const defaultWeights: AnalysisWeights = {
    form: 0.2,        // Recent performance (last 5 games)
    xg90: 0.15,       // Expected goals per 90 minutes
    xa90: 0.15,       // Expected assists per 90 minutes
    expMin: 0.15,     // Expected minutes (playing time likelihood)
    next3Ease: 0.1,   // Fixture difficulty for next 3 games
    avgPoints: 0.15,  // Historical FPL points average
    value: 0.05,      // Points per million (value for money)
    ownership: 0.05   // Ownership percentage (differential factor)
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
        <div className="mb-12">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center text-gray-600 hover:text-fpl-dark transition-colors mb-6 font-medium"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back
          </button>
          
          <div className="bg-white rounded-2xl shadow-soft border border-gray-100 p-8">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-4 mb-6">
                  <span className={`badge ${getPositionColor(player.pos)}`}>
                    {player.pos}
                  </span>
                  <h1 className="text-4xl font-bold text-gray-900 tracking-tight">{player.name}</h1>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
                  <div>
                    <div className="text-gray-500 text-xs uppercase tracking-wide font-medium mb-1">Team</div>
                    <div className="font-semibold text-gray-900">{player.teamShort}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs uppercase tracking-wide font-medium mb-1">Price</div>
                    <div className="font-semibold text-gray-900">{formatPrice(player.price)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs uppercase tracking-wide font-medium mb-1">Form</div>
                    <div className="font-semibold text-gray-900">{formatForm(player.form)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs uppercase tracking-wide font-medium mb-1">Status</div>
                    <div className="font-semibold text-gray-900 capitalize">
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
        <PlayerStats player={player} />

        {/* Alternative Players */}
        <PlayerAlternatives 
          suggestions={suggestions} 
          isLoading={isLoadingSuggestions} 
          playerPos={player.pos}
        />
      </div>
    </div>
  );
};

export default PlayerDetailPage;
