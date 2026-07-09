# Local Demo Walkthrough

This walkthrough is for reviewers who want to run ScoutIQ locally, verify the API and web app, and understand what the demo proves.

For a complete package script list, see [Command Reference](COMMAND_REFERENCE.md).

## Prerequisites

- Node.js with `pnpm.cmd` available on Windows
- Docker Desktop or another Docker engine with Compose support
- Python available as `python` for the data pipeline and model commands

The OpenAI API key is optional. The local fallback explanation path works without provider credentials.

## Start From A Clean Checkout

```powershell
pnpm.cmd install
if (!(Test-Path .env)) { Copy-Item .env.example .env }
if (!(Test-Path apps\api\.env)) { Copy-Item apps\api\.env.example apps\api\.env }
```

Do not put real secrets in committed files. Keep private values in local `.env` files only.

## Start PostgreSQL

```powershell
docker compose up -d postgres
docker compose ps
```

The default database URL is:

```text
postgresql://scoutiq:scoutiq@localhost:5432/scoutiq
```

If port 5432 is already in use, change `POSTGRES_PORT` in the local `.env` file and update the API database URL to match.

## Prepare Data

Run the schema, official FPL ingestion, expected-points pipeline, backtest, prediction generation, and prediction load:

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

If Python is unavailable, the app can still start, but the evaluation dashboard and prediction-backed optimizer screens will show setup or missing-data states until the pipeline artifacts are generated and loaded.

## Start The App

Run the normal local demo services:

```powershell
pnpm.cmd run dev:app
```

This starts only:

- API: `http://localhost:3001`
- Web app: `http://localhost:3000`

It does not start the optional ML service. Use `pnpm.cmd run dev:ml` separately only when working on that service.

## Verify With The Smoke Test

In a second terminal, run:

```powershell
pnpm.cmd run smoke:app
```

The smoke test checks:

- `http://localhost:3001/api/health`
- `http://localhost:3001/api/agent/status`
- `http://localhost:3001/api/evaluation/latest`
- `http://localhost:3000/`
- `http://localhost:3000/evaluation`
- `http://localhost:3000/analyze`

The expected result is `Smoke test passed.`

## Demo Click Path

Open `http://localhost:3000`.

Review these pages:

- Home: confirms the web app loads and can reach the API health endpoint.
- Squad Builder: supports prediction-backed player search, FPL rule validation, and manual analysis using backend default scoring weights.
- Top Players: shows top expected-points rows from PostgreSQL prediction serving and does not require the optional ML service.
- Team Analysis: shows the squad analysis workflow and prediction-backed optimizer recommendation area when a complete squad and prediction data are available.
- Evaluation: shows latest walk-forward backtest data, baseline comparison, coverage, recent runs, limitations, and setup warnings when data is missing.

Direct URLs:

```text
http://localhost:3000
http://localhost:3000/squad
http://localhost:3000/top-players
http://localhost:3000/evaluation
http://localhost:3001/api/health
```

## How To Explain Fallback Mode

The recommendation itself is produced by deterministic optimizer logic. The explanation endpoint can summarize an optimizer result.

Without an OpenAI or Azure OpenAI key, `GET /api/agent/status` should report deterministic fallback mode. That is the expected local demo path and does not require provider credentials.

To test provider-ready status locally, keep real values only in local `.env` files:

```powershell
SCOUTIQ_AGENT_ENABLED=true
SCOUTIQ_AGENT_PROVIDER=openai
OPENAI_API_KEY=<private key>
OPENAI_MODEL=<model name>
```

The API status response must not expose the key.

## How To Explain The Evaluation Dashboard

The dashboard is a transparency surface, not a claim that the model is always superior. MAE and RMSE are error metrics, so lower is better. The app should only state that the model is clearly better when it is lower than the baseline on both tracked metrics.

If no evaluation rows are loaded, the dashboard should show setup commands and warnings instead of pretending that model quality is known.

## Troubleshooting

If ports are busy, stop the process using them or configure alternate ports before starting the demo:

```powershell
Get-NetTCPConnection -LocalPort 3000,3001,5432 -State Listen -ErrorAction SilentlyContinue
```

If `pnpm.cmd run dev:app` starts the API but Vite reports an access-denied error while resolving `apps\web\vite.config.ts`, rerun the command from a normal PowerShell terminal outside restricted sandbox environments.

If the smoke test fails on `/api/evaluation/latest`, confirm Postgres is running and the migrations have been applied:

```powershell
docker compose ps
pnpm.cmd run db:migrate
```

If the evaluation page loads but reports missing data, rerun the data preparation commands in this guide.
