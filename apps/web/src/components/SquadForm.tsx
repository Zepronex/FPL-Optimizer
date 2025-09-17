import { Trash2 } from 'lucide-react';
import SquadSummary from './SquadSummary';
import PlayerSearch from './PlayerSearch';
import FootballPitch from './FootballPitch';
import BenchDisplay from './BenchDisplay';
import BudgetDisplay from './BudgetDisplay';
import { EnrichedPlayer } from '../lib/types';

interface SquadFormProps {
  squadState: ReturnType<typeof import('../state/useSquad').useSquad>;
}

const SquadForm = ({ squadState }: SquadFormProps) => {
  const { 
    squad, 
    addPlayer, 
    removePlayer, 
    setBank, 
    clearSquad, 
    error,
    clearError
  } = squadState;
  
  const handleAddPlayer = (player: EnrichedPlayer, isStarting: boolean = true) => {
    addPlayer(player, isStarting);
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

      <PlayerSearch onAddPlayer={handleAddPlayer} />

      <BudgetDisplay squad={squad} onSetBank={setBank} />

      <FootballPitch startingXI={squad.startingXI} onRemovePlayer={removePlayer} />

      <BenchDisplay bench={squad.bench} onRemovePlayer={removePlayer} />
    </div>
  );
};

export default SquadForm;
