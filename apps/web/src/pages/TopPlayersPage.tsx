import { useEffect, useMemo, useState } from 'react';
import { BarChart3, RefreshCw, Shield, Target, TrendingUp, Zap } from 'lucide-react';
import { apiClient } from '../lib/api';
import { Pos, PredictionRow, PredictionSummary } from '../lib/types';
import { formatPrice, formatScore, getPositionColor } from '../lib/format';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

const POSITION_LABELS: Record<Pos, string> = {
  GK: 'Goalkeepers',
  DEF: 'Defenders',
  MID: 'Midfielders',
  FWD: 'Forwards'
};

const POSITION_ICONS: Record<Pos, JSX.Element> = {
  GK: <Shield className="w-5 h-5" />,
  DEF: <Target className="w-5 h-5" />,
  MID: <Zap className="w-5 h-5" />,
  FWD: <TrendingUp className="w-5 h-5" />
};

const POSITIONS: Pos[] = ['GK', 'DEF', 'MID', 'FWD'];

const POSITION_ACCENTS: Record<Pos, string> = {
  GK: 'border-t-fpl-green',
  DEF: 'border-t-blue-600',
  MID: 'border-t-amber-600',
  FWD: 'border-t-red-600'
};

const TopPlayersPage = () => {
  const [summary, setSummary] = useState<PredictionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requiredCommands, setRequiredCommands] = useState<string[]>([]);
  const [selectedPosition, setSelectedPosition] = useState<Pos | 'all'>('all');

  const fetchTopPlayers = async () => {
    setLoading(true);
    setError(null);
    setRequiredCommands([]);

    const response = await apiClient.getTopPredictions(100);

    if (!response.success || !response.data) {
      setSummary(null);
      setError(response.error || 'Could not load prediction-backed top players.');
      setRequiredCommands(response.requiredCommands || []);
      setLoading(false);
      return;
    }

    setSummary(response.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchTopPlayers();
  }, []);

  const groupedPlayers = useMemo(() => {
    const groups: Record<Pos, PredictionRow[]> = {
      GK: [],
      DEF: [],
      MID: [],
      FWD: []
    };

    for (const player of summary?.predictions ?? []) {
      groups[player.position].push(player);
    }

    return groups;
  }, [summary]);

  const filteredPlayers = selectedPosition === 'all'
    ? [...(summary?.predictions ?? [])].sort(comparePredictions)
    : groupedPlayers[selectedPosition];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner size="lg" text="Loading top predicted players..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-2xl">
          <ErrorMessage
            message={error}
            action={{
              label: 'Retry',
              onClick: fetchTopPlayers
            }}
          />
          {requiredCommands.length > 0 && (
            <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-sm font-medium text-gray-800">Run the local prediction pipeline:</p>
              <pre className="mt-3 overflow-x-auto rounded-md bg-gray-50 p-3 text-xs text-gray-800">
                {requiredCommands.join('\n')}
              </pre>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 border-b border-teal-100 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-gray-900">
            <BarChart3 className="h-8 w-8 text-fpl-green" />
            Top Players
          </h1>
          <p className="mt-2 max-w-3xl text-gray-600">
            Highest expected-points projections from the latest PostgreSQL prediction run.
          </p>
        </div>
        <button
          onClick={fetchTopPlayers}
          className="btn-primary flex items-center justify-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {summary && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <MetricCard label="Prediction Run" value={`#${summary.run.id}`} accentClass="border-t-fpl-green" valueClass="text-teal-700" />
          <MetricCard label="Target Gameweek" value={String(summary.run.targetGameweekId)} accentClass="border-t-blue-600" valueClass="text-blue-700" />
          <MetricCard label="Players Loaded" value={String(summary.run.predictionCount)} accentClass="border-t-amber-600" valueClass="text-amber-700" />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <FilterButton active={selectedPosition === 'all'} onClick={() => setSelectedPosition('all')}>
          All Players
        </FilterButton>
        {POSITIONS.map(position => (
          <FilterButton
            key={position}
            active={selectedPosition === position}
            onClick={() => setSelectedPosition(position)}
          >
            <span className="flex items-center gap-2">
              {POSITION_ICONS[position]}
              {POSITION_LABELS[position]}
            </span>
          </FilterButton>
        ))}
      </div>

      {selectedPosition === 'all' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {POSITIONS.map(position => (
            <PositionPanel
              key={position}
              position={position}
              players={groupedPlayers[position].slice(0, 5)}
            />
          ))}
        </div>
      ) : (
        <div className="card">
          <h2 className="mb-4 text-xl font-semibold text-gray-900">{POSITION_LABELS[selectedPosition]}</h2>
          <PlayerList players={filteredPlayers} />
        </div>
      )}
    </div>
  );
};

const MetricCard = ({
  label,
  value,
  accentClass,
  valueClass
}: {
  label: string;
  value: string;
  accentClass: string;
  valueClass: string;
}) => (
  <div className={`rounded-lg border border-gray-200 border-t-4 bg-white p-5 ${accentClass}`}>
    <p className="text-sm font-medium text-gray-600">{label}</p>
    <p className={`mt-2 text-2xl font-semibold ${valueClass}`}>{value}</p>
  </div>
);

const FilterButton = ({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
      active
        ? 'border-fpl-green bg-fpl-green text-white'
        : 'border-gray-200 bg-white text-gray-700 hover:bg-teal-50 hover:text-fpl-green'
    }`}
  >
    {children}
  </button>
);

const PositionPanel = ({ position, players }: { position: Pos; players: PredictionRow[] }) => (
  <div className={`card border-t-4 ${POSITION_ACCENTS[position]}`}>
    <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
      {POSITION_ICONS[position]}
      Top {POSITION_LABELS[position]}
    </h2>
    <PlayerList players={players} />
  </div>
);

const PlayerList = ({ players }: { players: PredictionRow[] }) => {
  if (players.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        No prediction rows are available for this position.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {players.map((player, index) => (
        <div
          key={`${player.playerId}-${player.fixtureId ?? 'season'}`}
          className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-700">
              {index + 1}
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium text-gray-900">{player.playerName}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-600">
                <span className={`badge ${getPositionColor(player.position)}`}>{player.position}</span>
                <span>{player.teamShortName}</span>
                <span>{formatPrice(player.price)}</span>
              </div>
            </div>
          </div>
          <div className="ml-4 text-right">
            <p className="text-lg font-semibold text-gray-900">{formatScore(player.predictedPoints)} pts</p>
            {player.confidence !== null && (
              <p className="text-xs text-gray-500">{Math.round(player.confidence * 100)}% confidence</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

function comparePredictions(left: PredictionRow, right: PredictionRow): number {
  if (right.predictedPoints !== left.predictedPoints) {
    return right.predictedPoints - left.predictedPoints;
  }

  return left.playerName.localeCompare(right.playerName);
}

export default TopPlayersPage;
