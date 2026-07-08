import { formatPrice, getFormationString, calculateTotalSquadValue } from '../lib/format';
import { Squad } from '../lib/types';
import { memo } from 'react';

interface SquadSummaryProps {
  squad: Squad;
}

const SquadSummary = ({ squad }: SquadSummaryProps) => {
  // Calculate actual spent amount (total value minus bank)
  const totalSpent = calculateTotalSquadValue(squad) - squad.bank;
  const formation = getFormationString(squad.startingXI.map(slot => ({ pos: slot.pos })));

  return (
    <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6">
      <div className="text-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Squad Overview</h3>
      </div>
      <div className="grid grid-cols-2 gap-4 text-center">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="text-2xl font-bold text-gray-900">
            {squad.startingXI.length}/11
          </div>
          <div className="text-sm text-gray-600">Starting XI</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="text-2xl font-bold text-gray-900">
            {squad.bench.length}/4
          </div>
          <div className="text-sm text-gray-600">Bench</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="text-2xl font-bold text-gray-900">
            {formation}
          </div>
          <div className="text-sm text-gray-600">Formation</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="text-2xl font-bold text-gray-900">
            {formatPrice(totalSpent)}
          </div>
          <div className="text-sm text-gray-600">Total Spent</div>
        </div>
      </div>
    </div>
  );
};

export default memo(SquadSummary);
