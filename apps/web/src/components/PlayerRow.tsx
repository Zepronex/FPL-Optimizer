import { useState } from 'react';
import { AnalysisResult } from '../lib/types';
import { 
  formatPrice, 
  formatScore, 
  formatDelta, 
  getLabelColor, 
  getLabelText, 
  getPositionColor,
  getDifficultyColor,
  getDifficultyText,
  formatForm,
  formatXG,
  formatXA,
  formatMinutes
} from '../lib/format';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface PlayerRowProps {
  result: AnalysisResult;
  isBench?: boolean;
}

const PlayerRow = ({ result, isBench = false }: PlayerRowProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { player, score, label, suggestions } = result;

  const hasSuggestions = suggestions.length > 0;
  const showExpansion = !isBench && (label !== 'perfect' || hasSuggestions);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Main Row */}
      <div className="p-4 bg-white hover:bg-gray-50 transition-colors">
        <div className="flex items-center justify-between">
          {/* Player Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <span className={`badge ${getPositionColor(player.pos)}`}>
                  {player.pos}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-semibold text-gray-900 truncate">
                  {player.name}
                </h3>
                <div className="flex items-center space-x-4 text-sm text-gray-600">
                  <span>{player.teamShort}</span>
                  <span>{formatPrice(player.price)}</span>
                  {!isBench && (
                    <>
                      <span>Form: {formatForm(player.form)}</span>
                      <span>xG: {formatXG(player.xg90)}</span>
                      <span>xA: {formatXA(player.xa90)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Score and Label */}
          <div className="flex items-center space-x-3">
            {!isBench && (
              <div className="text-right">
                <div className="text-2xl font-bold text-fpl-dark">
                  {formatScore(score)}
                </div>
                <div className="text-xs text-gray-500">Score</div>
              </div>
            )}
            
            <span className={`badge ${getLabelColor(label)}`}>
              {getLabelText(label)}
            </span>

            {/* Expand Button */}
            {showExpansion && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {isExpanded ? (
                  <ChevronUp className="w-5 h-5" />
                ) : (
                  <ChevronDown className="w-5 h-5" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-gray-200 bg-gray-50">
          {/* Player Stats */}
          <div className="p-4">
            <h4 className="font-semibold text-gray-900 mb-3">Player Statistics</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-lg font-semibold text-fpl-dark">
                  {formatForm(player.form)}
                </div>
                <div className="text-xs text-gray-600">Form</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-fpl-dark">
                  {formatXG(player.xg90)}
                </div>
                <div className="text-xs text-gray-600">xG/90</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-fpl-dark">
                  {formatXA(player.xa90)}
                </div>
                <div className="text-xs text-gray-600">xA/90</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-fpl-dark">
                  {formatMinutes(player.expMin)}
                </div>
                <div className="text-xs text-gray-600">Expected Min</div>
              </div>
            </div>
            
            {/* Next 3 Fixtures */}
            <div className="mt-4">
              <h5 className="font-medium text-gray-900 mb-2">Next 3 Fixtures</h5>
              <div className="flex items-center space-x-2">
                <span className={`badge ${getDifficultyColor(player.next3Ease)}`}>
                  {getDifficultyText(player.next3Ease)}
                </span>
                <span className="text-sm text-gray-600">
                  Average difficulty: {player.next3Ease.toFixed(1)}/5
                </span>
              </div>
            </div>
          </div>

          {/* Suggestions */}
          {hasSuggestions && (
            <div className="p-4 border-t border-gray-200">
              <div className="mb-3">
                <h4 className="font-semibold text-gray-900">Suggested Replacements</h4>
              </div>
              
              <div className="space-y-2">
                {suggestions.map((suggestion, index) => (
                  <div
                    key={suggestion.id}
                    className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">
                        {suggestion.name}
                      </div>
                      <div className="text-sm text-gray-600">
                        {formatPrice(suggestion.price)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-semibold ${
                        suggestion.delta > 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {formatDelta(suggestion.delta)}
                      </div>
                      <div className="text-xs text-gray-500">Score Change</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No Suggestions Message */}
          {label !== 'perfect' && !hasSuggestions && (
            <div className="p-4 border-t border-gray-200 text-center">
              <p className="text-gray-600">
                No suitable replacements found within budget constraints.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PlayerRow;

