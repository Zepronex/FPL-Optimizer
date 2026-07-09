import { useState, useEffect } from 'react';
import { Brain, TrendingUp, Target, Shield, Zap } from 'lucide-react';
import { apiClient } from '../lib/api';
import { PlayerPrediction, Pos } from '../lib/types';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';


interface TopPlayersData {
  predictions: PlayerPrediction[];
  total_players_analyzed: number;
  gameweek: number;
}

type SelectedPosition = 'all' | Pos;

const TopPlayersPage = () => {
  const [topPlayers, setTopPlayers] = useState<TopPlayersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<SelectedPosition>('all');

  const positionNames: Record<Pos, string> = {
    GK: 'Goalkeepers',
    DEF: 'Defenders',
    MID: 'Midfielders',
    FWD: 'Forwards'
  };

  const positionIcons: Record<Pos, JSX.Element> = {
    GK: <Shield className="w-5 h-5" />,
    DEF: <Target className="w-5 h-5" />,
    MID: <Zap className="w-5 h-5" />,
    FWD: <TrendingUp className="w-5 h-5" />
  };

  const fetchTopPlayers = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await apiClient.getTopPredictions(100);
      
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch top players');
      }

      setTopPlayers({
        predictions: response.data.predictions,
        total_players_analyzed: response.data.count ?? response.data.predictions.length,
        gameweek: response.data.run.targetGameweekId
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load top players from prediction data.');
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
      return [...topPlayers.predictions].sort((a, b) => b.predictedPoints - a.predictedPoints);
    }
    
    return topPlayers.predictions
      .filter(player => player.position === selectedPosition)
      .sort((a, b) => b.predictedPoints - a.predictedPoints);
  };

  const getTopPlayersByPosition = (position: Pos, limit: number = 5) => {
    if (!topPlayers) return [];
    
    return topPlayers.predictions
      .filter(player => player.position === position)
      .sort((a, b) => b.predictedPoints - a.predictedPoints)
      .slice(0, limit);
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
                <Brain className="w-8 h-8 text-blue-700" />
                Top Players
              </h1>
              <p className="mt-2 text-gray-600">
                Model-backed projections for the next gameweek based on loaded prediction data
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
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Brain className="w-6 h-6 text-blue-700" />
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
                ? 'bg-blue-700 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            All Players
          </button>
          {Object.entries(positionNames).map(([id, name]) => {
            const position = id as Pos;
            return (
            <button
              key={id}
              onClick={() => setSelectedPosition(position)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                selectedPosition === id
                  ? 'bg-blue-700 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {positionIcons[position]}
              {name}
            </button>
          );
          })}
        </div>
      </div>

      {/* Top Players by Position */}
      {selectedPosition === 'all' && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {Object.entries(positionNames).map(([id, name]) => {
              const position = id as Pos;
              const topPlayersForPosition = getTopPlayersByPosition(position, 5);
              
              if (topPlayersForPosition.length === 0) return null;
              
              return (
                <div key={id} className="bg-white rounded-lg shadow">
                  <div className="p-6 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      {positionIcons[position]}
                      Top 5 {name}
                    </h3>
                  </div>
                  <div className="p-6">
                    <div className="space-y-4">
                      {topPlayersForPosition.map((player, index) => (
                        <div key={`${player.playerId}-${player.fixtureId ?? 'season'}`} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-4">
                            <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center">
                              <span className="text-sm font-bold text-blue-700">#{index + 1}</span>
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{player.playerName}</p>
                              <p className="text-sm text-gray-600">GBP {player.price.toFixed(1)}m</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-blue-700">
                              {player.predictedPoints.toFixed(1)} pts
                            </p>
                            {player.confidence !== undefined && player.confidence !== null && (
                              <p className="text-xs text-gray-500">
                                {Math.round(player.confidence * 100)}% confidence
                              </p>
                            )}
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
                {positionNames[selectedPosition]} - All Players
              </h3>
            </div>
            <div className="p-6">
              <div className="space-y-3">
                {getFilteredPlayers().map((player, index) => (
                  <div key={`${player.playerId}-${player.fixtureId ?? 'season'}`} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center">
                        <span className="text-sm font-bold text-blue-700">#{index + 1}</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{player.playerName}</p>
                        <p className="text-sm text-gray-600">GBP {player.price.toFixed(1)}m</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-blue-700">
                        {player.predictedPoints.toFixed(1)} pts
                      </p>
                      {player.confidence !== undefined && player.confidence !== null && (
                        <p className="text-xs text-gray-500">
                          {Math.round(player.confidence * 100)}% confidence
                        </p>
                      )}
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
              These predictions use historical FPL features, player form, fixture difficulty, expected goals,
              expected assists, and availability context to estimate next-gameweek points from loaded PostgreSQL predictions.
            </p>
            <div className="flex justify-center gap-4 text-sm text-gray-500">
              <span>Analyzed {topPlayers?.total_players_analyzed || 0} players</span>
              <span>Confidence scoring</span>
              <span>Updated weekly</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TopPlayersPage;
