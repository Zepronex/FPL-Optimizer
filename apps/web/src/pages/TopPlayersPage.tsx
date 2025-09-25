import { useState, useEffect } from 'react';
import { Brain, TrendingUp, Target, Shield, Zap } from 'lucide-react';
import { apiClient } from '../lib/api';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

interface PlayerPrediction {
  player_id: number;
  predicted_points: number;
  confidence: number;
  features: {
    name?: string;
    position: number;
    price: number;
    team: number;
  };
}

interface TopPlayersData {
  top_players_by_position: {
    [position: number]: Array<{
      player_id: number;
      name: string;
      position: number;
      price: number;
      team: number;
      predicted_points: number;
      confidence: number;
    }>;
  };
  total_players_analyzed: number;
  gameweek: number;
}

const TopPlayersPage = () => {
  const [topPlayers, setTopPlayers] = useState<TopPlayersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<string>('all');

  const positionNames = {
    1: 'Goalkeepers',
    2: 'Defenders', 
    3: 'Midfielders',
    4: 'Forwards'
  };

  const positionIcons = {
    1: <Shield className="w-5 h-5" />,
    2: <Target className="w-5 h-5" />,
    3: <Zap className="w-5 h-5" />,
    4: <TrendingUp className="w-5 h-5" />
  };

  const fetchTopPlayers = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Call the new top players endpoint
      const response = await fetch('http://localhost:3002/predict/top-players', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`ML service error: ${response.status}`);
      }

      const data = await response.json();
      setTopPlayers(data);
    } catch (err) {
      console.error('Error fetching top players:', err);
      setError('Failed to load top players. Make sure the ML service is running on port 3002.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTopPlayers();
  }, []);

  const getFilteredPlayers = () => {
    if (!topPlayers) return [];
    
    if (selectedPosition === 'all') {
      // Return all players from all positions
      const allPlayers = [];
      for (const position in topPlayers.top_players_by_position) {
        allPlayers.push(...topPlayers.top_players_by_position[position]);
      }
      return allPlayers.sort((a, b) => b.predicted_points - a.predicted_points);
    }
    
    const positionId = parseInt(selectedPosition);
    return topPlayers.top_players_by_position[positionId] || [];
  };

  const getTopPlayersByPosition = (position: number, limit: number = 5) => {
    if (!topPlayers) return [];
    
    return (topPlayers.top_players_by_position[position] || []).slice(0, limit);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner size="lg" text="Loading top players..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <ErrorMessage 
          message={error}
          onRetry={fetchTopPlayers}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Brain className="w-8 h-8 text-purple-600" />
                Top Players
              </h1>
              <p className="mt-2 text-gray-600">
                AI-powered predictions for the next gameweek based on machine learning analysis
              </p>
            </div>
            <button
              onClick={fetchTopPlayers}
              className="btn-primary flex items-center gap-2"
            >
              <TrendingUp className="w-4 h-4" />
              Refresh Predictions
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {topPlayers && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Brain className="w-6 h-6 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Players Analyzed</p>
                  <p className="text-2xl font-bold text-gray-900">{topPlayers.total_players_analyzed}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Target className="w-6 h-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Predicting Gameweek</p>
                  <p className="text-2xl font-bold text-gray-900">{topPlayers.gameweek}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Position Filter */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-6">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedPosition('all')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              selectedPosition === 'all'
                ? 'bg-purple-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            All Players
          </button>
          {Object.entries(positionNames).map(([id, name]) => (
            <button
              key={id}
              onClick={() => setSelectedPosition(id)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                selectedPosition === id
                  ? 'bg-purple-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {positionIcons[parseInt(id) as keyof typeof positionIcons]}
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* Top Players by Position */}
      {selectedPosition === 'all' && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {Object.entries(positionNames).map(([id, name]) => {
              const positionId = parseInt(id);
              const topPlayersForPosition = getTopPlayersByPosition(positionId, 5);
              
              if (topPlayersForPosition.length === 0) return null;
              
              return (
                <div key={id} className="bg-white rounded-lg shadow">
                  <div className="p-6 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      {positionIcons[positionId as keyof typeof positionIcons]}
                      Top 5 {name}
                    </h3>
                  </div>
                  <div className="p-6">
                    <div className="space-y-4">
                      {topPlayersForPosition.map((player, index) => (
                        <div key={player.player_id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-4">
                            <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                              <span className="text-sm font-bold text-purple-600">#{index + 1}</span>
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{player.name}</p>
                              <p className="text-sm text-gray-600">£{player.price.toFixed(1)}m</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-purple-600">
                              {player.predicted_points.toFixed(1)} pts
                            </p>
                            <p className="text-xs text-gray-500">
                              {Math.round(player.confidence * 100)}% confidence
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filtered Players List */}
      {selectedPosition !== 'all' && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {positionNames[parseInt(selectedPosition) as keyof typeof positionNames]} - All Players
              </h3>
            </div>
            <div className="p-6">
              <div className="space-y-3">
                {getFilteredPlayers().map((player, index) => (
                  <div key={player.player_id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                        <span className="text-sm font-bold text-purple-600">#{index + 1}</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{player.name}</p>
                        <p className="text-sm text-gray-600">£{player.price.toFixed(1)}m</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-purple-600">
                        {player.predicted_points.toFixed(1)} pts
                      </p>
                      <p className="text-xs text-gray-500">
                        {Math.round(player.confidence * 100)}% confidence
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">About These Predictions</h3>
            <p className="text-gray-600 mb-4">
              These predictions are generated using machine learning algorithms trained on historical FPL data. 
              The model analyzes player form, fixture difficulty, expected goals/assists, and other key metrics 
              to predict performance for the next gameweek.
            </p>
            <div className="flex justify-center gap-4 text-sm text-gray-500">
              <span>• Analyzed {topPlayers?.total_players_analyzed || 0} players</span>
              <span>• Dynamic confidence scoring</span>
              <span>• Updated weekly</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TopPlayersPage;
