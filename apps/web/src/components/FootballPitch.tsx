import { memo } from 'react';
import { getFormationString } from '../lib/format';
import { SquadSlot } from '../lib/types';
import LineupPitch, { LineupPlayer } from './LineupPitch';

interface FootballPitchProps {
  startingXI: (SquadSlot | null)[];
  onRemovePlayer?: (playerId: number) => void;
  isReadOnly?: boolean;
}

const FootballPitch = ({ startingXI, onRemovePlayer, isReadOnly = false }: FootballPitchProps) => {
  const starters = startingXI.filter(isSquadSlot);
  const formation = starters.length === 11
    ? getFormationString(starters.map(slot => ({ pos: slot.pos })))
    : undefined;

  return (
    <LineupPitch
      title="Starting XI Formation"
      starters={starters.map(toLineupPlayer)}
      formation={formation === 'Invalid' ? undefined : formation}
      onRemovePlayer={isReadOnly ? undefined : onRemovePlayer}
      showPrices
    />
  );
};

const isSquadSlot = (slot: SquadSlot | null): slot is SquadSlot => slot !== null;

const toLineupPlayer = (slot: SquadSlot): LineupPlayer => ({
  id: slot.id,
  name: slot.name || `Player ${slot.id}`,
  position: slot.pos,
  teamShort: slot.teamShort,
  price: slot.price
});

export default memo(FootballPitch);
