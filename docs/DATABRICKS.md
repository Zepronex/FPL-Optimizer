# Databricks Free Edition Pipeline

ScoutIQ has a separate Databricks transformation and analytics path built with real PySpark DataFrames, managed Delta tables, Unity Catalog, serverless Jobs, and a Declarative Automation Bundle. Databricks does not replace the local PostgreSQL/API serving path; it is the reproducible medallion and evaluation layer.

## Architecture

```mermaid
flowchart LR
  A["Official public FPL APIs"] --> B["Local TypeScript ingestion"]
  B --> C["Ignored public snapshot package"]
  C --> D["Unity Catalog managed Volume"]
  D --> E["Bronze managed Delta tables"]
  E --> F["Silver managed Delta tables"]
  F --> G["Gold prior-only feature and outcome tables"]
  G --> H["Walk-forward expected-points evaluation"]
  H --> I["Delta predictions, metrics, and run summary"]
  I -. "deliberate export boundary" .-> J["Existing PostgreSQL loaders"]
  J --> K["Express API and React application"]
```

The four Databricks tasks are explicitly ordered `bronze -> silver -> gold -> evaluation`. Each task reads the Delta output of the preceding layer. The old local JSONL pipeline remains available for ordinary development and backward compatibility.

## Public-Data Boundary

Only these official public FPL endpoints are permitted:

- `https://fantasy.premierleague.com/api/bootstrap-static/`
- `https://fantasy.premierleague.com/api/fixtures/`
- `https://fantasy.premierleague.com/api/element-summary/{player_id}/`

No PostgreSQL credentials, local environment files, private datasets, or proprietary data are uploaded. Generated full snapshots remain under ignored `data/` paths. The committed fixture under `fixtures/databricks/public_fpl_snapshot` is a small deterministic subset of a real public capture and is labeled so its counts and metrics cannot be confused with full-history evidence.

## Prerequisites

- Databricks CLI 1.x with Declarative Automation Bundle support.
- A Databricks Free Edition workspace with Unity Catalog and serverless Jobs.
- A local CLI configuration profile named `scoutiq`.
- Node.js and pnpm for the existing TypeScript ingestion.
- Python 3.12 and Java 17 are recommended for the local PySpark suite.

Authenticate locally without storing credentials in the repository:

```sh
databricks auth login --profile scoutiq
databricks current-user me --profile scoutiq
```

The profile name is passed on commands only. `databricks.yml` contains no host, token, account identifier, workspace identifier, email address, or user-specific path.

## Local PySpark Setup

PySpark is an explicit development-only dependency. Databricks serverless supplies its own PySpark runtime; do not install `pyspark` into the serverless task environment.

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --requirement requirements-dev.txt
pnpm run databricks:test
```

The local tests create an embedded `local[1]` Spark session, use a temporary warehouse, and stop it after the suite. They do not require a permanently running Spark service or remote workspace.

## Prepare the Full Public Snapshot

Run the existing ingestion and history paths, then package their outputs:

```sh
pnpm run ingest:fpl
pnpm run ingest:fpl:history
python scripts/prepare_databricks_snapshot.py
```

The generated package is written to:

```text
data/databricks/public_fpl_snapshot/
  snapshot_metadata.json
  manifest.json
  players.json
  teams.json
  events.json
  fixtures.json
  player_gameweek_history.json
```

`snapshot_metadata.json` records the capture timestamps, effective season, official source URLs, canonical normalized-snapshot hash, history-file hash, per-file SHA-256 values, row counts, and whether the package is a fixture. It never records a local absolute path.

## Bundle Validation, Deployment, Upload, and Run

The `dev` target is the default. Current CLI guidance recommends using the local profile override without also passing `--target`:

```sh
databricks bundle validate --profile scoutiq
databricks bundle validate --strict --profile scoutiq
databricks bundle plan --profile scoutiq
databricks bundle deploy --auto-approve --profile scoutiq
```

Deployment creates:

- one development Job;
- schema `workspace.scoutiq_databricks`;
- managed Volume `workspace.scoutiq_databricks.scoutiq_public_fpl`.

Upload the ignored full package after the first deployment creates the Volume:

```sh
databricks fs cp data/databricks/public_fpl_snapshot \
  dbfs:/Volumes/workspace/scoutiq_databricks/scoutiq_public_fpl/input \
  --recursive --overwrite --profile scoutiq

