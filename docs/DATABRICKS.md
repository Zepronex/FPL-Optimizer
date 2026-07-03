# Databricks Lakehouse Pipeline

ScoutIQ uses this foundation to reshape deterministic FPL ingestion output into Bronze, Silver and Gold lakehouse layers. It does not train prediction models, run optimizers, or add agent behavior.

## Source Input

Run the Day 2 ingestion first:

```powershell
pnpm.cmd run ingest:fpl
```

The pipeline reads the normalized JSON files from `data/fpl/latest` by default:

```text
manifest.json
players.json
teams.json
events.json
fixtures.json
```

The manifest metadata, source URLs, fetch timestamps and deterministic snapshot hash are carried through every layer.

## Layers

Bronze writes a source-preserving landing area under `data/lakehouse/bronze`. It keeps the ingestion manifest, source metadata and raw normalized records as JSON strings with snapshot metadata.

Silver writes clean typed player, team, fixture and gameweek tables under `data/lakehouse/silver`. It keeps the normalized fixture contract in a typed shape for historical analysis while Gold is responsible for excluding result columns from feature rows.

Gold writes feature-ready tables under `data/lakehouse/gold`. The first table, `team_fixture_features`, contains upcoming fixture context. The second table, `player_gameweek_features`, joins players to their next gameweek fixture context with columns such as player id, player name, position, team name, price, availability status, total points, form, selected-by percentage, minutes, pre-deadline season averages, fixture difficulty, home/away and source snapshot hash.

Gold prediction rows do not include target points, fixture scores, or other post-gameweek outcomes. Expected-points training and backtesting consume these rows through the separate baseline pipeline documented in [Expected-Points Baseline](EXPECTED_POINTS_BASELINE.md), keeping the snapshot hash available for reproducibility and leakage checks.

## Local Commands

Default local execution uses Python only and writes JSONL files. It is intended for development machines that do not have Spark installed:

```powershell
pnpm.cmd run pipeline:bronze
pnpm.cmd run pipeline:silver
pnpm.cmd run pipeline:gold
pnpm.cmd run pipeline:features
pnpm.cmd run pipeline:all
```

Use a specific ingestion output directory:

```powershell
pnpm.cmd run pipeline:all -- --input data/fpl/2026-27 --output data/lakehouse
```

Validate inputs and write small sample outputs:

```powershell
pnpm.cmd run pipeline:all -- --dry-run --sample-limit 10
```

Dry-run output is written under `data/lakehouse/dry-run`.

Run the pipeline tests:

```powershell
pnpm.cmd run pipeline:test
```

## PySpark and Databricks

If PySpark is installed locally, run the same scripts with the Spark engine:

```powershell
pnpm.cmd run pipeline:all -- --engine spark --format parquet
```

The scripts are also suitable for Databricks jobs from a checked-out repo. Map them to separate job tasks:

```text
python -m pipelines.databricks.bronze --input /Volumes/<catalog>/<schema>/fpl/latest --output /Volumes/<catalog>/<schema>/lakehouse --engine spark --format parquet
python -m pipelines.databricks.silver --input /Volumes/<catalog>/<schema>/fpl/latest --output /Volumes/<catalog>/<schema>/lakehouse --engine spark --format parquet
python -m pipelines.databricks.gold --input /Volumes/<catalog>/<schema>/fpl/latest --output /Volumes/<catalog>/<schema>/lakehouse --engine spark --format parquet
```

Use `--format delta` in Databricks workspaces where Delta Lake is available. The local fallback remains JSONL so ordinary unit tests do not require a Spark cluster.

## PostgreSQL Serving Path

The current PostgreSQL loader stores normalized ingestion data and ingestion run metadata. A later serving loader can read Gold outputs, keep `source_snapshot_hash` as the foreign key to an ingestion run or feature batch, and load feature tables into PostgreSQL for API serving. That future loader should remain separate from model training and should enforce the same pre-deadline data boundary used by ingestion and feature engineering.
