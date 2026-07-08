# Deployment Guide

ScoutIQ is not currently deployed. This guide describes the services, commands, and operational steps needed to deploy it without changing the local-first development workflow.

For variable details, see [Environment Reference](ENVIRONMENT.md). For release gates, see [Production Readiness](PRODUCTION_READINESS.md).

## Deployment Architecture

ScoutIQ has four deployment concerns:

- Frontend service: builds `apps/web` with Vite and serves the generated static files from `apps/web/dist`.
- API service: builds `apps/api` with TypeScript and runs the Express server from `apps/api/dist/index.js`.
- PostgreSQL database: stores normalized FPL data, prediction runs, player predictions, and model-evaluation records.
- Offline batch jobs: run ingestion, feature generation, model training/backtesting, prediction generation, and prediction loading outside the normal web-serving path.

The normal request path is:

```text
Browser -> frontend static host -> /api requests -> Express API -> PostgreSQL
```

Prediction-backed optimizer routes read already-loaded prediction rows from PostgreSQL. The optional LLM provider only explains optimizer outputs that already exist; it does not make squad, transfer, captaincy, bench, or chip decisions.

## Frontend Service

Build command:

```powershell
pnpm.cmd run build:web
```

Output directory:

```text
apps/web/dist
```

The current web client sends API requests to relative `/api` paths. A production frontend deployment therefore needs one of these patterns:

- host the API under the same origin and route `/api/*` to the API service
- add platform rewrites from `/api/*` on the frontend host to the API service
- update the web client before deployment to consume a production API base URL

## API Service

Build command:

```powershell
pnpm.cmd run build:api
```

Start command after building:

```powershell
pnpm.cmd --filter @fpl-optimizer/api run start
```

The API reads `.env` values from the repository root and `apps/api/.env` in local runs. Hosted environments should set variables through the platform secret/configuration UI instead of committing `.env` files.

The API exposes:

- `GET /api/health`
- `GET /api/agent/status`
- `GET /api/evaluation/latest`
- prediction-backed player, analyze, optimizer, and agent explanation routes

## PostgreSQL Database

Local development uses `docker-compose.yml` for PostgreSQL only. A production deployment should use a managed PostgreSQL service or an explicitly maintained database instance.

Before the API can serve prediction-backed workflows, run:

```powershell
pnpm.cmd run db:migrate
pnpm.cmd run db:load:fpl
pnpm.cmd run db:load:predictions
```

`db:migrate` applies SQL files from `db/migrations`. The data loaders populate normalized FPL tables, prediction runs, player predictions, and evaluation rows from local artifacts.

## Optional LLM Provider

The explanation agent has a deterministic fallback mode and does not require OpenAI or Azure OpenAI credentials for normal local/demo operation.

Live provider mode is optional. When enabled, provider credentials must be configured as private deployment secrets. `GET /api/agent/status` is the safe endpoint to confirm whether the API is using deterministic fallback or provider-ready mode.

## Offline Batch Pipeline

These commands should run outside normal web serving:

```powershell
pnpm.cmd run ingest:fpl
pnpm.cmd run ingest:fpl:history
pnpm.cmd run pipeline:features
pnpm.cmd run model:train
pnpm.cmd run model:backtest
pnpm.cmd run model:predict
pnpm.cmd run db:load:predictions
```

The API and frontend do not need the optional old ML service for the normal app flow. The web app can start without the batch jobs, but prediction-backed optimizer screens and the evaluation dashboard will show missing-data states until prediction and evaluation records have been generated and loaded.

## First Production Run

A first production-like setup should follow this order:

1. Provision PostgreSQL and set database connection variables for the API.
2. Build the API and frontend.
3. Run database migrations against the production database.
4. Ingest current public FPL data.
5. Load normalized FPL data into PostgreSQL.
6. Ingest public player history.
7. Generate feature rows, train, backtest, and predict.
8. Load prediction and evaluation artifacts into PostgreSQL.
9. Start the API service.
10. Deploy the frontend with `/api` routing configured.
11. Verify health, agent status, evaluation, squad search, and squad analysis.

Do not treat the app as deployed until the deployed frontend, API, database, and required data-loading steps have all been verified.

## Scheduled Jobs

The likely scheduled jobs are:

- FPL bootstrap and fixture ingestion
- player-history ingestion
- feature generation
- model training or retraining, when intentionally refreshed
- backtesting and evaluation artifact generation
- prediction generation
- prediction and evaluation load into PostgreSQL

These jobs are batch operations. They should not run inside the web request path.

## Platform Notes

Practical hosting splits:

| Concern | Suitable options | Notes |
| --- | --- | --- |
| Frontend | Vercel, Netlify | Serve `apps/web/dist`; configure `/api/*` rewrites or host API on the same origin. |
| API | Render, Railway, Fly.io | Build with `pnpm.cmd run build:api`; start with the API workspace `start` script; set database, CORS, and optional provider variables. |
| PostgreSQL | Neon, Supabase, Railway Postgres | Provide `DATABASE_URL`; enable SSL when the provider requires it. |
| Scheduled pipeline | GitHub Actions schedule, Render cron, Railway cron, manual batch run | Run ingestion, pipeline, model, prediction, and database-load commands outside request handling. |

Vercel is already partially represented by `apps/api/vercel.json`, but the API still requires production database configuration, migration execution, prediction loading, and frontend-to-API routing before it should be considered live.

## What Does Not Run In Normal Web Serving

- `pnpm.cmd run dev:ml`
- `pnpm.cmd run train:ml`
- `pnpm.cmd run predict:ml`
- ingestion commands
- lakehouse pipeline commands
- expected-points training, backtesting, and prediction commands
- database migration and loader commands

Normal web serving should run the built API, serve the built frontend, and query PostgreSQL.
