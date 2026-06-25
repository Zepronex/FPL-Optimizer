# FPL Optimizer v2 Roadmap

## Phase 1: Repo Cleanup

- Remove committed dependency folders and build artifacts.
- Standardize `.gitignore` and environment examples.
- Document repository rules, target architecture, and setup expectations.
- Verify existing build and typecheck behavior without changing product architecture.

## Phase 2: Data Ingestion

- Define source list and ingestion cadence.
- Store raw snapshots with source metadata and timestamps.
- Add repeatable local and scheduled ingestion commands.
- Add validation for source schema drift.

## Phase 3: Database and Schema

- Introduce PostgreSQL for normalized FPL data.
- Add migrations for players, teams, fixtures, events, prices, statuses, and snapshots.
- Define model feature and prediction tables.
- Add local database setup documentation.

## Phase 4: Feature Engineering

- Build pre-deadline feature transformations.
- Add leakage checks for all feature sets.
- Version feature definitions and generated datasets.
- Add tests for transformations and edge cases.

## Phase 5: Prediction Model

- Establish baseline expected-points models.
- Use time-series validation and calibration reporting.
- Persist model artifacts with feature metadata.
- Track evaluation metrics for each model version.

## Phase 6: Optimizer

- Implement FPL constraints for squads, transfers, formations, budget, club limits, and captaincy.
- Add deterministic optimization tests with fixed inputs.
- Support scenario comparison across horizons and risk settings.
- Record optimizer inputs and outputs for reproducibility.

## Phase 7: AI Agent

- Add an explanation layer after optimizer outputs are stable.
- Ground explanations in recorded model features and optimizer decisions.
- Add checks that prevent unsupported claims or invented data.
- Keep the agent out of core recommendation calculations.

## Phase 8: Backtesting

- Replay historical deadlines using only available-at-the-time data.
- Compare against simple baselines and previous model versions.
- Report points, transfer value, captaincy performance, and calibration.
- Use backtest results as release gates for recommendation changes.

## Phase 9: Deployment

- Separate deployable web, API, worker, database, and model artifact concerns.
- Add production configuration, migrations, monitoring, and scheduled jobs.
- Define rollback procedures for API, model, and optimizer releases.
- Document release and operations workflows.
