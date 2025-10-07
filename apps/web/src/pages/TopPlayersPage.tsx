import { useState, useEffect } from 'react';
import { Brain, TrendingUp, Target, Shield, Zap } from 'lucide-react';
import { apiClient } from '../lib/api';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';


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
  fallback?: boolean; // Indicates if this is using fallback scoring instead of ML
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
      
      // Call the API endpoint through apiClient
      const response = await apiClient.getTopPlayers();
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch top players');
      }

      setTopPlayers(response.data);
    } catch (err) {
      console.error('Error fetching top players:', err);
      setError('Failed to load top players. Make sure the ML service is running.');
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
          action={{
            label: 'Retry',
            onClick: fetchTopPlayers
          }}
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
                {topPlayers?.fallback 
                  ? 'Player rankings based on scoring system (ML service unavailable)'
                  : 'AI-powered predictions for the next gameweek based on machine learning analysis'
                }
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

      {/* Position Filter and Score Legend */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-6">
        <div className="flex flex-wrap gap-2 mb-4">
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
        
        {/* Score Legend */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-semibold text-blue-800 mb-2">Score Scale (0-10)</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded"></div>
              <span><strong>8.0-10.0:</strong> Excellent</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded"></div>
              <span><strong>6.0-7.9:</strong> Good</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-yellow-500 rounded"></div>
              <span><strong>4.0-5.9:</strong> Average</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded"></div>
              <span><strong>0.0-3.9:</strong> Poor</span>
            </div>
          </div>
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
                              {player.predicted_points.toFixed(1)}/10
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
                        {player.predicted_points.toFixed(1)}/10
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
              {topPlayers?.fallback 
                ? 'These rankings are generated using our scoring system that analyzes player form, expected goals/assists, fixture difficulty, and other key metrics. Scores are based on a 0-10 scale where 8.0+ is excellent, 6.0-7.9 is good, 4.0-5.9 is average, and below 4.0 is poor. For AI-powered predictions, start the ML service.'
                : 'These predictions are generated using machine learning algorithms trained on historical FPL data. The model analyzes player form, fixture difficulty, expected goals/assists, and other key metrics to predict performance for the next gameweek. Scores are based on a 0-10 scale where 8.0+ is excellent, 6.0-7.9 is good, 4.0-5.9 is average, and below 4.0 is poor.'
              }
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
