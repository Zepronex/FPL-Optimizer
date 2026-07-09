CREATE TABLE IF NOT EXISTS expected_points_model_runs (
  id BIGSERIAL PRIMARY KEY,
  model_version TEXT NOT NULL,
  model_artifact_uri TEXT,
  trained_from_gameweek INTEGER,
  trained_through_gameweek INTEGER,
  training_row_count INTEGER NOT NULL CHECK (training_row_count >= 0),
  feature_columns JSONB NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS player_expected_points (
  id BIGSERIAL PRIMARY KEY,
  model_run_id BIGINT NOT NULL REFERENCES expected_points_model_runs(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id),
  target_gameweek_id INTEGER NOT NULL REFERENCES gameweeks(id),
  fixture_id INTEGER REFERENCES fixtures(id),
  expected_points NUMERIC(8,3) NOT NULL CHECK (expected_points >= 0),
  baseline_expected_points NUMERIC(8,3) NOT NULL CHECK (baseline_expected_points >= 0),
  source_snapshot_hash TEXT NOT NULL,
  feature_values JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (model_run_id, player_id, target_gameweek_id, fixture_id)
);

CREATE INDEX IF NOT EXISTS idx_expected_points_model_runs_version
  ON expected_points_model_runs(model_version);

CREATE INDEX IF NOT EXISTS idx_player_expected_points_gameweek
  ON player_expected_points(target_gameweek_id);

CREATE INDEX IF NOT EXISTS idx_player_expected_points_player
  ON player_expected_points(player_id);
