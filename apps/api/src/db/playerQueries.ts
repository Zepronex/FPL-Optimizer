import { Queryable } from './client';
import { EnrichedPlayer, FPLStatus, Pos } from '../types';

export const PLAYER_CANDIDATE_REQUIRED_COMMANDS = [
  'docker compose up -d postgres',
  'pnpm.cmd run db:migrate',
  'pnpm.cmd run ingest:fpl',
  'pnpm.cmd run db:load:fpl',
  'pnpm.cmd run ingest:fpl:history',
  'pnpm.cmd run pipeline:features',
  'pnpm.cmd run model:train',
  'pnpm.cmd run model:backtest',
  'pnpm.cmd run model:predict',
  'pnpm.cmd run db:load:predictions'
];

type PlayerCandidateDbRow = {
  id: number;
  display_name: string;
  team_id: number;
  team_short: string;
  position: Pos;
  now_cost: number;
  form: number;
  status: FPLStatus;
  expected_goals: number;
  expected_assists: number;
  minutes: number;
  starts: number;
  points_per_game: number;
  value_season: number;
  selected_by_percent: number;
  next_3_ease: number;
};

export async function readSquadBuilderPlayers(client: Queryable): Promise<EnrichedPlayer[]> {
  const result = await client.query<PlayerCandidateDbRow>(`
    WITH latest_prediction_run AS (
      SELECT id
      FROM prediction_runs
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    ),
    current_gameweek AS (
      SELECT COALESCE(
        (SELECT id FROM gameweeks WHERE is_current = true ORDER BY id DESC LIMIT 1),
        (SELECT id FROM gameweeks WHERE is_next = true ORDER BY id ASC LIMIT 1),
        (SELECT id FROM gameweeks WHERE finished = false ORDER BY id ASC LIMIT 1),
        (SELECT max(id) FROM gameweeks)
      ) AS id
    ),
    latest_prediction_players AS (
      SELECT DISTINCT pp.player_id
      FROM player_predictions pp
      JOIN latest_prediction_run lpr ON lpr.id = pp.prediction_run_id
    )
    SELECT
      p.id,
      p.display_name,
      p.team_id,
      t.short_name AS team_short,
      p.position,
      p.now_cost::float8 AS now_cost,
      p.form::float8 AS form,
      p.status,
      p.expected_goals::float8 AS expected_goals,
      p.expected_assists::float8 AS expected_assists,
      p.minutes,
      p.starts,
      p.points_per_game::float8 AS points_per_game,
      p.value_season::float8 AS value_season,
      p.selected_by_percent::float8 AS selected_by_percent,
      COALESCE((
        SELECT avg(upcoming.difficulty)::float8
        FROM (
          SELECT
            CASE
              WHEN f.team_h_id = p.team_id THEN f.team_h_difficulty
              ELSE f.team_a_difficulty
            END AS difficulty
          FROM fixtures f
          CROSS JOIN current_gameweek cg
          WHERE
            (f.team_h_id = p.team_id OR f.team_a_id = p.team_id)
            AND (cg.id IS NULL OR f.event_id >= cg.id)
          ORDER BY f.event_id ASC NULLS LAST, f.kickoff_time ASC NULLS LAST, f.id ASC
          LIMIT 3
        ) upcoming
      ), 0)::float8 AS next_3_ease
    FROM latest_prediction_players lpp
    JOIN players p ON p.id = lpp.player_id
    JOIN teams t ON t.id = p.team_id
    ORDER BY p.display_name ASC, p.id ASC
  `);

  return result.rows.map(toEnrichedPlayer);
}

export function searchEnrichedPlayers(
  players: readonly EnrichedPlayer[],
  query: string,
  limit = 10
): EnrichedPlayer[] {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length === 0) return [];

  return players
    .map(player => ({
      player,
      score: scorePlayerSearch(normalizedQuery, normalizeSearchText(player.name))
    }))
    .filter(result => result.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.player.name.localeCompare(right.player.name);
    })
    .slice(0, limit)
    .map(result => result.player);
}

function toEnrichedPlayer(row: PlayerCandidateDbRow): EnrichedPlayer {
  return {
    id: Number(row.id),
    name: row.display_name,
    teamId: Number(row.team_id),
    teamShort: row.team_short,
    pos: row.position,
    price: toNumber(row.now_cost),
    form: toNumber(row.form),
    status: row.status,
    xg90: per90(toNumber(row.expected_goals), Number(row.minutes)),
    xa90: per90(toNumber(row.expected_assists), Number(row.minutes)),
    expMin: averageMinutesPerStart(Number(row.minutes), Number(row.starts)),
    next3Ease: toNumber(row.next_3_ease),
    avgPoints: toNumber(row.points_per_game),
    value: toNumber(row.value_season),
    ownership: toNumber(row.selected_by_percent)
  };
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ');
}

function scorePlayerSearch(query: string, playerName: string): number {
  if (playerName === query) return 100;
  if (playerName.startsWith(query)) return 90;
  if (playerName.includes(query)) return 80;

  const queryWords = query.split(' ').filter(word => word.length >= 2);
  if (queryWords.length === 0) return 0;

  const playerWords = playerName.split(' ');
  const matchedWords = queryWords.filter(queryWord =>
    playerWords.some(playerWord => playerWord.startsWith(queryWord) || playerWord.includes(queryWord))
  );

  return matchedWords.length > 0
    ? (matchedWords.length / queryWords.length) * 60
    : 0;
}

function toNumber(value: number | string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function per90(value: number, minutes: number): number {
  if (minutes <= 0) return 0;
  return Math.round((value / minutes) * 90 * 100) / 100;
}

function averageMinutesPerStart(minutes: number, starts: number): number {
  if (starts <= 0) return 0;
  return Math.min(90, Math.round((minutes / starts) * 100) / 100);
}
