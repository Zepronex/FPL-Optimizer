import { Trash2 } from 'lucide-react';
import SquadSummary from './SquadSummary';
import PlayerSearch from './PlayerSearch';
import SquadSlots from './SquadSlots';

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
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold">Squad Builder</h2>
        <div className="flex space-x-2">
          <button
            onClick={clearSquad}
            className="btn-danger text-sm"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Clear Squad
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

      {/* Bank Input */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Bank (Remaining Budget)
        </label>
        <div className="flex items-center space-x-2">
          <span className="text-gray-500">£</span>
          <input
            type="number"
            value={squad.bank}
            onChange={(e) => setBank(parseFloat(e.target.value) || 0)}
            step="0.1"
            min="0"
            max="100"
            className="input-field flex-1"
          />
          <span className="text-gray-500">m</span>
        </div>
      </div>

      <SquadSlots
        slots={Array.from({ length: 11 }, (_, index) => squad.startingXI[index] || null)}
        onRemovePlayer={removePlayer}
        title="Starting XI"
        className="mb-6"
      />

      <SquadSlots
        slots={Array.from({ length: 4 }, (_, index) => squad.bench[index] || null)}
        onRemovePlayer={removePlayer}
        title="Bench"
      />
    </div>
  );
};

export default SquadForm;
