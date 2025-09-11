import { EnrichedPlayer } from '../lib/types';
import { formatXG, formatXA } from '../lib/format';
import { Target, Users } from 'lucide-react';

interface PlayerStatsProps {
  player: EnrichedPlayer;
}

/**
 * PlayerStats component displays the performance and FPL statistics for a player
 * Split into two cards: Performance Stats and FPL Stats for better organization
 */
const PlayerStats = ({ player }: PlayerStatsProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
      {/* Performance Stats */}
      <div className="bg-white rounded-2xl shadow-soft border border-gray-100 p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
          <Target className="w-6 h-6 mr-3 text-fpl-green" />
          Performance Stats
        </h2>
        <div className="space-y-6">
          <div className="flex justify-between items-center py-2">
            <span className="text-gray-600 font-medium">Expected Goals (xG/90)</span>
            <span className="font-bold text-gray-900 text-lg">{formatXG(player.xg90)}</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-gray-600 font-medium">Expected Assists (xA/90)</span>
            <span className="font-bold text-gray-900 text-lg">{formatXA(player.xa90)}</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-gray-600 font-medium">Expected Minutes</span>
            <span className="font-bold text-gray-900 text-lg">{player.expMin.toFixed(0)}</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-gray-600 font-medium">Next 3 Fixture Ease</span>
            <span className="font-bold text-gray-900 text-lg">{player.next3Ease.toFixed(1)}</span>
          </div>
        </div>
      </div>

      {/* FPL Stats */}
      <div className="bg-white rounded-2xl shadow-soft border border-gray-100 p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
          <Users className="w-6 h-6 mr-3 text-fpl-green" />
          FPL Stats
        </h2>
        <div className="space-y-6">
          <div className="flex justify-between items-center py-2">
            <span className="text-gray-600 font-medium">Average Points</span>
            <span className="font-bold text-gray-900 text-lg">{player.avgPoints.toFixed(1)}</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-gray-600 font-medium">Value (Pts/£M)</span>
            <span className="font-bold text-gray-900 text-lg">{player.value.toFixed(1)}</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-gray-600 font-medium">Ownership</span>
            <span className="font-bold text-gray-900 text-lg">{player.ownership.toFixed(1)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlayerStats;
