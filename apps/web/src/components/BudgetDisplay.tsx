import { formatPrice, calculateTotalSquadValue } from '../lib/format';
import { Squad } from '../lib/types';

interface BudgetDisplayProps {
  squad: Squad;
  onSetBank: (amount: number) => void;
}

const BudgetDisplay = ({ squad, onSetBank }: BudgetDisplayProps) => {
  const totalValue = calculateTotalSquadValue(squad);
  const remainingBudget = 100 - totalValue;
  const budgetUsed = (totalValue / 100) * 100;
  const isOverBudget = totalValue > 100;

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-blue-800">Budget Management</h3>
        <div className="text-sm text-blue-600">
          {budgetUsed.toFixed(1)}% used
        </div>
      </div>
      
      {/* Budget Bar */}
      <div className="mb-4">
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>Spent: {formatPrice(totalValue)}</span>
          <span className={isOverBudget ? 'text-orange-600' : ''}>
            {isOverBudget ? `Over budget: +${formatPrice(totalValue - 100)}` : `Remaining: ${formatPrice(remainingBudget)}`}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div 
            className={`h-3 rounded-full transition-all duration-300 ${
              isOverBudget ? 'bg-orange-500' :
              budgetUsed > 90 ? 'bg-red-500' : 
              budgetUsed > 75 ? 'bg-yellow-500' : 'bg-green-500'
            }`}
            style={{ width: `${Math.min(budgetUsed, 100)}%` }}
          ></div>
        </div>
      </div>
      
      {/* Bank Input */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Bank (Remaining Budget)
        </label>
        <div className="flex items-center space-x-2">
          <span className="text-gray-500 font-medium">£</span>
          <input
            type="number"
            value={Math.round(squad.bank * 10) / 10}
            onChange={(e) => onSetBank(parseFloat(e.target.value) || 0)}
            step="0.1"
            min="-50"
            max="100"
            className="input-field flex-1 text-center font-medium"
          />
          <span className="text-gray-500 font-medium">m</span>
        </div>
        <div className="text-xs text-gray-500 mt-1 text-center">
          Total squad value: {formatPrice(totalValue + squad.bank)}
          {squad.bank < 0 && (
            <div className="text-orange-600 mt-1">
              ⚠️ Squad value exceeds 100M (players increased in value)
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BudgetDisplay;
