# Command Reference

Use these commands from the repository root. The examples use `pnpm.cmd` because this project is developed and reviewed primarily from Windows PowerShell.

## Core Local App

| Command | Purpose |
| --- | --- |
| `pnpm.cmd install` | Install workspace dependencies. |
| `pnpm.cmd run dev:app` | Start the API and web app for normal local development and demos. |
| `pnpm.cmd run dev:api` | Start only the API service. |
| `pnpm.cmd run dev:web` | Start only the web app. |
| `pnpm.cmd run dev:ml` | Start the optional ML service when working on that path. |
| `pnpm.cmd run dev:all` | Start API, web, and optional ML services together. |

`dev:app` is the default command for ScoutIQ demo work. It does not require an OpenAI API key and does not start the optional ML service.

## Smoke Checks

| Command | Purpose |
| --- | --- |
| `pnpm.cmd run smoke:app` | Check a running local API and web app. |
| `pnpm.cmd run test:smoke` | Run unit tests for the smoke-test helper script. |

`smoke:app` expects `dev:app` to already be running. It checks health, agent status, evaluation, home, evaluation page, and analyze page endpoints.

## Build And Test

| Command | Purpose |
| --- | --- |
| `pnpm.cmd run build` | Build the API and web app workspaces. |
| `pnpm.cmd run build:api` | Type-check and build the API. |
| `pnpm.cmd run build:web` | Type-check and build the web app. |
| `pnpm.cmd run test:api` | Run API unit and integration-style tests. |
| `pnpm.cmd run pipeline:test` | Run Databricks/lakehouse pipeline tests. |
| `pnpm.cmd run model:test` | Run expected-points model pipeline tests. |

For documentation-only changes, `test:smoke` and `git diff --check` are usually enough before an intermediate commit. Before merging product or data-path changes, run the relevant build and test commands above.

## CI Reproduction

GitHub Actions validates pull requests and pushes to `dev` with `.github/workflows/ci.yml`. It uses Node 20, pnpm 9, Python 3.12, and Python dependencies from `apps/ml/requirements.txt`.

CI runs without OpenAI or Azure OpenAI keys, local `.env` files, Docker, PostgreSQL, or live FPL API calls. Explanation-agent coverage uses mocked provider responses and deterministic fallback behavior.

To reproduce the CI checks locally from Windows PowerShell:

```powershell
pnpm.cmd install --frozen-lockfile
python -m pip install -r apps\ml\requirements.txt
pnpm.cmd run build
pnpm.cmd run build:api
pnpm.cmd run build:web
pnpm.cmd run test:api
pnpm.cmd run test:smoke
pnpm.cmd run pipeline:test
pnpm.cmd run model:test
```

## Database And Ingestion

| Command | Purpose |
| --- | --- |
| `docker compose up -d postgres` | Start local PostgreSQL. |
| `pnpm.cmd run db:migrate` | Apply database migrations from `db/migrations`. |
| `pnpm.cmd run ingest:fpl` | Fetch and normalize public FPL bootstrap and fixture data. |
| `pnpm.cmd run ingest:fpl:history` | Fetch public player gameweek history. |
| `pnpm.cmd run db:load:fpl` | Load normalized FPL data into PostgreSQL. |
| `pnpm.cmd run db:load:predictions` | Load generated prediction and evaluation artifacts into PostgreSQL. |

PowerShell wrappers are available in `scripts/` for migration, ingestion, and database load workflows.

## Full Data And Prediction Flow

Run this sequence when a reviewer needs a full local data refresh and prediction-backed optimizer demo:

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
pnpm.cmd run dev:app
```

Then verify from a second terminal:

```powershell
pnpm.cmd run smoke:app
```

## Pipeline And Model Commands

| Command | Purpose |
| --- | --- |
| `pnpm.cmd run pipeline:bronze` | Build source-preserving Bronze lakehouse rows. |
| `pnpm.cmd run pipeline:silver` | Build typed Silver lakehouse rows. |
| `pnpm.cmd run pipeline:gold` | Build feature-oriented Gold rows. |
| `pnpm.cmd run pipeline:features` | Build expected-points feature and training rows. |
| `pnpm.cmd run pipeline:all` | Run the lakehouse pipeline end to end. |
| `pnpm.cmd run model:train` | Train the expected-points baseline model. |
| `pnpm.cmd run model:backtest` | Run walk-forward expected-points backtesting. |
| `pnpm.cmd run model:predict` | Generate prediction rows for serving. |

Generated feature, model, evaluation, and prediction artifacts are written under gitignored `data/` paths.

## Optional Provider Configuration

The deterministic explanation fallback works without provider credentials. To test a live provider locally, keep private values only in local `.env` files:

```powershell
SCOUTIQ_AGENT_ENABLED=true
SCOUTIQ_AGENT_PROVIDER=openai
OPENAI_API_KEY=<private key>
OPENAI_MODEL=<model name>
```

Never commit real secrets, local `.env` files, service account files, or database dumps.
