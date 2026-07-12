import path from 'node:path';
import { Pool } from 'pg';
import { readNormalizedFplJson } from '../ingestion/localJson';
import { NormalizedFplDataset, NormalizedFplDatasetSchema } from '../ingestion/schemas';
import { Queryable, withTransaction } from './client';
import {
  FixtureRow,
  FplLoadPlan,
  GameweekRow,
  LoadedRecordCounts,
  PlayerRow,
  TeamRow,
  buildFplLoadPlan
} from './fplLoadPlan';

export type FplLoadResult = {
  ingestionRunId: number;
  snapshotHash: string;
  counts: LoadedRecordCounts;
};

export async function readNormalizedFplDataset(inputDir: string): Promise<NormalizedFplDataset> {
  const [manifest, players, teams, events, fixtures] = await Promise.all([
    readNormalizedFplJson(path.join(inputDir, 'manifest.json')),
    readNormalizedFplJson(path.join(inputDir, 'players.json')),
    readNormalizedFplJson(path.join(inputDir, 'teams.json')),
    readNormalizedFplJson(path.join(inputDir, 'events.json')),
    readNormalizedFplJson(path.join(inputDir, 'fixtures.json'))
  ]);

  return NormalizedFplDatasetSchema.parse({
    manifest,
    players,
    teams,
    events,
    fixtures
  });
}

export async function loadFplDataset(
  pool: Pool,
  dataset: NormalizedFplDataset
): Promise<FplLoadResult> {
  const plan = buildFplLoadPlan(dataset);
  return withTransaction(pool, client => loadFplLoadPlan(client, plan));
}

export async function loadFplLoadPlan(
  client: Queryable,
  plan: FplLoadPlan
): Promise<FplLoadResult> {
  const ingestionRunId = await upsertIngestionRun(client, plan);

  for (const team of plan.teams) {
    await upsertTeam(client, team, ingestionRunId);
  }

  for (const gameweek of plan.gameweeks) {
    await upsertGameweek(client, gameweek, ingestionRunId);
  }

  for (const player of plan.players) {
    await upsertPlayer(client, player, ingestionRunId);
  }

  for (const fixture of plan.fixtures) {
    await upsertFixture(client, fixture, ingestionRunId);
  }

  const counts = await readLoadedRecordCounts(client, ingestionRunId);
  assertLoadedCounts(plan.counts, counts);

  return {
    ingestionRunId,
    snapshotHash: plan.ingestionRun.snapshotHash,
    counts
  };
}

export async function readLoadedRecordCounts(
  client: Queryable,
  ingestionRunId: number
): Promise<LoadedRecordCounts> {
  const result = await client.query<{
    teams: string;
    players: string;
    gameweeks: string;
    fixtures: string;
  }>(
    `
      SELECT
        (SELECT count(*) FROM teams WHERE ingestion_run_id = $1) AS teams,
        (SELECT count(*) FROM players WHERE ingestion_run_id = $1) AS players,
        (SELECT count(*) FROM gameweeks WHERE ingestion_run_id = $1) AS gameweeks,
        (SELECT count(*) FROM fixtures WHERE ingestion_run_id = $1) AS fixtures
    `,
    [ingestionRunId]
  );

  const row = result.rows[0];
  return {
    teams: Number(row.teams),
    players: Number(row.players),
    gameweeks: Number(row.gameweeks),
    fixtures: Number(row.fixtures)
  };
}

