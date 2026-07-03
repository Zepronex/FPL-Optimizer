# PostgreSQL Foundation

ScoutIQ uses PostgreSQL for normalized FPL data produced by the deterministic ingestion pipeline. This database layer does not add prediction models, optimization, or LLM features.

## Start Postgres Locally

Create a local `.env` from `.env.example` if you want to override the defaults, then start the database:

```powershell
docker compose up -d postgres
docker compose ps
```

The default local connection is:

```text
postgresql://scoutiq:scoutiq@localhost:5432/scoutiq
```

## Run Migrations

Apply schema migrations from the repository root:

```powershell
pnpm.cmd run db:migrate
```

Windows wrapper:

```powershell
.\scripts\db-migrate.ps1
```

Migrations live in `db/migrations`. Applied files are tracked in `schema_migrations` with a checksum so changed migration files are detected.

## Run Ingestion

Refresh the normalized Day 2 FPL output:

```powershell
pnpm.cmd run ingest:fpl
```

Windows wrapper:

```powershell
.\scripts\ingest-fpl.ps1
```

The default output remains `data/fpl/latest`:

```text
data/fpl/latest/manifest.json
data/fpl/latest/players.json
data/fpl/latest/teams.json
data/fpl/latest/events.json
data/fpl/latest/fixtures.json
```

## Load Data Into PostgreSQL

Load the normalized JSON files into Postgres:

```powershell
pnpm.cmd run db:load:fpl
```

Windows wrapper:

```powershell
.\scripts\load-fpl-db.ps1
```

To load a specific ingestion output directory:

```powershell
pnpm.cmd run db:load:fpl -- --input data/fpl/2026-27
.\scripts\load-fpl-db.ps1 -InputDir data/fpl/2026-27
```

The loader validates the normalized files, records an `ingestion_runs` row with source metadata and a deterministic snapshot hash, then upserts teams, players, gameweeks, and fixtures. Re-running the same input updates existing rows instead of creating duplicates.

## Expected-Points Tables

Migration `002_expected_points_foundation.sql` adds serving tables for baseline model run metadata and player expected-points outputs:

```text
expected_points_model_runs
player_expected_points
```

Migration `003_prediction_serving.sql` adds the Day 6 serving tables used by the backend API:

```text
prediction_runs
player_predictions
model_evaluations
```

The local Day 5 training and backtesting scripts still write artifacts under gitignored `data/` paths. Load those outputs into PostgreSQL with:

```powershell
pnpm.cmd run db:load:predictions
.\scripts\load-predictions-db.ps1
```

See `docs/PREDICTION_SERVING.md` for the prediction loader, table contracts, and API endpoints.

## Verify The Result

The loader prints the loaded counts and snapshot hash. The counts should match `data/fpl/latest/manifest.json`.

You can also query the local container directly:

```powershell
docker compose exec postgres psql -U scoutiq -d scoutiq -c "select count(*) as teams from teams;"
docker compose exec postgres psql -U scoutiq -d scoutiq -c "select count(*) as players from players;"
docker compose exec postgres psql -U scoutiq -d scoutiq -c "select count(*) as gameweeks from gameweeks;"
docker compose exec postgres psql -U scoutiq -d scoutiq -c "select count(*) as fixtures from fixtures;"
docker compose exec postgres psql -U scoutiq -d scoutiq -c "select id, snapshot_hash, record_counts from ingestion_runs order by id desc limit 1;"
```
