CREATE TABLE IF NOT EXISTS ingestion_runs (
  id BIGSERIAL PRIMARY KEY,
  snapshot_hash TEXT NOT NULL UNIQUE,
  schema_version INTEGER NOT NULL,
  season TEXT,
  generated_at TIMESTAMPTZ NOT NULL,
  current_event_id INTEGER,
  sources JSONB NOT NULL,
  record_counts JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_loaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY,
  code INTEGER,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  strength INTEGER,
  strength_overall_home INTEGER,
  strength_overall_away INTEGER,
  ingestion_run_id BIGINT NOT NULL REFERENCES ingestion_runs(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gameweeks (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  deadline_time TIMESTAMPTZ NOT NULL,
  average_entry_score NUMERIC(8,2),
  highest_score NUMERIC(8,2),
  finished BOOLEAN NOT NULL,
  data_checked BOOLEAN NOT NULL,
  is_current BOOLEAN NOT NULL,
  is_next BOOLEAN NOT NULL,
  ingestion_run_id BIGINT NOT NULL REFERENCES ingestion_runs(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY,
  code INTEGER,
  first_name TEXT NOT NULL,
  second_name TEXT NOT NULL,
  web_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  position TEXT NOT NULL CHECK (position IN ('GK', 'DEF', 'MID', 'FWD')),
  now_cost NUMERIC(5,1) NOT NULL CHECK (now_cost >= 0),
  status TEXT NOT NULL,
  chance_of_playing_next_round INTEGER CHECK (
    chance_of_playing_next_round IS NULL
    OR chance_of_playing_next_round BETWEEN 0 AND 100
  ),
  chance_of_playing_this_round INTEGER CHECK (
    chance_of_playing_this_round IS NULL
    OR chance_of_playing_this_round BETWEEN 0 AND 100
  ),
  form NUMERIC(8,2) NOT NULL,
  selected_by_percent NUMERIC(8,2) NOT NULL CHECK (selected_by_percent >= 0),
  points_per_game NUMERIC(8,2) NOT NULL CHECK (points_per_game >= 0),
  value_season NUMERIC(8,2) NOT NULL CHECK (value_season >= 0),
  total_points INTEGER NOT NULL,
  minutes INTEGER NOT NULL CHECK (minutes >= 0),
  starts INTEGER NOT NULL CHECK (starts >= 0),
  expected_goals NUMERIC(10,2) NOT NULL,
  expected_assists NUMERIC(10,2) NOT NULL,
  expected_goal_involvements NUMERIC(10,2) NOT NULL,
  expected_goals_conceded NUMERIC(10,2) NOT NULL,
  ingestion_run_id BIGINT NOT NULL REFERENCES ingestion_runs(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fixtures (
  id INTEGER PRIMARY KEY,
  code INTEGER,
  event_id INTEGER REFERENCES gameweeks(id),
  kickoff_time TIMESTAMPTZ,
  team_h_id INTEGER NOT NULL REFERENCES teams(id),
  team_a_id INTEGER NOT NULL REFERENCES teams(id),
  team_h_score INTEGER,
  team_a_score INTEGER,
  team_h_difficulty INTEGER NOT NULL CHECK (team_h_difficulty BETWEEN 1 AND 5),
  team_a_difficulty INTEGER NOT NULL CHECK (team_a_difficulty BETWEEN 1 AND 5),
  started BOOLEAN NOT NULL,
  finished BOOLEAN NOT NULL,
  ingestion_run_id BIGINT NOT NULL REFERENCES ingestion_runs(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (team_h_id <> team_a_id)
);

CREATE INDEX IF NOT EXISTS idx_players_team_id ON players(team_id);
CREATE INDEX IF NOT EXISTS idx_players_position ON players(position);
CREATE INDEX IF NOT EXISTS idx_gameweeks_deadline_time ON gameweeks(deadline_time);
CREATE INDEX IF NOT EXISTS idx_fixtures_event_id ON fixtures(event_id);
CREATE INDEX IF NOT EXISTS idx_fixtures_team_h_id ON fixtures(team_h_id);
CREATE INDEX IF NOT EXISTS idx_fixtures_team_a_id ON fixtures(team_a_id);