async function upsertIngestionRun(client: Queryable, plan: FplLoadPlan): Promise<number> {
  const run = plan.ingestionRun;
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO ingestion_runs (
        snapshot_hash,
        schema_version,
        season,
        generated_at,
        current_event_id,
        sources,
        record_counts
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
      ON CONFLICT (snapshot_hash) DO UPDATE SET
        schema_version = EXCLUDED.schema_version,
        season = EXCLUDED.season,
        generated_at = EXCLUDED.generated_at,
        current_event_id = EXCLUDED.current_event_id,
        sources = EXCLUDED.sources,
        record_counts = EXCLUDED.record_counts,
        last_loaded_at = now()
      RETURNING id
    `,
    [
      run.snapshotHash,
      run.schemaVersion,
      run.season,
      run.generatedAt,
      run.currentEventId,
      JSON.stringify(run.sources),
      JSON.stringify(run.recordCounts)
    ]
  );

  return Number(result.rows[0].id);
}

async function upsertTeam(client: Queryable, team: TeamRow, ingestionRunId: number): Promise<void> {
  await client.query(
    `
      INSERT INTO teams (
        id,
        code,
        name,
        short_name,
        strength,
        strength_overall_home,
        strength_overall_away,
        ingestion_run_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
        code = EXCLUDED.code,
        name = EXCLUDED.name,
        short_name = EXCLUDED.short_name,
        strength = EXCLUDED.strength,
        strength_overall_home = EXCLUDED.strength_overall_home,
        strength_overall_away = EXCLUDED.strength_overall_away,
        ingestion_run_id = EXCLUDED.ingestion_run_id,
        updated_at = now()
    `,
    [
      team.id,
      team.code,
      team.name,
      team.shortName,
      team.strength,
      team.strengthOverallHome,
      team.strengthOverallAway,
      ingestionRunId
    ]
  );
}

async function upsertGameweek(
  client: Queryable,
  gameweek: GameweekRow,
  ingestionRunId: number
): Promise<void> {
  await client.query(
    `
      INSERT INTO gameweeks (
        id,
        name,
        deadline_time,
        average_entry_score,
        highest_score,
        finished,
        data_checked,
        is_current,
        is_next,
        ingestion_run_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        deadline_time = EXCLUDED.deadline_time,
        average_entry_score = EXCLUDED.average_entry_score,
        highest_score = EXCLUDED.highest_score,
        finished = EXCLUDED.finished,
        data_checked = EXCLUDED.data_checked,
        is_current = EXCLUDED.is_current,
        is_next = EXCLUDED.is_next,
        ingestion_run_id = EXCLUDED.ingestion_run_id,
        updated_at = now()
    `,
    [
      gameweek.id,
      gameweek.name,
      gameweek.deadlineTime,
      gameweek.averageEntryScore,
      gameweek.highestScore,
      gameweek.finished,
      gameweek.dataChecked,
      gameweek.isCurrent,
      gameweek.isNext,
      ingestionRunId
    ]
  );
}

async function upsertPlayer(client: Queryable, player: PlayerRow, ingestionRunId: number): Promise<void> {
  await client.query(
    `
      INSERT INTO players (
        id,
        code,
        first_name,
        second_name,
        web_name,
        display_name,
        team_id,
        position,
        now_cost,
        status,
        chance_of_playing_next_round,
        chance_of_playing_this_round,
        form,
        selected_by_percent,
        points_per_game,
        value_season,
        total_points,
        minutes,
        starts,
        expected_goals,
        expected_assists,
        expected_goal_involvements,
        expected_goals_conceded,
        ingestion_run_id
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24
      )
      ON CONFLICT (id) DO UPDATE SET
        code = EXCLUDED.code,
        first_name = EXCLUDED.first_name,
        second_name = EXCLUDED.second_name,
        web_name = EXCLUDED.web_name,
        display_name = EXCLUDED.display_name,
        team_id = EXCLUDED.team_id,
        position = EXCLUDED.position,
        now_cost = EXCLUDED.now_cost,
        status = EXCLUDED.status,
        chance_of_playing_next_round = EXCLUDED.chance_of_playing_next_round,
        chance_of_playing_this_round = EXCLUDED.chance_of_playing_this_round,
        form = EXCLUDED.form,
        selected_by_percent = EXCLUDED.selected_by_percent,
        points_per_game = EXCLUDED.points_per_game,
        value_season = EXCLUDED.value_season,
        total_points = EXCLUDED.total_points,
        minutes = EXCLUDED.minutes,
        starts = EXCLUDED.starts,
        expected_goals = EXCLUDED.expected_goals,
        expected_assists = EXCLUDED.expected_assists,
        expected_goal_involvements = EXCLUDED.expected_goal_involvements,
        expected_goals_conceded = EXCLUDED.expected_goals_conceded,
        ingestion_run_id = EXCLUDED.ingestion_run_id,
        updated_at = now()
    `,
    [
      player.id,
      player.code,
      player.firstName,
      player.secondName,
      player.webName,
      player.displayName,
      player.teamId,
      player.position,
      player.nowCost,
      player.status,
      player.chanceOfPlayingNextRound,
      player.chanceOfPlayingThisRound,
      player.form,
      player.selectedByPercent,
      player.pointsPerGame,
      player.valueSeason,
      player.totalPoints,
      player.minutes,
      player.starts,
      player.expectedGoals,
      player.expectedAssists,
      player.expectedGoalInvolvements,
      player.expectedGoalsConceded,
      ingestionRunId
    ]
  );
}

async function upsertFixture(
  client: Queryable,
  fixture: FixtureRow,
  ingestionRunId: number
): Promise<void> {
  await client.query(
    `
      INSERT INTO fixtures (
        id,
        code,
        event_id,
        kickoff_time,
        team_h_id,
        team_a_id,
        team_h_score,
        team_a_score,
        team_h_difficulty,
        team_a_difficulty,
        started,
        finished,
        ingestion_run_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (id) DO UPDATE SET
        code = EXCLUDED.code,
        event_id = EXCLUDED.event_id,
        kickoff_time = EXCLUDED.kickoff_time,
        team_h_id = EXCLUDED.team_h_id,
        team_a_id = EXCLUDED.team_a_id,
        team_h_score = EXCLUDED.team_h_score,
        team_a_score = EXCLUDED.team_a_score,
        team_h_difficulty = EXCLUDED.team_h_difficulty,
        team_a_difficulty = EXCLUDED.team_a_difficulty,
        started = EXCLUDED.started,
        finished = EXCLUDED.finished,
        ingestion_run_id = EXCLUDED.ingestion_run_id,
        updated_at = now()
    `,
    [
      fixture.id,
      fixture.code,
      fixture.eventId,
      fixture.kickoffTime,
      fixture.teamHId,
      fixture.teamAId,
      fixture.teamHScore,
      fixture.teamAScore,
      fixture.teamHDifficulty,
      fixture.teamADifficulty,
      fixture.started,
      fixture.finished,
      ingestionRunId
    ]
  );
}

function assertLoadedCounts(expected: LoadedRecordCounts, actual: LoadedRecordCounts): void {
  if (
    expected.players !== actual.players ||
    expected.teams !== actual.teams ||
    expected.gameweeks !== actual.gameweeks ||
    expected.fixtures !== actual.fixtures
  ) {
    throw new Error(
      `Loaded database counts do not match input: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`
    );
  }
}
