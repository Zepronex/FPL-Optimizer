# Expected-Points Baseline

ScoutIQ's Day 5 prediction foundation adds a transparent expected-points baseline on top of the deterministic FPL ingestion and Bronze/Silver/Gold lakehouse pipeline. It does not add squad optimization, transfer optimization, or agent behavior.

## Feature Rows

Current prediction rows come from Gold `player_gameweek_features`. They are player-gameweek fixture rows for the next available gameweek and include:

- Player identity: `player_id`, `player_name`, `position`
- Team context: `team_id`, `team_name`, opponent, home/away
- Current pre-deadline player state: `price`, availability status, chance of playing, `total_points`, `minutes`, `form`, `points_per_game`, ownership percentage
- Fixture context: `fixture_id`, `fixture_difficulty`, `upcoming_gameweek_id`
- Pre-deadline aggregates: completed gameweeks, season points average, season minutes average, recent points average
- Reproducibility metadata: `source_snapshot_hash`, `source_generated_at`, `season`

Gold prediction feature rows intentionally exclude outcome columns such as fixture scores and `target_points`.

Historical training rows are built from multiple deterministic normalized FPL snapshots. For each pre-gameweek snapshot, the feature builder only attaches a `target_points` value when it can find a later snapshot whose latest checked gameweek exactly matches the target gameweek. If a snapshot skips over the target gameweek, the row is skipped because the single-gameweek target cannot be isolated safely.

## Target

The target is actual FPL points scored by a player in `upcoming_gameweek_id`.

For historical rows this is calculated as:

```text
future_checked_snapshot.player.totalPoints - pre_gameweek_snapshot.player.totalPoints
```

`target_minutes` is calculated the same way from cumulative minutes and is used for evaluation/debugging rather than as the predicted target.

## Leakage Controls

- Prediction rows are generated from pre-deadline snapshot data only.
- Historical targets are attached only from a later checked snapshot for the exact target gameweek.
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

Refresh deterministic ingestion first when needed:

```powershell
pnpm.cmd run ingest:fpl
```

Write current expected-points feature rows from the latest normalized snapshot:

```powershell
pnpm.cmd run pipeline:features
```

Build historical training rows from a directory of deterministic snapshots:

```powershell
pnpm.cmd run pipeline:features -- --historical --input data/fpl/snapshots --output data/features/player_gameweek_training_rows.jsonl
```

Train the baseline:

```powershell
pnpm.cmd run model:train
```

Run a walk-forward backtest:

```powershell
pnpm.cmd run model:backtest
```

Predict expected points for the latest feature rows:

```powershell
pnpm.cmd run model:predict
```

Run the model tests:

```powershell
pnpm.cmd run model:test
pnpm.cmd run pipeline:test
```

Outputs are written under gitignored local paths:

```text
data/features/
data/models/
data/evaluation/
data/predictions/
```

## Future Optimizer Handoff

The prediction output contains `player_id`, `upcoming_gameweek_id`, `fixture_id`, `expected_points`, `baseline_expected_points`, player/team context and `source_snapshot_hash`. A future optimizer can consume one or more prediction rows per player and gameweek, aggregate double-gameweek rows deliberately, and join back to PostgreSQL player and fixture tables. The optimizer should keep the model run id or snapshot hash attached so recommendations are reproducible.

## Current Limitations

- The model is intentionally simple and interpretable.
- It is not a squad or transfer optimizer.
- It does not use external paid data.
- Historical training quality depends on collecting deterministic snapshots before and after gameweeks.
- Double-gameweek aggregation is left to a future serving/optimizer layer.
- The current Gold layer uses official FPL form as the immediate recent-points proxy when no historical rows are available.
