import { formatPrice, calculateTotalSquadValue } from '../lib/format';
import { Squad } from '../lib/types';

interface BudgetDisplayProps {
  squad: Squad;
}

const BudgetDisplay = ({ squad }: BudgetDisplayProps) => {
  const totalSpent = calculateTotalSquadValue(squad) - squad.bank;
  const remainingBudget = 100 - totalSpent;
  const budgetUsed = (totalSpent / 100) * 100;
  const isOverBudget = remainingBudget < 0;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Budget</h3>
        <div className="text-sm text-gray-600">
          {budgetUsed.toFixed(1)}% used
        </div>
      </div>

      <div className="mb-4">
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>Spent: {formatPrice(totalSpent)}</span>
          <span>Remaining: {formatPrice(remainingBudget)}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all duration-300 ${
              isOverBudget ? 'bg-red-500' :
              budgetUsed > 90 ? 'bg-amber-500' : 'bg-gray-700'
            }`}
            style={{ width: `${Math.min(budgetUsed, 100)}%` }}
          ></div>
        </div>
      </div>

      {isOverBudget && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Squad is over the 100.0m budget.
        </div>
      )}
    </div>
  );
};

export default BudgetDisplay;
