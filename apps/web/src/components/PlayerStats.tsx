import { EnrichedPlayer } from '../lib/types';
import { formatPrice, formatForm, formatXG, formatXA } from '../lib/format';
import { TrendingUp, TrendingDown, Users, Target, Clock } from 'lucide-react';

interface PlayerStatsProps {
  player: EnrichedPlayer;
}

const PlayerStats = ({ player }: PlayerStatsProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {/* Basic Info */}
      <div className="bg-white rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4 text-gray-800">Basic Information</h3>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-600">Team:</span>
            <span className="font-medium">{player.teamShort}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Position:</span>
            <span className="font-medium">{player.position}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Price:</span>
            <span className="font-medium text-fpl-dark">{formatPrice(player.price)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Ownership:</span>
            <span className="font-medium">{player.ownership}%</span>
          </div>
        </div>
      </div>

      {/* Performance Stats */}
      <div className="bg-white rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4 text-gray-800">Performance</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Form:</span>
            <div className="flex items-center space-x-1">
              {player.form >= 0 ? (
                <TrendingUp className="w-4 h-4 text-green-500" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-500" />
              )}
              <span className="font-medium">{formatForm(player.form)}</span>
            </div>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Total Points:</span>
            <span className="font-medium">{player.totalPoints}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Avg Points:</span>
            <span className="font-medium">{player.avgPoints.toFixed(1)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Minutes:</span>
            <span className="font-medium">{player.minutes}</span>
          </div>
        </div>
      </div>

      {/* Advanced Stats */}
      <div className="bg-white rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4 text-gray-800">Advanced Stats</h3>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-600 flex items-center">
              <Target className="w-4 h-4 mr-1" />
              xG/90:
            </span>
            <span className="font-medium">{formatXG(player.xg90)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 flex items-center">
              <Users className="w-4 h-4 mr-1" />
              xA/90:
            </span>
            <span className="font-medium">{formatXA(player.xa90)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 flex items-center">
              <Clock className="w-4 h-4 mr-1" />
              Expected Minutes:
            </span>
            <span className="font-medium">{player.expMin.toFixed(1)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Next 3 Ease:</span>
            <span className="font-medium">{player.next3Ease.toFixed(1)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlayerStats;
