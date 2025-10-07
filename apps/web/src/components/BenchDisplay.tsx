import { formatPrice } from '../lib/format';
import { SquadSlot } from '../lib/types';

interface BenchDisplayProps {
  bench: (SquadSlot | null)[];
  onRemovePlayer: (playerId: number) => void;
  onSlotClick?: () => void;
}

const BenchDisplay = ({ bench, onRemovePlayer, onSlotClick }: BenchDisplayProps) => {
  const PlayerCard = ({ slot, index }: { slot: SquadSlot | null; index: number }) => (
    <div className="relative group">
      <div 
        className={`w-full h-20 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-white hover:bg-gray-50 transition-colors ${onSlotClick ? 'cursor-pointer hover:border-fpl-green' : ''}`}
        onClick={() => onSlotClick && onSlotClick()}
      >
        {slot ? (
          <div className="flex items-center justify-between w-full p-3">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm truncate" title={slot.name}>
                {slot.name || `Player ${slot.id}`}
              </div>
              <div className="text-xs text-gray-600">{slot.teamShort} • {slot.pos}</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-medium text-gray-900">{formatPrice(slot.price)}</div>
              <button
                onClick={(e) => {
                  e.stopPropagation(); // prevent triggering slot click
                  onRemovePlayer(slot.id);
                }}
                className="text-red-500 hover:text-red-700 text-xs mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                Remove
              </button>
            </div>
            {onSlotClick && (
              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all duration-200 rounded-lg flex items-center justify-center">
                <div className="opacity-0 group-hover:opacity-100 text-xs text-white font-medium bg-black bg-opacity-50 px-2 py-1 rounded">
                  Click to replace
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-gray-400 text-sm text-center">
            <div>Bench Slot {index + 1}</div>
            <div className="text-xs">{onSlotClick ? 'Click to search' : 'Empty'}</div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">Substitutes</h3>
        <div className="text-sm text-gray-600">
          {bench.filter(slot => slot !== null).length}/4 players
        </div>
      </div>
      
      <div className="space-y-2">
        {Array.from({ length: 4 }, (_, index) => (
          <PlayerCard key={index} slot={bench[index] || null} index={index} />
        ))}
      </div>
    </div>
  );
};

export default BenchDisplay;
