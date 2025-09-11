import { RotateCcw, Info, Settings } from 'lucide-react';

interface WeightsPanelProps {
  weightsState: ReturnType<typeof import('../state/useWeights').useWeights>;
}

const WeightsPanel = ({ weightsState }: WeightsPanelProps) => {
  const { 
    weights, 
    presets,
    updateWeight, 
    resetToDefaults, 
    normalizeWeights,
    applyPreset,
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
    },
    {
      key: 'avgPoints' as const,
      label: 'Avg Points',
      description: 'Historical FPL points per game',
      color: 'bg-indigo-500'
    },
    {
      key: 'value' as const,
      label: 'Value',
      description: 'Points per million (cost efficiency)',
      color: 'bg-emerald-500'
    },
    {
      key: 'ownership' as const,
      label: 'Ownership',
      description: 'Popularity among FPL managers',
      color: 'bg-pink-500'
    }
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Analysis Weights</h2>
          <p className="text-sm text-gray-600 mt-1">Configure how players are scored</p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={normalizeWeights}
            className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 transition-colors"
            title="Normalize weights to sum to 1"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={resetToDefaults}
            className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50"
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

      {/* Preset Selector */}
      {presets.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center space-x-2 mb-3">
            <Settings className="w-4 h-4 text-gray-600" />
            <h3 className="text-sm font-semibold text-gray-800">Quick Presets</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {presets.map((preset) => (
              <button
                key={preset.name}
                onClick={() => applyPreset(preset)}
                className="text-left p-4 bg-white hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md"
              >
                <div className="font-semibold text-sm text-gray-800 mb-1">{preset.name}</div>
                <div className="text-xs text-gray-600 leading-relaxed">{preset.description}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Total Weight Display */}
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg p-4 mb-6 border border-gray-200">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-gray-700">Total Weight:</span>
          <span className={`font-bold text-lg ${Math.abs(totalWeight - 1) < 0.01 ? 'text-green-600' : 'text-orange-600'}`}>
            {totalWeight.toFixed(2)}
          </span>
        </div>
        {Math.abs(totalWeight - 1) > 0.01 && (
          <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded text-xs text-orange-700">
            ⚠️ Weights don't sum to 1.0 - consider normalizing for consistent scoring
          </div>
        )}
      </div>

      {/* Weight Sliders */}
      <div className="space-y-6">
        {weightConfigs.map((config) => (
          <div key={config.key} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div className="flex justify-between items-center mb-3">
              <div>
                <label className="text-sm font-semibold text-gray-800">
                  {config.label}
                </label>
                <p className="text-xs text-gray-600 mt-1">{config.description}</p>
              </div>
              <div className="text-right">
                <span className="text-lg font-bold text-gray-800">
                  {(weights[config.key] * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            
            <div className="relative">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={weights[config.key]}
                onChange={(e) => updateWeight(config.key, parseFloat(e.target.value))}
                className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                style={{
                  background: `linear-gradient(to right, ${config.color} 0%, ${config.color} ${weights[config.key] * 100}%, #e5e7eb ${weights[config.key] * 100}%, #e5e7eb 100%)`
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Info Section */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start space-x-3">
          <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-2">How weights work:</p>
            <ul className="text-xs space-y-1.5">
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">•</span>
                Higher weights prioritize that metric in player scoring
              </li>
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">•</span>
                Weights are automatically saved to your browser
              </li>
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">•</span>
                Use "Reset" to restore default values
              </li>
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">•</span>
                Normalize ensures weights sum to 1.0 for consistent scoring
              </li>
            </ul>
          </div>
        </div>
      </div>

    </div>
  );
};

export default WeightsPanel;
