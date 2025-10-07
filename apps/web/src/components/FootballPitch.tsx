import { formatPrice } from '../lib/format';
import { SquadSlot } from '../lib/types';
import { memo } from 'react';

interface FootballPitchProps {
  startingXI: (SquadSlot | null)[];
  onRemovePlayer?: (playerId: number) => void;
  isReadOnly?: boolean;
  onSlotClick?: (position: string) => void;
}

const FootballPitch = ({ startingXI, onRemovePlayer, isReadOnly = false, onSlotClick }: FootballPitchProps) => {
  // organize players by position for display
  const goalkeeper = startingXI.find(slot => slot?.pos === 'GK') || null;
  const defenders = startingXI.filter(slot => slot?.pos === 'DEF');
  const midfielders = startingXI.filter(slot => slot?.pos === 'MID');
  const forwards = startingXI.filter(slot => slot?.pos === 'FWD');

  // Get current formation counts
  const formation = {
    GK: goalkeeper ? 1 : 0,
    DEF: defenders.length,
    MID: midfielders.length,
    FWD: forwards.length
  };

  // Determine how many slots to show for each position
  const getSlotsToShow = (position: string, currentCount: number) => {
    // In read-only mode, only show the actual players
    if (isReadOnly) {
      return currentCount;
    }
    
    const totalPlayers = formation.GK + formation.DEF + formation.MID + formation.FWD;
    const isSquadComplete = totalPlayers >= 11;
    
    switch (position) {
      case 'GK':
        return 1; // Always show 1 GK slot
      case 'DEF':
        if (isSquadComplete) {
          return currentCount; // Show only filled slots when squad is complete
        }
        // Show at least 3, up to 5, or current count + 1 if we can add more
        return Math.max(3, Math.min(5, currentCount + (currentCount < 5 ? 1 : 0)));
      case 'MID':
        if (isSquadComplete) {
          return currentCount; // Show only filled slots when squad is complete
        }
        // Show at least 3, up to 5, or current count + 1 if we can add more
        return Math.max(3, Math.min(5, currentCount + (currentCount < 5 ? 1 : 0)));
      case 'FWD':
        if (isSquadComplete) {
          return currentCount; // Show only filled slots when squad is complete
        }
        // Show at least 1, up to 3, or current count + 1 if we can add more
        return Math.max(1, Math.min(3, currentCount + (currentCount < 3 ? 1 : 0)));
      default:
        return currentCount;
    }
  };

  const defSlots = getSlotsToShow('DEF', formation.DEF);
  const midSlots = getSlotsToShow('MID', formation.MID);
  const fwdSlots = getSlotsToShow('FWD', formation.FWD);

  const PlayerSlot = ({ slot, position }: { slot: SquadSlot | null; position: string }) => {
    // adjust text size based on name length for better fit
    const getTextSize = (name: string) => {
      if (name.length <= 10) return 'text-sm';
      if (name.length <= 15) return 'text-xs';
      if (name.length <= 20) return 'text-xs leading-tight';
      return 'text-xs leading-tight';
    };

    // truncate very long names to fit in player slot
    const truncateName = (name: string) => {
      if (name.length <= 20) return name;
      return name.substring(0, 17) + '...';
    };

    return (
      <div className="relative group flex-shrink-0">
        <div 
          className={`w-20 h-20 sm:w-28 sm:h-28 md:w-32 md:h-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-white hover:bg-gray-50 transition-colors shadow-sm ${onSlotClick && !isReadOnly ? 'cursor-pointer hover:border-fpl-green' : ''}`}
          onClick={() => onSlotClick && !isReadOnly && onSlotClick(position)}
        >
          {slot ? (
            <div className="text-center p-1 w-full h-full flex flex-col justify-center">
              {/* Player image placeholder */}
              <div className="w-8 h-8 mx-auto mb-1 rounded-full bg-gray-300 flex items-center justify-center">
                <span className="text-xs font-semibold text-gray-600">
                  {slot.name ? slot.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : '??'}
                </span>
              </div>
              <div className={`font-semibold ${getTextSize(slot.name || '')} break-words overflow-hidden`} title={slot.name}>
                {truncateName(slot.name || `Player ${slot.id}`)}
              </div>
              <div className="text-xs text-gray-600 mt-1">{slot.teamShort}</div>
              <div className="text-xs text-gray-600">{formatPrice(slot.price)}</div>
              {!isReadOnly && onRemovePlayer && (
                <button
                  onClick={(e) => {
                    e.stopPropagation(); // prevent triggering slot click
                    onRemovePlayer(slot.id);
                  }}
                  className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100 shadow-md"
                >
                  ×
                </button>
              )}
              {onSlotClick && !isReadOnly && (
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all duration-200 rounded-lg flex items-center justify-center">
                  <div className="opacity-0 group-hover:opacity-100 text-xs text-white font-medium bg-black bg-opacity-50 px-2 py-1 rounded">
                    Click to replace
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-gray-400 text-sm text-center">
              <div className="font-medium">{position}</div>
              <div className="text-xs">{onSlotClick && !isReadOnly ? 'Click to search' : 'Empty'}</div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-6">
      <div className="text-center mb-4 sm:mb-6">
        <h3 className="text-base sm:text-lg font-semibold text-gray-800">Starting XI Formation</h3>
      </div>
      
      {/* Simple Position Rows - Mobile Optimized */}
      <div className="space-y-3 sm:space-y-4">
        {/* Goalkeeper */}
        <div>
          <h4 className="text-xs sm:text-sm font-medium text-gray-700 mb-2 text-center">Goalkeeper</h4>
          <div className="flex justify-center">
            <PlayerSlot slot={goalkeeper} position="GK" />
          </div>
        </div>
        
        {/* Defenders */}
        <div>
          <h4 className="text-xs sm:text-sm font-medium text-gray-700 mb-2 text-center">
            Defenders ({defenders.length}/{defSlots})
          </h4>
          <div className="flex justify-center space-x-1 sm:space-x-3 overflow-x-auto pb-2">
            {Array.from({ length: defSlots }, (_, i) => (
              <PlayerSlot key={i} slot={defenders[i] || null} position="DEF" />
            ))}
          </div>
        </div>
        
        {/* Midfielders */}
        <div>
          <h4 className="text-xs sm:text-sm font-medium text-gray-700 mb-2 text-center">
            Midfielders ({midfielders.length}/{midSlots})
          </h4>
          <div className="flex justify-center space-x-1 sm:space-x-3 overflow-x-auto pb-2">
            {Array.from({ length: midSlots }, (_, i) => (
              <PlayerSlot key={i} slot={midfielders[i] || null} position="MID" />
            ))}
          </div>
        </div>
        
        {/* Forwards */}
        <div>
          <h4 className="text-xs sm:text-sm font-medium text-gray-700 mb-2 text-center">
            Forwards ({forwards.length}/{fwdSlots})
          </h4>
          <div className="flex justify-center space-x-1 sm:space-x-3 overflow-x-auto pb-2">
            {Array.from({ length: fwdSlots }, (_, i) => (
              <PlayerSlot key={i} slot={forwards[i] || null} position="FWD" />
            ))}
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

export default memo(FootballPitch);
