import { useState } from 'react';
import { PlayerSuggestion } from '../types/playerDetail';
import { formatPrice, formatForm } from '../lib/format';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface PlayerSuggestionsProps {
  suggestions: PlayerSuggestion[];
  isLoading: boolean;
  onLoadMore: () => void;
}

const PlayerSuggestions = ({ suggestions, isLoading, onLoadMore }: PlayerSuggestionsProps) => {
  const [showAll, setShowAll] = useState(false);
  const displayedSuggestions = showAll ? suggestions : suggestions.slice(0, 5);

  return (
    <div className="bg-white rounded-lg p-6 shadow-sm">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-semibold text-gray-800">Alternative Players</h3>
        {suggestions.length > 5 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-fpl-dark hover:text-fpl-green transition-colors text-sm font-medium"
          >
            {showAll ? 'Show Less' : `Show All (${suggestions.length})`}
          </button>
        )}
      </div>

      <div className="space-y-3">
        {displayedSuggestions.map((suggestion) => (
          <div
            key={suggestion.id}
            className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                {suggestion.delta > 0 ? (
                  <TrendingUp className="w-4 h-4 text-green-500" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-500" />
                )}
                <span className="font-medium text-gray-800">
                  {suggestion.name}
                </span>
                <span className="text-sm text-gray-500">
                  ({suggestion.teamShort})
                </span>
              </div>
            </div>
            
            <div className="flex items-center space-x-6 text-sm">
              <div className="text-center">
                <div className="text-gray-500">Price</div>
                <div className="font-medium">{formatPrice(suggestion.price)}</div>
              </div>
              <div className="text-center">
                <div className="text-gray-500">Form</div>
                <div className="font-medium">{formatForm(suggestion.form)}</div>
              </div>
              <div className="text-center">
                <div className="text-gray-500">Score</div>
                <div className="font-medium text-fpl-dark">{suggestion.score.toFixed(1)}</div>
              </div>
              <div className="text-center">
                <div className="text-gray-500">Δ</div>
                <div className={`font-medium ${suggestion.delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {suggestion.delta > 0 ? '+' : ''}{suggestion.delta.toFixed(1)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {suggestions.length === 0 && !isLoading && (
        <div className="text-center py-8 text-gray-500">
          No alternative players found
        </div>
      )}

      {isLoading && (
        <div className="text-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-fpl-green mx-auto"></div>
        </div>
      )}
    </div>
  );
};

export default PlayerSuggestions;
