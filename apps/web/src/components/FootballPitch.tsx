import { formatPrice } from '../lib/format';
import { SquadSlot } from '../lib/types';

interface FootballPitchProps {
  startingXI: (SquadSlot | null)[];
  onRemovePlayer: (playerId: number) => void;
}

const FootballPitch = ({ startingXI, onRemovePlayer }: FootballPitchProps) => {
  // Organize players by position
  const goalkeeper = startingXI.find(slot => slot?.pos === 'GK') || null;
  const defenders = startingXI.filter(slot => slot?.pos === 'DEF');
  const midfielders = startingXI.filter(slot => slot?.pos === 'MID');
  const forwards = startingXI.filter(slot => slot?.pos === 'FWD');

  const PlayerSlot = ({ slot, position, index }: { slot: SquadSlot | null; position: string; index: number }) => {
    // Determine text size based on name length
    const getTextSize = (name: string) => {
      if (name.length <= 12) return 'text-sm';
      if (name.length <= 16) return 'text-xs';
      return 'text-xs leading-tight';
    };

    return (
      <div className="relative group">
        <div className="w-28 h-28 md:w-32 md:h-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-white hover:bg-gray-50 transition-colors shadow-sm">
          {slot ? (
            <div className="text-center p-2 w-full">
              <div className={`font-semibold ${getTextSize(slot.name)} break-words`} title={slot.name}>
                {slot.name || `Player ${slot.id}`}
              </div>
              <div className="text-xs text-gray-600">{slot.teamShort}</div>
              <div className="text-xs text-gray-600">{formatPrice(slot.price)}</div>
              <button
                onClick={() => onRemovePlayer(slot.id)}
                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100 shadow-md"
              >
                ×
              </button>
            </div>
          ) : (
            <div className="text-gray-400 text-sm text-center">
              <div className="font-medium">{position}</div>
              <div>Empty</div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold text-gray-800">Starting XI Formation</h3>
      </div>
      
      {/* Simple Position Rows */}
      <div className="space-y-4">
        {/* Goalkeeper */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Goalkeeper</h4>
          <div className="flex justify-center">
            <PlayerSlot slot={goalkeeper} position="GK" index={0} />
          </div>
        </div>
        
        {/* Defenders */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Defenders</h4>
          <div className="flex justify-center space-x-3">
            {defenders.map((slot, i) => (
              <PlayerSlot key={i} slot={slot} position="DEF" index={i} />
            ))}
            {defenders.length === 0 && (
              <PlayerSlot slot={null} position="DEF" index={0} />
            )}
          </div>
        </div>
        
        {/* Midfielders */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Midfielders</h4>
          <div className="flex justify-center space-x-3">
            {midfielders.map((slot, i) => (
              <PlayerSlot key={i} slot={slot} position="MID" index={i} />
            ))}
            {midfielders.length === 0 && (
              <PlayerSlot slot={null} position="MID" index={0} />
            )}
          </div>
        </div>
        
        {/* Forwards */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Forwards</h4>
          <div className="flex justify-center space-x-3">
            {forwards.map((slot, i) => (
              <PlayerSlot key={i} slot={slot} position="FWD" index={i} />
            ))}
            {forwards.length === 0 && (
              <PlayerSlot slot={null} position="FWD" index={0} />
            )}
          </div>
        </div>
      </div>
      
      {/* Formation Display */}
      <div className="mt-6 text-center">
        <div className="text-sm text-gray-600 font-medium">
          Formation: {defenders.length}-{midfielders.length}-{forwards.length}
        </div>
      </div>
    </div>
  );
};

export default FootballPitch;