databricks fs ls \
  dbfs:/Volumes/workspace/scoutiq_databricks/scoutiq_public_fpl/input \
  --long --profile scoutiq
```

Run the complete job and wait for its final state:

```sh
databricks bundle run scoutiq_pipeline --profile scoutiq
```

Source files are synchronized to the bundle workspace folder, while datasets are read from `/Volumes/...`. Serverless Spark executors cannot use workspace files as a general data filesystem.

## Delta Tables

All tables are managed Unity Catalog Delta tables in `workspace.scoutiq_databricks`.

| Layer | Table | Grain / logical key |
| --- | --- | --- |
| Bronze | `bronze_ingestion_manifest` | one row per `source_snapshot_hash` |
| Bronze | `bronze_source_metadata` | snapshot and source index |
| Bronze | `bronze_players_raw` | snapshot and public player id |
| Bronze | `bronze_teams_raw` | snapshot and public team id |
| Bronze | `bronze_gameweeks_raw` | snapshot and public gameweek id |
| Bronze | `bronze_fixtures_raw` | snapshot and public fixture id |
| Bronze | `bronze_player_gameweek_history_raw` | snapshot, player, gameweek, fixture |
| Silver | `silver_players` | snapshot and player id |
| Silver | `silver_teams` | snapshot and team id |
| Silver | `silver_gameweeks` | snapshot and gameweek id |
| Silver | `silver_fixtures` | snapshot and fixture id |
| Silver | `silver_player_gameweek_history` | snapshot, player, gameweek, fixture |
| Gold | `gold_team_fixture_features` | pre-deadline upcoming fixture and team |
| Gold | `gold_current_player_gameweek_features` | pre-deadline upcoming fixture and player |
| Gold | `gold_historical_player_gameweek_features` | snapshot, season, gameweek, player |
| Gold | `gold_historical_player_gameweek_outcomes` | snapshot, season, gameweek, player |
| Analytics | `analytics_expected_points_predictions` | evaluation run, season, gameweek, player |
| Analytics | `analytics_expected_points_metrics` | run, model variant, segment type/value |
| Analytics | `analytics_pipeline_run_summary` | one row per successful pipeline run |

The first-create path uses managed Delta `saveAsTable`. Later runs enforce non-null unique merge keys and use Delta SQL `MERGE` for idempotent updates without discarding other snapshots.

## Leakage Controls and Evaluation

Historical FPL history is aggregated to one player-gameweek row before any window is calculated. This prevents a second fixture in a double gameweek from seeing the first fixture's outcome.

The historical feature table contains only:

- stable player identity and position;
- counts and averages calculated from strictly earlier player-gameweeks;
- prior-five-gameweek point and minute averages;
- prior-gameweek point and minute values;
- source and run lineage.

Target-gameweek fixture ids, opponents, home/away counts, kickoff timestamps, points, and minutes are kept in the separate outcome table. The evaluator joins targets only after feature construction. For each evaluated gameweek, correction terms use rows from strictly earlier gameweeks. The model is compared with a recent-points baseline and writes MAE, RMSE, and mean error overall and by position.

`is_test_fixture` and `metric_provenance` distinguish committed-fixture demonstrations from full public-history runs. Fixture metrics must never be presented as full-dataset results.

## Inspect Runs and Tables

Use the run identifier printed by `bundle run`:

```sh
databricks jobs get-run <run-id> --profile scoutiq -o json
databricks jobs get-run-output <task-run-id> --profile scoutiq -o json
databricks tables list workspace scoutiq_databricks --profile scoutiq -o json
databricks tables get workspace.scoutiq_databricks.<table> \
  --include-delta-metadata --profile scoutiq -o json
```

The single Free Edition SQL warehouse can query counts and metrics through the SQL editor or Statement Execution API. Verification must check the returned SQL status because an API request can succeed while the statement itself fails.

Useful SQL:

```sql
SHOW TABLES IN workspace.scoutiq_databricks;

SELECT *
FROM workspace.scoutiq_databricks.analytics_pipeline_run_summary
ORDER BY completed_at DESC
LIMIT 1;

SELECT model_variant, segment_type, segment_value,
       prediction_count, mae, rmse, mean_error, metric_provenance
