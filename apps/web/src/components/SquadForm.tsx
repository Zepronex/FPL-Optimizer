import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import SquadSummary from './SquadSummary';
import PlayerSearchModal from './PlayerSearchModal';
import FootballPitch from './FootballPitch';
import BenchDisplay from './BenchDisplay';
import { EnrichedPlayer } from '../lib/types';

interface SquadFormProps {
  squadState: ReturnType<typeof import('../state/useSquad').useSquad>;
}

const SquadForm = ({ squadState }: SquadFormProps) => {
  const { 
    squad, 
    addPlayer, 
    removePlayer, 
    clearSquad, 
    error,
    clearError
  } = squadState;
  
  const [positionFilter, setPositionFilter] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalIsStartingXI, setModalIsStartingXI] = useState(true);
  
  // add player to squad (starting xi or bench)
  const handleAddPlayer = (player: EnrichedPlayer, isStarting: boolean = true) => {
    addPlayer(player, isStarting);
  };
  
  const handleSlotClick = (position: string) => {
    setPositionFilter(position);
    setModalIsStartingXI(true);
    setIsModalOpen(true);
  };
  
  const handleBenchSlotClick = () => {
    setPositionFilter(null); // no filter for bench, any position can go on bench
    setModalIsStartingXI(false);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setPositionFilter(null);
  };



  return (
    <div className="card">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 sm:mb-6 space-y-3 sm:space-y-0">
        <h2 className="text-xl sm:text-2xl font-semibold">Squad Builder</h2>
        <div className="flex space-x-2">
          <button
            onClick={clearSquad}
            className="flex items-center space-x-2 px-3 sm:px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors duration-200 w-full sm:w-auto justify-center"
          >
            <Trash2 className="w-4 h-4" />
            <span>Clear Squad</span>
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <div className="flex justify-between items-center">
            <p className="text-red-800 text-sm">{error}</p>
            <button
              onClick={clearError}
              className="text-red-600 hover:text-red-800"
            >
              ×
            </button>
          </div>
        </div>
      )}


      <SquadSummary squad={squad} />

      <FootballPitch 
        startingXI={squad.startingXI} 
        onRemovePlayer={removePlayer}
        onSlotClick={handleSlotClick}
      />

      <BenchDisplay 
        bench={squad.bench} 
        onRemovePlayer={removePlayer}
        onSlotClick={handleBenchSlotClick}
      />


      {/* Player Search Modal */}
      <PlayerSearchModal
        isOpen={isModalOpen}
        onClose={closeModal}
        onAddPlayer={handleAddPlayer}
        positionFilter={positionFilter}
        isStartingXI={modalIsStartingXI}
      />
    </div>
  );
};

export default SquadForm;
