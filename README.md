# ScoutIQ

[![CI](https://github.com/Zepronex/FPL-Optimizer/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/Zepronex/FPL-Optimizer/actions/workflows/ci.yml)

ScoutIQ is an AI and data engineering project for Fantasy Premier League decision support. It combines official FPL data ingestion, PostgreSQL storage, feature engineering, expected-points modelling, deterministic optimization, and controlled recommendation explanations into one local-first demo.

The project exists to show how a sports decision platform can be built with reproducible data pipelines and transparent model evaluation instead of opaque recommendations. It is designed as a recruiter-readable engineering portfolio project for junior AI, data, and software roles.

## What It Solves

Fantasy sports recommendations are only useful when the data, model quality, constraints, and failure modes are visible. ScoutIQ focuses on:

- collecting and normalizing public FPL data in a repeatable way
- preparing leakage-aware features for expected-points modelling
- comparing model output against a simple baseline before using predictions
- generating squads, transfers, starting XI, captaincy, and bench order through deterministic constraints
- explaining optimizer output without allowing an LLM to make decisions
- showing local health, pipeline, evaluation, and fallback status for reviewers

The current model is transparent but not clearly better than the historical baseline. The latest backtest snapshot is mixed: `mae=1.0925` versus `baseline_mae=1.0366`, and `rmse=2.0246` versus `baseline_rmse=2.1458` across `28352` rows. ScoutIQ reports that honestly instead of claiming model superiority.

## Architecture At A Glance

ScoutIQ is split into separate layers:

- `apps/web`: React and Vite frontend for squad workflows, top-player projections, optimizer recommendations, agent transparency, and the evaluation dashboard
- `apps/api`: Express and TypeScript API for ingestion, database loading, prediction serving, optimizer endpoints, agent explanations, health checks, and evaluation routes
- `db/migrations`: PostgreSQL schema for normalized FPL records, prediction runs, player predictions, and model evaluations
- `pipelines/databricks`: local JSONL and Databricks-compatible Bronze/Silver/Gold transformations
- `pipelines/expected_points`: feature generation, baseline training, walk-forward backtesting, prediction output, and model tests
- `scripts`: Windows-friendly local demo, smoke-test, ingestion, migration, and database load helpers

Data flows from the public FPL API into normalized local JSON, then into PostgreSQL. Pipeline jobs create feature rows and model artifacts. Prediction rows are loaded back into PostgreSQL, where the API serves them to deterministic optimizer routes. The LLM explanation layer receives already-decided optimizer output and returns validated explanatory JSON or deterministic fallback text.

## Implemented Capabilities

### Data Ingestion And Storage

- Fetches official public FPL bootstrap, fixture, and player-history data.
- Normalizes players, teams, gameweeks, fixtures, and history records with typed validation.
- Preserves source URLs, fetch timestamps, snapshot hashes, record counts, and reproducibility metadata.
- Loads normalized records into PostgreSQL through migration-backed tables.

### Lakehouse-Style Feature Pipeline

- Provides Bronze, Silver, and Gold pipeline layers under `pipelines/databricks`.
- Keeps Bronze close to source data, Silver normalized, and Gold feature-oriented.
- Supports local JSONL execution and a Databricks/Spark-compatible path.
- Keeps leakage-sensitive result fields out of current prediction features.

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

For a short recruiter or technical review, start the normal local app:

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
- Top Players: prediction-backed rows are served from PostgreSQL, not the optional legacy ML service.
- Team Analysis: a complete analyzed squad can show deterministic optimizer output for starting XI, bench order, captaincy, transfers, projected points, and constraint status.
- Recommendation explanation panel: the agent explains an optimizer result that already exists. In the default local demo, deterministic fallback mode is acceptable and expected when provider credentials are not configured.
- Model Evaluation: the dashboard shows MAE, RMSE, baseline comparison, data coverage, recent runs, setup warnings, and limitation messaging.
- API health: the backend can be checked independently from the frontend.

The optimizer makes the recommendation decisions. The LLM explanation layer, when enabled, is downstream of the optimizer and does not choose players, transfers, captaincy, bench order, or chips.

The evaluation dashboard should be read as a transparency surface. The current expected-points model is not claimed to outperform the historical baseline because MAE is worse while RMSE is better in the latest known backtest.

## Screenshots

No real portfolio screenshots are committed yet. Screenshot files should only be linked from this README after the image files exist under `docs/assets/screenshots/`.

Capture targets and filenames are documented in [Screenshot Capture Guide](docs/SCREENSHOTS.md).

## Run Locally

Prerequisites:

- Node.js with `pnpm.cmd` available on Windows
- Docker Desktop or another Docker Compose-compatible engine
- Python available as `python` for pipeline and model commands

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
pnpm.cmd run model:test
pnpm.cmd run build
pnpm.cmd run build:web
```

## Continuous Integration

GitHub Actions runs `.github/workflows/ci.yml` on pull requests and pushes to `dev`. The workflow installs Node dependencies with `pnpm`, installs Python dependencies from `apps/ml/requirements.txt`, and runs the API build, web build, API tests, smoke helper tests, pipeline tests, and expected-points model tests.

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
- Production deployment, scheduled ingestion, and production monitoring are not yet documented as complete.
- No secrets, API keys, service account files, local `.env` files, or database dumps should be committed.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Command Reference](docs/COMMAND_REFERENCE.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Environment Reference](docs/ENVIRONMENT.md)
- [Production Readiness](docs/PRODUCTION_READINESS.md)
- [Local Demo Walkthrough](docs/LOCAL_DEMO.md)
- [Reviewer Demo Walkthrough](docs/DEMO_WALKTHROUGH.md)
- [Demo Script](docs/DEMO_SCRIPT.md)
- [Screenshot Capture Guide](docs/SCREENSHOTS.md)
- [Release Notes](docs/RELEASE_NOTES.md)
- [Release Checklist](docs/RELEASE_CHECKLIST.md)
- [Prediction Serving](docs/PREDICTION_SERVING.md)
- [Expected-Points Baseline](docs/EXPECTED_POINTS_BASELINE.md)
- [PostgreSQL Foundation](docs/DATABASE.md)
- [Databricks Lakehouse Pipeline](docs/DATABRICKS.md)
- [Roadmap](docs/ROADMAP.md)

## License

MIT License - see [LICENSE](LICENSE) for details.
