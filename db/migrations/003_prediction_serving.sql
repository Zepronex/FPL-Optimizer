CREATE TABLE IF NOT EXISTS prediction_runs (
  id BIGSERIAL PRIMARY KEY,
  run_key TEXT NOT NULL UNIQUE,
  model_name TEXT NOT NULL,
  model_version TEXT NOT NULL,
  target_gameweek_id INTEGER NOT NULL REFERENCES gameweeks(id),
  prediction_file_path TEXT NOT NULL,
  prediction_file_hash TEXT NOT NULL,
  model_artifact_path TEXT,
  model_artifact_hash TEXT,
  feature_snapshot_hash TEXT,
  source_snapshot_hash TEXT,
  source_generated_at TIMESTAMPTZ,
  source_run_id BIGINT REFERENCES ingestion_runs(id),
  prediction_count INTEGER NOT NULL CHECK (prediction_count >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS player_predictions (
  id BIGSERIAL PRIMARY KEY,
  prediction_run_id BIGINT NOT NULL REFERENCES prediction_runs(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id),
  target_gameweek_id INTEGER NOT NULL REFERENCES gameweeks(id),
  fixture_id INTEGER REFERENCES fixtures(id),
  predicted_points NUMERIC(8,4) NOT NULL CHECK (predicted_points >= 0),
  baseline_predicted_points NUMERIC(8,4) CHECK (
    baseline_predicted_points IS NULL
    OR baseline_predicted_points >= 0
  ),
  confidence NUMERIC(8,4) CHECK (
    confidence IS NULL
    OR confidence BETWEEN 0 AND 1
  ),
  uncertainty NUMERIC(8,4) CHECK (
    uncertainty IS NULL
    OR uncertainty >= 0
  ),
  source_snapshot_hash TEXT,
  feature_snapshot_hash TEXT,
  feature_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (prediction_run_id, player_id, target_gameweek_id, fixture_id)
);

CREATE TABLE IF NOT EXISTS model_evaluations (
  id BIGSERIAL PRIMARY KEY,
  evaluation_key TEXT NOT NULL UNIQUE,
  model_name TEXT NOT NULL,
  model_version TEXT NOT NULL,
  evaluation_type TEXT NOT NULL,
  evaluation_file_path TEXT NOT NULL,
  evaluation_file_hash TEXT NOT NULL,
  prediction_count INTEGER NOT NULL CHECK (prediction_count >= 0),
  metrics JSONB NOT NULL,
  baseline_metrics JSONB,
  metrics_by_position JSONB,
  baseline_metrics_by_position JSONB,
  evaluated_gameweeks JSONB NOT NULL DEFAULT '[]'::jsonb,
  skipped_gameweeks JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prediction_runs_latest
  ON prediction_runs(target_gameweek_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_prediction_runs_model_version
  ON prediction_runs(model_name, model_version);

CREATE INDEX IF NOT EXISTS idx_player_predictions_gameweek_points
  ON player_predictions(target_gameweek_id, predicted_points DESC);

CREATE INDEX IF NOT EXISTS idx_player_predictions_player
  ON player_predictions(player_id, target_gameweek_id);

CREATE INDEX IF NOT EXISTS idx_player_predictions_run
  ON player_predictions(prediction_run_id);

CREATE INDEX IF NOT EXISTS idx_model_evaluations_latest
  ON model_evaluations(evaluation_type, created_at DESC, id DESC);
