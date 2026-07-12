# ScoutIQ

[![CI](https://github.com/Zepronex/FPL-Optimizer/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/Zepronex/FPL-Optimizer/actions/workflows/ci.yml)

ScoutIQ is an AI and data engineering project for Fantasy Premier League decision support. It combines official FPL data ingestion, PostgreSQL storage, feature engineering, expected-points modelling, deterministic optimization, and controlled recommendation explanations into one local-first demo.

The project exists to show how a sports decision platform can be built with reproducible data pipelines and transparent model evaluation instead of opaque recommendations.

## What It Solves

Fantasy sports recommendations are only useful when the data, model quality, constraints, and failure modes are visible. ScoutIQ focuses on:

- collecting and normalizing public FPL data in a repeatable way
- preparing leakage-aware features for expected-points modelling
- comparing model output against a simple baseline before using predictions
- generating squads, transfers, starting XI, captaincy, and bench order through deterministic constraints
- explaining optimizer output without allowing an LLM to make decisions
- showing local health, pipeline, evaluation, and fallback status for reviewers

The current model is transparent but is not claimed to outperform the historical baseline. Generate a local, provenance-bearing report with `python scripts/generate_resume_metrics.py`; its output is the source of truth for snapshot-specific counts and evaluation metrics.

## Architecture At A Glance

ScoutIQ is split into separate layers:

- `apps/web`: React and Vite frontend for squad workflows, top-player projections, optimizer recommendations, agent transparency, and the evaluation dashboard
- `apps/api`: Express and TypeScript API for ingestion, database loading, prediction serving, optimizer endpoints, agent explanations, health checks, and evaluation routes
- `db/migrations`: PostgreSQL schema for normalized FPL records, prediction runs, player predictions, and model evaluations
- `pipelines/databricks`: legacy local JSONL Bronze/Silver/Gold transformations retained for local compatibility
- `src/scoutiq_databricks`: genuine PySpark Bronze/Silver/Gold/evaluation transformations that write managed Delta tables
- `databricks.yml` and `resources/`: Declarative Automation Bundle resources for a four-task serverless Databricks Job
- `pipelines/expected_points`: feature generation, baseline training, walk-forward backtesting, prediction output, and model tests
- `scripts`: Windows-friendly local demo, smoke-test, ingestion, migration, and database load helpers

Data flows from the public FPL API into normalized local JSON, then into PostgreSQL. Pipeline jobs create feature rows and model artifacts. Prediction rows are loaded back into PostgreSQL, where the API serves them to deterministic optimizer routes. The LLM explanation layer receives already-decided optimizer output and returns validated explanatory JSON or deterministic fallback text.

## Implemented Capabilities

### Data Ingestion And Storage

- Fetches official public FPL bootstrap, fixture, and player-history data.
- Normalizes players, teams, gameweeks, fixtures, and history records with typed validation.
- Preserves source URLs, fetch timestamps, snapshot hashes, record counts, and reproducibility metadata.
- Loads normalized records into PostgreSQL through migration-backed tables.

### Local And Databricks Lakehouse Pipelines

- Retains the original local JSONL path under `pipelines/databricks` for ordinary development.
- Adds real PySpark DataFrame transformations under `src/scoutiq_databricks`.
- Deploys an explicit `bronze -> silver -> gold -> evaluation` serverless Job through a Declarative Automation Bundle.
- Writes managed Unity Catalog Delta tables and uses keyed Delta `MERGE` on repeat runs.
- Builds historical model features only from prior player-gameweeks, aggregates double gameweeks before windows, and keeps target-gameweek context and outcomes in a separate table.
- Keeps Databricks as the transformation/evaluation layer while PostgreSQL remains the serving store.

### Prediction And Backtesting

- Builds expected-points feature rows and training rows from official historical data.
- Trains an interpretable baseline expected-points model.
- Runs walk-forward backtests with historical baseline comparison.
- Writes model, evaluation, and prediction artifacts under gitignored local `data/` paths.
- Loads prediction and evaluation outputs into PostgreSQL for API serving.

### Constraint-Based Optimization

- Generates deterministic starting XI, bench order, captaincy, transfer, and squad recommendations.
- Applies FPL constraints such as positions, budget, formations, club limits, and transfer settings.
- Keeps optimizer logic separate from model training and LLM explanations.
- Returns prediction run metadata so recommendations can be traced to the data used.

### LLM Explanation Agent

- Explains optimizer results after decisions are already made.
- Uses structured JSON validation and grounding checks for provider responses.
- Falls back to deterministic local explanations when provider config is missing, invalid, timed out, or unsafe.
- Exposes safe status metadata without returning secrets or raw provider errors.

### Evaluation Dashboard

- Shows latest backtest metrics, baseline comparison, model limitation messaging, and data coverage.
- Uses `GET /api/evaluation/latest`, `GET /api/evaluation/runs`, and `GET /api/evaluation/data-health`.
- Avoids claiming the model beats the baseline unless both MAE and RMSE improve.

### Local Demo And Smoke Tests

- `pnpm.cmd run dev:app` starts only the API and web app.
- `pnpm.cmd run smoke:app` checks the local API, agent status, evaluation route, and key web pages.
- The default demo path works without an OpenAI API key because deterministic explanation fallback is enabled.

## Portfolio Walkthrough


```powershell
pnpm.cmd run dev:app
```

Then open:

- `http://localhost:3000`
- `http://localhost:3000/analyze`
- `http://localhost:3000/top-players`
- `http://localhost:3000/evaluation`
- `http://localhost:3001/api/health`

What to look for:

- Home page: the React app loads and connects to the API.
- Squad Builder: manual analysis uses default scoring weights internally; users do not tune scoring sliders in the demo flow.
- Top Players: prediction-backed rows are served from PostgreSQL, not a legacy side service.
- Team Analysis: a complete analyzed squad can show deterministic optimizer output for starting XI, bench order, captaincy, transfers, projected points, and constraint status.
- Recommendation explanation panel: the agent explains an optimizer result that already exists. In the default local demo, deterministic fallback mode is acceptable and expected when provider credentials are not configured.
- Model Evaluation: the dashboard shows MAE, RMSE, baseline comparison, data coverage, recent runs, setup warnings, and limitation messaging.
- API health: the backend can be checked independently from the frontend.

The optimizer makes the recommendation decisions. The LLM explanation layer, when enabled, is downstream of the optimizer and does not choose players, transfers, captaincy, bench order, or chips.

The evaluation dashboard should be read as a transparency surface. The current expected-points model is not claimed to outperform the historical baseline because MAE is worse while RMSE is better in the latest known backtest.

## Screenshots

These screenshots come from a local ScoutIQ demo run with generated local data and prediction-serving rows loaded into PostgreSQL.

| Home | Top Players |
| --- | --- |
| ![ScoutIQ home screen](docs/assets/screenshots/home.png) | ![ScoutIQ top players page](docs/assets/screenshots/top-players.png) |

| Analysis Results | Model Evaluation |
| --- | --- |
| ![ScoutIQ optimizer analysis results](docs/assets/screenshots/optimizer-result.png) | ![ScoutIQ model evaluation dashboard](docs/assets/screenshots/evaluation-dashboard.png) |

Capture guidance and review checks are documented in [Screenshot Capture Guide](docs/SCREENSHOTS.md).

## Run Locally

Prerequisites:

- Node.js with `pnpm.cmd` available on Windows
- Docker Desktop or another Docker Compose-compatible engine
- Python available as `python` for pipeline and model commands
- Java 17 and the pinned `requirements-dev.txt` dependencies for local PySpark tests

Start from a clean checkout:

```powershell
pnpm.cmd install
if (!(Test-Path .env)) { Copy-Item .env.example .env }
if (!(Test-Path apps\api\.env)) { Copy-Item apps\api\.env.example apps\api\.env }
```

Prepare the database, data, model outputs, and prediction-serving tables:

```powershell
docker compose up -d postgres
pnpm.cmd run db:migrate
pnpm.cmd run ingest:fpl
pnpm.cmd run db:load:fpl
pnpm.cmd run ingest:fpl:history
pnpm.cmd run pipeline:features
pnpm.cmd run model:train
pnpm.cmd run model:backtest
pnpm.cmd run model:predict
pnpm.cmd run db:load:predictions
```

Start the normal local demo:

```powershell
pnpm.cmd run dev:app
```

Open:

- `http://localhost:3000`
- `http://localhost:3000/squad`
- `http://localhost:3000/top-players`
- `http://localhost:3000/analyze`
- `http://localhost:3000/evaluation`
- `http://localhost:3001/api/health`

Run the local smoke check from a second terminal:

```powershell
pnpm.cmd run smoke:app
```

## Validation Commands

Use these commands to validate the main application, API, pipeline, and model paths:

```powershell
pnpm.cmd run build:api
pnpm.cmd run test:api
pnpm.cmd run test:smoke
pnpm.cmd run pipeline:test
pnpm.cmd run databricks:snapshot:test
pnpm.cmd run databricks:test
pnpm.cmd run model:test
pnpm.cmd run resume:metrics:test
pnpm.cmd run build
pnpm.cmd run build:web
```

## Databricks Free Edition

ScoutIQ's Databricks path captures public FPL data locally, uploads the ignored package to a bundle-managed Unity Catalog Volume, and runs four dependent serverless tasks. No database credentials or private data are sent to Databricks.

Prepare the public snapshot:

```sh
pnpm run ingest:fpl
pnpm run ingest:fpl:history
python scripts/prepare_databricks_snapshot.py
```

Validate and deploy with the local `scoutiq` CLI profile:

```sh
databricks current-user me --profile scoutiq
databricks bundle validate --strict --profile scoutiq
databricks bundle deploy --auto-approve --profile scoutiq
databricks fs cp data/databricks/public_fpl_snapshot \
  dbfs:/Volumes/workspace/scoutiq_databricks/scoutiq_public_fpl/input \
  --recursive --overwrite --profile scoutiq
databricks bundle run scoutiq_pipeline --profile scoutiq
```

See [Databricks Free Edition Pipeline](docs/DATABRICKS.md) for architecture, table contracts, leakage controls, inspection SQL, Free Edition limitations, and cleanup commands. Deployment or upload alone is not verification; cloud technologies are claimed only after the full job and Delta tables have been inspected.

The portfolio pipeline was verified end to end on 2026-07-11 using a full public-FPL snapshot: all four serverless tasks succeeded, 19 managed Unity Catalog Delta tables were inspected, and walk-forward evaluation persisted 26,262 predictions plus 10 metric rows. The expected-points variant recorded MAE 1.0570 and RMSE 2.0508 versus baseline MAE 1.0473 and RMSE 2.1120; it improved RMSE, not MAE. See the evidence document for the complete qualification.

## Continuous Integration

GitHub Actions runs `.github/workflows/ci.yml` on pull requests and pushes to `dev`. The workflow installs Node dependencies with `pnpm`, sets up Python for pipeline and model tests, and runs the API build, web build, API tests, smoke helper tests, pipeline tests, and expected-points model tests.

CI does not require `OPENAI_API_KEY`, Azure OpenAI credentials, local `.env` files, Docker, PostgreSQL, or live FPL API calls. Explanation-agent tests use mocked provider responses or deterministic fallback behavior, so provider access is not needed for review validation.

CI proves the repository is buildable and testable. It does not create new model-performance claims; those remain based on local evaluation artifacts and loaded evaluation records.

To reproduce the CI checks from Windows PowerShell, install dependencies and run the validation commands above. In GitHub Actions the same scripts run through `pnpm` instead of `pnpm.cmd`.

Core script reference:

| Command | Use |
| --- | --- |
| `pnpm.cmd run dev:app` | Start the API and web app for normal local development and demos. |
| `pnpm.cmd run smoke:app` | Check a running local API and web app from a second terminal. |
| `pnpm.cmd run build` | Build both API and web workspaces. |
| `pnpm.cmd run test:api` | Run API tests. |
| `pnpm.cmd run pipeline:test` | Run lakehouse pipeline tests. |
| `pnpm.cmd run model:test` | Run expected-points model tests. |

For full data refresh and prediction serving:

```powershell
pnpm.cmd run db:migrate
pnpm.cmd run ingest:fpl
pnpm.cmd run db:load:fpl
pnpm.cmd run ingest:fpl:history
pnpm.cmd run pipeline:features
pnpm.cmd run model:train
pnpm.cmd run model:backtest
pnpm.cmd run model:predict
pnpm.cmd run db:load:predictions
```

## Project Status

- The local demo works without an OpenAI API key through deterministic explanation fallback.
- Live OpenAI or Azure OpenAI mode is optional and explanation-only.
- Recommendations are deterministic and constraint-based.
- Prediction-backed optimizer screens require generated and loaded prediction rows in PostgreSQL.
- Evaluation compares the expected-points model against a historical recent-points baseline.
- The current model is not claimed to outperform the baseline across tracked metrics.
- Deployment readiness is documented in [Deployment Guide](docs/DEPLOYMENT.md) and [Production Readiness](docs/PRODUCTION_READINESS.md), but production deployment is not yet complete.

## Current Limitations

- The current model does not clearly outperform the baseline across tracked metrics.
- Public FPL API data limits the available player, team, injury, and tactical context.
- Optimizer recommendations depend on complete prediction rows and valid constraints.
- Manual squad analysis uses backend default scoring weights; the demo does not expose user-tuned analysis sliders.
- Automated generated-team review is unavailable in the current web demo path.
- The LLM explanation agent explains existing optimizer output; it does not choose players, transfers, captaincy, bench order, or chips.
- Local model and prediction artifacts are generated under gitignored `data/` paths and are not committed.
- Full public Databricks input packages are generated under gitignored `data/` paths; only a small labeled public-data fixture is committed for tests.
- Databricks Free Edition is serverless-only, capacity-limited, and not suitable for a production-deployed claim.
- Production deployment, scheduled ingestion, and production monitoring are not yet documented as complete.
- No secrets, API keys, service account files, local `.env` files, or database dumps should be committed.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Command Reference](docs/COMMAND_REFERENCE.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Environment Reference](docs/ENVIRONMENT.md)
- [Production Readiness](docs/PRODUCTION_READINESS.md)
- [Prediction Serving](docs/PREDICTION_SERVING.md)
- [Expected-Points Baseline](docs/EXPECTED_POINTS_BASELINE.md)
- [PostgreSQL Foundation](docs/DATABASE.md)
- [Databricks Lakehouse Pipeline](docs/DATABRICKS.md)

## License

MIT License - see [LICENSE](LICENSE) for details.
