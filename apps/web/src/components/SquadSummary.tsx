import { formatPrice, getFormationString, calculateTotalSquadValue } from '../lib/format';
import { Squad } from '../lib/types';

interface SquadSummaryProps {
  squad: Squad;
}

const SquadSummary = ({ squad }: SquadSummaryProps) => {
  const totalValue = calculateTotalSquadValue(squad);
  const formation = getFormationString(squad.startingXI.map(slot => ({ pos: slot.pos })));

  return (
    <div className="bg-gray-50 rounded-lg p-4 mb-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
        <div>
          <div className="text-2xl font-bold text-fpl-dark">
            {squad.startingXI.length}/11
          </div>
          <div className="text-sm text-gray-600">Starting XI</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-fpl-dark">
            {squad.bench.length}/4
          </div>
          <div className="text-sm text-gray-600">Bench</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-fpl-dark">
            {formation}
          </div>
          <div className="text-sm text-gray-600">Formation</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-fpl-dark">
            {formatPrice(totalValue)}
          </div>
          <div className="text-sm text-gray-600">Total Value</div>
        </div>
      </div>
    </div>
  );
};

export default SquadSummary;