FROM workspace.scoutiq_databricks.analytics_expected_points_metrics
WHERE segment_type = 'overall'
ORDER BY model_variant;

DESCRIBE DETAIL workspace.scoutiq_databricks.gold_historical_player_gameweek_features;
DESCRIBE HISTORY workspace.scoutiq_databricks.gold_historical_player_gameweek_features;
```

## PostgreSQL and API Boundary

PostgreSQL remains ScoutIQ's serving store. The Databricks layer does not receive database credentials and does not replace the existing loaders, routes, optimizer, or React application. A deliberate future export can map per-fixture prediction rows and evaluation summaries into the existing PostgreSQL contracts while retaining `source_snapshot_hash` and model-run lineage.

## Cleanup

The generated Delta tables make the bundle-managed schema non-empty. Drop the development schema and its managed data through the SQL editor before destroying bundle state:

```sql
DROP SCHEMA IF EXISTS workspace.scoutiq_databricks CASCADE;
```

Then remove the Job, Volume metadata, synchronized files, and deployment state:

```sh
databricks bundle destroy --auto-approve --profile scoutiq
```

Do not run cleanup when retaining the deployed portfolio pipeline as résumé evidence.

## Databricks Free Edition Limitations

- Serverless compute only; no classic or user-managed job clusters.
- Restricted outbound internet, so public data is captured locally and uploaded to a managed Volume.
- Spark Connect/DataFrame APIs only; RDD APIs and many low-level Spark settings are unavailable.
- One workspace, one metastore, one small SQL warehouse, and a maximum of five concurrent job tasks.
- Capacity and fair-use quotas can delay tasks at `Waiting for cluster` or suspend compute temporarily.
- No production SLA or reliability guarantee; Free Edition is appropriate for a deployed portfolio pipeline, not a production-deployed claim.
- Serverless logs are client-side and mixed; there is no classic Spark UI.

Official references:

- [Databricks Free Edition](https://docs.databricks.com/aws/en/getting-started/free-edition)
- [Free Edition limitations](https://docs.databricks.com/aws/en/getting-started/free-edition-limitations)
- [Serverless limitations](https://docs.databricks.com/aws/en/compute/serverless/limitations)
- [Declarative Automation Bundles](https://docs.databricks.com/aws/en/dev-tools/bundles)
- [Bundle command reference](https://docs.databricks.com/aws/en/dev-tools/cli/bundle-commands)

## Verification Boundary

Bundle deployment or source upload alone is not end-to-end evidence. Mark Databricks, PySpark, Delta Lake, Unity Catalog, Databricks Jobs, and Declarative Automation Bundles as verified only after a complete four-task run succeeds and the managed Delta outputs are inspected.

## Verified Portfolio Run

On 2026-07-11, the development bundle passed normal and strict validation, deployed through profile `scoutiq`, and completed all four serverless tasks successfully. The run lasted from 11:21:35 UTC through 11:32:53 UTC, including 265 seconds waiting for Free Edition serverless capacity. The input was a full public-FPL snapshot, not the committed test fixture:

- snapshot hash: `b4cf811ba886c26c65de2d17c6b071776dee018c1e39b08aa2e853f1f34671e7`;
- input entities: 841 players, 20 teams, 38 gameweeks, 380 fixtures, and 29,747 player-gameweek-fixture history rows;
- Silver outputs: 841 players, 20 teams, 38 gameweeks, 380 fixtures, and 29,747 history rows;
- Gold outputs: 29,338 historical feature rows and 29,338 separate outcome rows;
- evaluation outputs: 26,262 predictions, 10 metric rows, and one successful run-summary row;
- walk-forward range: gameweeks 5–38;
- expected-points metrics: MAE 1.0570 and RMSE 2.0508;
- recent-points baseline: MAE 1.0473 and RMSE 2.1120.

The expected-points variant improved RMSE but not MAE. Because the snapshot was captured after gameweek 38, there were no unplayed fixtures and the two current/upcoming Gold tables correctly contained zero rows. Unity Catalog inspection reported all 19 outputs as managed Delta tables, and SQL queries independently reproduced the table counts and persisted metrics. Workspace URLs, identities, warehouse identifiers, and run identifiers are omitted intentionally.
