# Expected-Points Baseline

ScoutIQ's Day 5 prediction foundation adds a transparent expected-points baseline on top of the deterministic FPL ingestion and Bronze/Silver/Gold lakehouse pipeline. It does not add squad optimization, transfer optimization, or agent behavior.

## Feature Rows

Prediction rows are written to `data/features/player_gameweek_features.jsonl`. They normally come from Gold `player_gameweek_features` and represent player-fixture rows for the next available gameweek.

When a snapshot has no unstarted future fixtures, for example after a season has finished, `pipeline:features` can write the latest historical gameweek feature slice from official player history instead. That fallback exists for local model validation only; it is still deterministic official data, but it is not a live upcoming-gameweek recommendation input.

Prediction rows include:

- Player identity: `player_id`, `player_name`, `position`
- Team context: `team_id`, `team_name`, opponent, home/away
- Current pre-deadline player state: `price`, availability status, chance of playing, `total_points`, `minutes`, `form`, `points_per_game`, ownership percentage
- Fixture context: `fixture_id`, `fixture_difficulty`, `upcoming_gameweek_id`
- Pre-deadline aggregates: completed gameweeks, season points average, season minutes average, recent points average
- Reproducibility metadata: `source_snapshot_hash`, `source_generated_at`, `season`

Prediction feature rows intentionally exclude outcome columns such as fixture scores and `target_points`.

Training rows are written to `data/features/player_gameweek_training_rows.jsonl`. They include the same feature columns plus `target_points` and `target_minutes`.

The default training path uses deterministic official player history from `data/fpl/history/player_gameweek_history.json`, produced from each player's public FPL `element-summary/{player_id}` endpoint. The older multi-snapshot path is still available with `pipeline:features -- --historical` when pre-gameweek and post-gameweek normalized snapshots have been archived.

## Target

The target is actual FPL points scored by a player in `upcoming_gameweek_id`.

For official player-history rows this comes directly from the public FPL player gameweek history record.

For archived snapshot rows this is calculated as:

```text
future_checked_snapshot.player.totalPoints - pre_gameweek_snapshot.player.totalPoints
```

`target_minutes` is calculated the same way from cumulative minutes and is used for evaluation/debugging rather than as the predicted target.

## Leakage Controls

- Prediction rows are generated from pre-deadline snapshot data only.
- Official player-history feature values are calculated from prior player gameweeks only; the target gameweek's points and minutes are target columns, not model inputs.
- Archived snapshot targets are attached only from a later checked snapshot for the exact target gameweek.
- Rolling point and minute averages are calculated from prior player gameweeks only. The current target gameweek is not included in its own features.
- Walk-forward backtests train on rows with `upcoming_gameweek_id` strictly less than the evaluated target gameweek.
- Fixture result columns are not included in Gold model feature rows.

## Baseline Model

The baseline is `expected-points-rule-baseline-v1`.

It blends recent points, season average points and points per game, then applies simple deterministic adjustments for:

- Availability/chance of playing
- Recent or season average minutes
- Fixture difficulty
- Home/away status
- Learned positional calibration from historical training rows

The comparison baseline is recent average points, using historical rolling points when available and current FPL form otherwise.

## Local Commands

Run the local setup in this order:

```powershell
pnpm.cmd install
pnpm.cmd run ingest:fpl
pnpm.cmd run ingest:fpl:history
pnpm.cmd run pipeline:features
pnpm.cmd run model:train
pnpm.cmd run model:backtest
pnpm.cmd run model:predict
```

Refresh deterministic bootstrap/fixture ingestion only:

```powershell
pnpm.cmd run ingest:fpl
```

Fetch official player-gameweek history for the latest normalized player list:

```powershell
pnpm.cmd run ingest:fpl:history
```

Build both current prediction rows and training rows:

```powershell
pnpm.cmd run pipeline:features
```

Build training rows from archived deterministic snapshots instead:

```powershell
pnpm.cmd run pipeline:features -- --historical --input data/fpl/snapshots --output data/features/player_gameweek_training_rows.jsonl
```

Train, backtest and predict:

```powershell
pnpm.cmd run model:train
pnpm.cmd run model:backtest
pnpm.cmd run model:predict
```

Load generated predictions into PostgreSQL after migrations and normalized FPL data are loaded:

```powershell
pnpm.cmd run db:migrate
pnpm.cmd run db:load:fpl
pnpm.cmd run db:load:predictions
```

Run the model tests:

```powershell
pnpm.cmd run model:test
pnpm.cmd run pipeline:test
```

Outputs are written under gitignored local paths:

```text
data/features/
data/fpl/history/
data/models/
data/evaluation/
data/predictions/
```

The Day 6 serving flow is documented in `docs/PREDICTION_SERVING.md`.

## Future Optimizer Handoff

The prediction output contains `player_id`, `upcoming_gameweek_id`, `fixture_id`, `expected_points`, `baseline_expected_points`, player/team context and `source_snapshot_hash`. A future optimizer can consume one or more prediction rows per player and gameweek, aggregate double-gameweek rows deliberately, and join back to PostgreSQL player and fixture tables. The optimizer should keep the model run id or snapshot hash attached so recommendations are reproducible.

## Current Limitations

- The model is intentionally simple and interpretable.
- It is not a squad or transfer optimizer.
- It does not use external paid data.
- Historical training quality depends on official FPL element-summary availability or archived deterministic snapshots.
- Double-gameweek aggregation is left to a future serving/optimizer layer.
- The current Gold layer uses official FPL form as the immediate recent-points proxy when no historical rows are available.
