import { RotateCcw, Info } from 'lucide-react';

interface WeightsPanelProps {
  weightsState: ReturnType<typeof import('../state/useWeights').useWeights>;
}

const WeightsPanel = ({ weightsState }: WeightsPanelProps) => {
  const { 
    weights, 
    updateWeight, 
    resetToDefaults, 
    normalizeWeights,
    isLoading,
    error,
    clearError
  } = weightsState;

  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);

  const weightConfigs = [
    {
      key: 'form' as const,
      label: 'Form',
      description: 'Recent performance and consistency',
      color: 'bg-blue-500'
    },
    {
      key: 'xg90' as const,
      label: 'xG/90',
      description: 'Expected goals per 90 minutes',
      color: 'bg-green-500'
    },
    {
      key: 'xa90' as const,
      label: 'xA/90',
      description: 'Expected assists per 90 minutes',
      color: 'bg-purple-500'
    },
    {
      key: 'expMin' as const,
      label: 'Expected Minutes',
      description: 'Likelihood of playing time',
      color: 'bg-yellow-500'
    },
    {
      key: 'next3Ease' as const,
      label: 'Next 3 Fixtures',
      description: 'Difficulty of upcoming matches',
      color: 'bg-red-500'
    }
  ];

  return (
    <div className="card">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">Analysis Weights</h2>
        <div className="flex space-x-2">
          <button
            onClick={normalizeWeights}
            className="btn-secondary text-sm"
            title="Normalize weights to sum to 1"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={resetToDefaults}
            className="btn-secondary text-sm"
            disabled={isLoading}
          >
            Reset
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

      {/* Total Weight Display */}
      <div className="bg-gray-50 rounded-lg p-3 mb-4">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-gray-700">Total Weight:</span>
          <span className={`font-semibold ${Math.abs(totalWeight - 1) < 0.01 ? 'text-green-600' : 'text-orange-600'}`}>
            {totalWeight.toFixed(2)}
          </span>
        </div>
        {Math.abs(totalWeight - 1) > 0.01 && (
          <p className="text-xs text-orange-600 mt-1">
            Weights don't sum to 1.0 - consider normalizing.
          </p>
        )}
      </div>

      {/* Weight Sliders */}
      <div className="space-y-4">
        {weightConfigs.map((config) => (
          <div key={config.key} className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-gray-700">
                {config.label}
              </label>
              <span className="text-sm font-semibold text-fpl-dark">
                {(weights[config.key] * 100).toFixed(0)}%
              </span>
            </div>
            
            <div className="relative">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={weights[config.key]}
                onChange={(e) => updateWeight(config.key, parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                style={{
                  background: `linear-gradient(to right, ${config.color} 0%, ${config.color} ${weights[config.key] * 100}%, #e5e7eb ${weights[config.key] * 100}%, #e5e7eb 100%)`
                }}
              />
            </div>
            
            <p className="text-xs text-gray-500">{config.description}</p>
          </div>
        ))}
      </div>

      {/* Info Section */}
      <div className="mt-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start space-x-2">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">How weights work:</p>
            <ul className="text-xs space-y-1">
              <li>• Higher weights prioritize that metric in scoring</li>
              <li>• Weights are automatically saved to your browser</li>
              <li>• Use "Reset" to restore default values</li>
              <li>• Normalize ensures weights sum to 1.0</li>
            </ul>
          </div>
        </div>
      </div>

    </div>
  );
};

export default WeightsPanel;
