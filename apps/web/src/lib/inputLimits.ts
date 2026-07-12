export const PLAYER_SEARCH_MAX_LENGTH = 100;
export const MAX_PLAYER_ID = 1_000_000;

export function parsePlayerId(value: string | undefined): number | null {
  if (!value || !/^[1-9]\d{0,9}$/.test(value)) return null;

  const playerId = Number(value);
  return Number.isSafeInteger(playerId) && playerId <= MAX_PLAYER_ID
    ? playerId
    : null;
}
