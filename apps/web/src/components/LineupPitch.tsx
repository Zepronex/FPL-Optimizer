import { memo } from 'react';
import { X } from 'lucide-react';
import { formatPrice, formatScore } from '../lib/format';
import { groupPlayersByPosition } from '../lib/analysisDisplay';
import { Pos } from '../lib/types';

export type LineupPlayer = {
  id: number;
  name: string;
  position: Pos;
  teamShort?: string;
  price?: number;
  rawExpectedPoints?: number | null;
  contextualScoreOutOf10?: number | null;
  captainMarker?: 'C' | 'VC';
  availability?: string;
};

type LineupPitchProps = {
  starters: readonly LineupPlayer[];
  bench?: readonly LineupPlayer[];
  formation?: string;
  title?: string;
  subtitle?: string;
  onRemovePlayer?: (playerId: number) => void;
  showPrices?: boolean;
};

const POSITION_LABELS: Record<Pos, string> = {
  GK: 'Goalkeeper',
  DEF: 'Defenders',
  MID: 'Midfielders',
  FWD: 'Forwards'
};

const POSITION_ORDER: Pos[] = ['GK', 'DEF', 'MID', 'FWD'];

const LineupPitch = ({
  starters,
  bench = [],
  formation,
  title = 'Recommended Starting XI',
  subtitle,
  onRemovePlayer,
  showPrices = false
}: LineupPitchProps) => {
  const groupedPlayers = groupPlayersByPosition(starters);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-fpl-dark">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-gray-600">{subtitle}</p>}
        </div>
        {formation && (
          <span className="w-fit rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-gray-800">
            {formation}
          </span>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 sm:p-4">
        <div className="space-y-4">
          {POSITION_ORDER.map(position => (
            <PitchRow
              key={position}
              label={POSITION_LABELS[position]}
              players={groupedPlayers[position]}
              position={position}
              onRemovePlayer={onRemovePlayer}
              showPrices={showPrices}
            />
          ))}
        </div>
      </div>

      {bench.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Bench</h3>
            <span className="text-xs text-gray-500">{bench.length} players</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {bench.map((player, index) => (
              <BenchCard
                key={`${player.id}-${index}`}
                player={player}
                index={index}
                showPrices={showPrices}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

type PitchRowProps = {
  label: string;
  players: readonly LineupPlayer[];
  position: Pos;
  onRemovePlayer?: (playerId: number) => void;
  showPrices: boolean;
};

const PitchRow = ({ label, players, position, onRemovePlayer, showPrices }: PitchRowProps) => (
  <div>
    <div className="mb-2 text-center text-xs font-semibold uppercase text-gray-500">{label}</div>
    <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
      {players.length > 0 ? (
        players.map(player => (
          <PlayerCard
            key={player.id}
            player={player}
            onRemovePlayer={onRemovePlayer}
            showPrices={showPrices}
          />
        ))
      ) : (
        <EmptySlot position={position} />
      )}
    </div>
  </div>
);

type PlayerCardProps = {
  player: LineupPlayer;
  onRemovePlayer?: (playerId: number) => void;
  showPrices: boolean;
};

const PlayerCard = ({ player, onRemovePlayer, showPrices }: PlayerCardProps) => (
  <div className="group relative flex h-[92px] w-24 flex-col justify-between rounded-lg border border-slate-200 bg-white p-2 text-center shadow-sm sm:w-28">
    <div className="flex items-center justify-between gap-1">
      <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-semibold text-gray-700">
        {player.position}
      </span>
      {player.captainMarker && (
        <span className="rounded border border-green-200 bg-green-50 px-1.5 py-0.5 text-[11px] font-semibold text-green-800">
          {player.captainMarker}
        </span>
      )}
    </div>
    <div className="min-w-0">
      <div className="truncate text-xs font-semibold text-gray-950" title={player.name}>
        {player.name}
      </div>
      <div className="truncate text-[11px] text-gray-500">
        {player.teamShort || 'Team n/a'}
      </div>
    </div>
    <PlayerScore player={player} showPrices={showPrices} />
    {onRemovePlayer && (
      <button
        type="button"
        aria-label={`Remove ${player.name}`}
        onClick={() => onRemovePlayer(player.id)}
        className="absolute -right-1 -top-1 hidden h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-white text-red-600 shadow-sm hover:bg-red-50 group-hover:flex"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    )}
  </div>
);

const PlayerScore = ({ player, showPrices }: { player: LineupPlayer; showPrices: boolean }) => {
  if (typeof player.contextualScoreOutOf10 === 'number') {
    return (
      <div className="text-[11px] text-gray-600">
        <span className="font-semibold text-gray-900">{formatScore(player.contextualScoreOutOf10)}/10</span>
        {typeof player.rawExpectedPoints === 'number' && (
          <span className="block text-gray-500">{formatScore(player.rawExpectedPoints)} xPts</span>
        )}
      </div>
    );
  }

  if (typeof player.rawExpectedPoints === 'number') {
    return <div className="text-[11px] font-semibold text-gray-700">{formatScore(player.rawExpectedPoints)} xPts</div>;
  }

  if (showPrices && typeof player.price === 'number') {
    return <div className="text-[11px] text-gray-500">{formatPrice(player.price)}</div>;
  }

  return <div className="text-[11px] text-gray-400">Score n/a</div>;
};

const EmptySlot = ({ position }: { position: Pos }) => (
  <div className="flex h-[92px] w-24 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-center text-xs text-gray-400 sm:w-28">
    {position}
  </div>
);

const BenchCard = ({ player, index, showPrices }: { player: LineupPlayer; index: number; showPrices: boolean }) => (
  <div className="flex min-h-[70px] items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold text-gray-700">
      {index + 1}
    </span>
    <div className="min-w-0 flex-1">
      <div className="truncate text-sm font-semibold text-gray-950" title={player.name}>{player.name}</div>
      <div className="text-xs text-gray-500">{player.position} - {player.teamShort || 'Team n/a'}</div>
    </div>
    <PlayerScore player={player} showPrices={showPrices} />
  </div>
);

export default memo(LineupPitch);
