import { formatPrice, getFormationString, calculateTotalSquadValue } from '../lib/format';
import { Squad } from '../lib/types';
import { memo } from 'react';

interface SquadSummaryProps {
  squad: Squad;
}

const summaryTiles = [
  {
    label: 'Starting XI',
    valueClass: 'text-teal-700',
    cardClass: 'border-t-fpl-green bg-teal-50'
  },
  {
    label: 'Bench',
    valueClass: 'text-blue-700',
    cardClass: 'border-t-blue-600 bg-blue-50'
  },
  {
    label: 'Formation',
    valueClass: 'text-amber-700',
    cardClass: 'border-t-amber-600 bg-amber-50'
  },
  {
    label: 'Total Spent',
    valueClass: 'text-sky-700',
    cardClass: 'border-t-sky-700 bg-sky-50'
  }
];

const SquadSummary = ({ squad }: SquadSummaryProps) => {
  // Calculate actual spent amount (total value minus bank)
  const totalSpent = calculateTotalSquadValue(squad) - squad.bank;
  const formation = getFormationString(squad.startingXI.map(slot => ({ pos: slot.pos })));

  return (
    <div className="mb-6 rounded-lg border border-teal-100 bg-white p-6">
      <div className="text-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Squad Overview</h3>
      </div>
      <div className="grid grid-cols-2 gap-4 text-center">
        <div className={`rounded-lg border border-gray-200 border-t-4 p-4 ${summaryTiles[0].cardClass}`}>
          <div className={`text-2xl font-bold ${summaryTiles[0].valueClass}`}>
            {squad.startingXI.length}/11
          </div>
          <div className="text-sm text-gray-600">Starting XI</div>
        </div>
        <div className={`rounded-lg border border-gray-200 border-t-4 p-4 ${summaryTiles[1].cardClass}`}>
          <div className={`text-2xl font-bold ${summaryTiles[1].valueClass}`}>
            {squad.bench.length}/4
          </div>
          <div className="text-sm text-gray-600">Bench</div>
        </div>
        <div className={`rounded-lg border border-gray-200 border-t-4 p-4 ${summaryTiles[2].cardClass}`}>
          <div className={`text-2xl font-bold ${summaryTiles[2].valueClass}`}>
            {formation}
          </div>
          <div className="text-sm text-gray-600">Formation</div>
        </div>
        <div className={`rounded-lg border border-gray-200 border-t-4 p-4 ${summaryTiles[3].cardClass}`}>
          <div className={`text-2xl font-bold ${summaryTiles[3].valueClass}`}>
            {formatPrice(totalSpent)}
          </div>
          <div className="text-sm text-gray-600">Total Spent</div>
        </div>
      </div>
    </div>
  );
};

export default memo(SquadSummary);
