import { EnrichedPlayer } from '../lib/types';
import { formatPrice } from '../lib/format';
import { User, DollarSign } from 'lucide-react';
import PlayerImage from './PlayerImage';

interface SearchResultsProps {
  results: EnrichedPlayer[];
  isLoading: boolean;
  onPlayerSelect: (player: EnrichedPlayer) => void;
}

const SearchResults = ({ results, isLoading, onPlayerSelect }: SearchResultsProps) => {
  if (isLoading) {
    return (
      <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-80 overflow-y-auto z-50">
        <div className="p-4 text-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-fpl-green mx-auto mb-2"></div>
          <p className="text-gray-600 text-sm">Searching players...</p>
        </div>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 z-50">
        <div className="p-4 text-center text-gray-500">
          <User className="w-8 h-8 mx-auto mb-2 text-gray-400" />
          <p className="text-sm">No players found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-80 overflow-y-auto z-50">
      {results.map((player) => (
        <div
          key={player.id}
          className="flex items-center justify-between p-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
        >
          <div className="flex items-center space-x-3 flex-1">
            <div className="flex-shrink-0">
              <PlayerImage player={player} size="sm" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900 truncate">{player.name}</div>
              <div className="text-sm text-gray-600">
                <span className={`badge ${getPositionColor(player.pos)} mr-2`}>
                  {player.pos}
                </span>
                {player.teamShort} • {formatPrice(player.price)}
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => onPlayerSelect(player)}
              className="flex items-center space-x-1 text-xs bg-fpl-dark text-white px-2 py-1 rounded hover:bg-gray-700 transition-colors"
            >
              <DollarSign className="w-3 h-3" />
              <span>View</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

const getPositionColor = (pos: string) => {
  switch (pos) {
    case 'GK': return 'bg-green-100 text-green-800';
    case 'DEF': return 'bg-blue-100 text-blue-800';
    case 'MID': return 'bg-yellow-100 text-yellow-800';
    case 'FWD': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

export default SearchResults;
