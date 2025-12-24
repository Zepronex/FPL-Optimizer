import { useState } from 'react';
import { apiClient } from '../lib/api';
import type { useSquad } from '../state/useSquad';
import type { OptimizeResponse } from '../lib/types';
import LoadingSpinner from '../components/LoadingSpinner';

interface OptimizeTransfersPageProps {
  squadState: ReturnType<typeof useSquad>;
}

const defaultSettings = {
  free_transfers: 1,
  bank: 0,
  horizon: 3,
  allow_hits: true,
  max_extra_transfers: 2,
};

const OptimizeTransfersPage = ({ squadState }: OptimizeTransfersPageProps) => {
  const { squad } = squadState;
  const [settings, setSettings] = useState(defaultSettings);
  const [result, setResult] = useState<OptimizeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (key: keyof typeof settings, value: number | boolean) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleOptimize = async () => {
    setError(null);
    setIsLoading(true);
    setResult(null);

    try {
      const payload = {
        squad_player_ids: [...squad.startingXI, ...squad.bench].map(p => p.id),
        bank: squad.bank,
        free_transfers: settings.free_transfers,
        horizon: settings.horizon,
        allow_hits: settings.allow_hits,
        max_extra_transfers: settings.max_extra_transfers,
      };

      const response = await apiClient.optimizeTransfers(payload);
      setResult(response);
    } catch (err) {
      setError('Failed to optimize transfers. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="text-2xl font-semibold text-fpl-dark mb-2">Optimize Transfers</h1>
        <p className="text-gray-600">
          Send your current squad to the ML optimizer to get the best transfer plan for the next few gameweeks.
        </p>
      </div>

      <div className="card space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <label className="flex flex-col space-y-1">
            <span className="text-sm font-medium text-gray-700">Free Transfers</span>
            <input
              type="number"
              min={0}
              value={settings.free_transfers}
              onChange={e => handleChange('free_transfers', Number(e.target.value))}
              className="input"
            />
          </label>
          <label className="flex flex-col space-y-1">
            <span className="text-sm font-medium text-gray-700">Bank (£m)</span>
            <input
              type="number"
              min={0}
              step={0.1}
              value={settings.bank}
              onChange={e => handleChange('bank', Number(e.target.value))}
              className="input"
            />
          </label>
          <label className="flex flex-col space-y-1">
            <span className="text-sm font-medium text-gray-700">Horizon (GWs)</span>
            <select
              value={settings.horizon}
              onChange={e => handleChange('horizon', Number(e.target.value))}
              className="input"
            >
              {[3, 4, 5].map(h => (
                <option key={h} value={h}>{h} weeks</option>
              ))}
            </select>
          </label>
          <label className="flex items-center space-x-3 mt-6">
            <input
              type="checkbox"
              checked={settings.allow_hits}
              onChange={e => handleChange('allow_hits', e.target.checked)}
            />
            <span className="text-sm text-gray-700">Allow hits (max extra transfers {settings.max_extra_transfers})</span>
          </label>
          <label className="flex flex-col space-y-1">
            <span className="text-sm font-medium text-gray-700">Max Extra Transfers</span>
            <input
              type="number"
              min={0}
              max={5}
              value={settings.max_extra_transfers}
              onChange={e => handleChange('max_extra_transfers', Number(e.target.value))}
              className="input"
            />
          </label>
        </div>

        <button onClick={handleOptimize} className="btn-primary w-full md:w-auto" disabled={isLoading}>
          {isLoading ? 'Optimizing...' : 'Optimize Transfers'}
        </button>

        {error && <div className="text-red-600 text-sm">{error}</div>}
      </div>

      {isLoading && (
        <div className="flex justify-center">
          <LoadingSpinner text="Calculating best moves..." />
        </div>
      )}

      {result && (
        <div className="card space-y-4">
          <h2 className="text-xl font-semibold">Recommended Transfers</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-lg font-medium text-red-600 mb-2">Out</h3>
              <ul className="space-y-2">
                {result.transfers_out.map(player => (
                  <li key={player.player_id} className="flex justify-between bg-red-50 border border-red-100 p-2 rounded">
                    <span>{player.name}</span>
                    <span className="text-sm text-gray-600">£{player.price.toFixed(1)}m</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-medium text-green-600 mb-2">In</h3>
              <ul className="space-y-2">
                {result.transfers_in.map(player => (
                  <li key={player.player_id} className="flex justify-between bg-green-50 border border-green-100 p-2 rounded">
                    <span>{player.name}</span>
                    <span className="text-sm text-gray-600">£{player.price.toFixed(1)}m</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded border border-gray-200">
            <p className="text-gray-800 font-medium">Projected Points (next {result.projected_points.horizon} GWs)</p>
            <p className="text-sm text-gray-600">Before: {result.projected_points.before.toFixed(2)} | After: {result.projected_points.after.toFixed(2)}</p>
            <p className="text-sm text-gray-600">Delta: {result.projected_points.delta.toFixed(2)} | Hit cost: {result.projected_points.hit_cost}</p>
          </div>

          {result.starting_xi_next_gw && (
            <div>
              <h3 className="text-lg font-medium">Suggested XI (next GW)</h3>
              <p className="text-sm text-gray-600">
                {result.starting_xi_next_gw.join(', ')}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default OptimizeTransfersPage;
