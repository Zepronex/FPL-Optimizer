import { formatPrice } from '../lib/format';
import { SquadSlot } from '../lib/types';

interface SquadSlotsProps {
  slots: (SquadSlot | null)[];
  onRemovePlayer: (playerId: number) => void;
  title: string;
  className?: string;
}

const SquadSlots = ({ slots, onRemovePlayer, title, className = "" }: SquadSlotsProps) => {
  return (
    <div className={className}>
      <h3 className="text-lg font-semibold mb-3">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {slots.map((slot, index) => (
          <div
            key={index}
            className="border-2 border-dashed border-gray-300 rounded-lg p-3 min-h-[80px] flex items-center justify-center"
          >
            {slot ? (
              <div className="text-center">
                <div className="font-semibold text-sm truncate" title={slot.name}>
                  {slot.name || `Player ${slot.id}`}
                </div>
                <div className="text-xs text-gray-600">{slot.teamShort} • {slot.pos}</div>
                <div className="text-xs text-gray-600">{formatPrice(slot.price)}</div>
                <button
                  onClick={() => onRemovePlayer(slot.id)}
                  className="text-red-500 hover:text-red-700 text-xs mt-1"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="text-gray-400 text-sm">Empty Slot</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SquadSlots;
