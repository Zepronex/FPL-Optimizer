import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, Clock } from 'lucide-react';
import { formatPrice, formatForm } from '../lib/format';

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

interface PlayerAlternativesProps {
  suggestions: PlayerSuggestion[];
  isLoading: boolean;
  playerPos: string;
}

/**
 * PlayerAlternatives component displays alternative player suggestions
 * Shows players with better scores and allows navigation to their detail pages
 */
const PlayerAlternatives = ({ suggestions, isLoading, playerPos }: PlayerAlternativesProps) => {
  const navigate = useNavigate();

  const getPositionColor = (pos: string): string => {
    switch (pos) {
      case 'GK': return 'bg-green-100 text-green-800';
      case 'DEF': return 'bg-blue-100 text-blue-800';
      case 'MID': return 'bg-yellow-100 text-yellow-800';
      case 'FWD': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-soft border border-gray-100 p-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
        <TrendingUp className="w-6 h-6 mr-3 text-fpl-green" />
        Alternative Players
      </h2>
      
      {isLoading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-fpl-green mx-auto mb-2"></div>
          <p className="text-gray-600">Loading alternatives...</p>
        </div>
      ) : suggestions.length > 0 ? (
        <div className="space-y-4">
          {suggestions.map((suggestion) => (
            <div
              key={suggestion.id}
              className="flex items-center justify-between p-6 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center space-x-4">
                <div className="flex-shrink-0">
                  <span className={`badge ${getPositionColor(playerPos)}`}>
                    {playerPos}
                  </span>
                </div>
                <div>
                  <div className="font-semibold text-gray-900 text-lg">{suggestion.name}</div>
                  <div className="text-sm text-gray-600">
                    {suggestion.teamShort} • {formatPrice(suggestion.price)}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-6">
                <div className="text-right">
                  <div className="text-sm text-gray-500">Score</div>
                  <div className="font-semibold text-lg">{suggestion.score.toFixed(1)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-500">Form</div>
                  <div className="font-semibold text-lg">{formatForm(suggestion.form)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-500">Improvement</div>
                  <div className={`font-semibold flex items-center text-lg ${
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
  );
};

export default PlayerAlternatives;
