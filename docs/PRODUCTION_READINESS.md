# Production Readiness

ScoutIQ is not currently documented as a deployed application. This checklist defines the evidence needed before calling a deployment ready for reviewers or external traffic.

## Readiness Checklist

- [ ] CI is green for the target branch.
- [ ] `pnpm.cmd run build` passes locally or in CI.
- [ ] `pnpm.cmd run build:api` passes locally or in CI.
- [ ] `pnpm.cmd run build:web` passes locally or in CI.
- [ ] `pnpm.cmd run test:api` passes locally or in CI.
- [ ] `pnpm.cmd run test:smoke` passes locally or in CI.
- [ ] `pnpm.cmd run pipeline:test` passes locally or in CI.
- [ ] `pnpm.cmd run model:test` passes locally or in CI.
- [ ] PostgreSQL is provisioned and reachable from the API service.
- [ ] Database migrations have run against the target database.
- [ ] Current FPL data has been ingested and loaded into PostgreSQL.
- [ ] Expected-points feature, training, backtest, and prediction commands have run successfully.
- [ ] Prediction and evaluation artifacts have been loaded into PostgreSQL.
- [ ] `GET /api/health` returns a healthy response from the deployed API.
- [ ] `GET /api/agent/status` works without exposing provider secrets.
- [ ] Agent fallback mode works without an OpenAI or Azure OpenAI key.
- [ ] Optional live LLM mode has been tested with a private key before enabling it for demos.
- [ ] No secrets, local `.env` files, service account files, or database dumps are committed.
- [ ] `FRONTEND_URL` is configured for the deployed frontend origin.
- [ ] Frontend `/api` routing is configured for the deployed API.
- [ ] Database backups or provider recovery settings have been considered.
- [ ] Scheduled data refresh is planned before relying on live-season recommendations.
- [ ] Deployment logs and error rates are monitored by the hosting platform.
- [ ] Known deployment blockers and open questions are listed before a public deployment claim is made.

## Required Evidence

Capture command output or CI links for:

```powershell
pnpm.cmd run build
pnpm.cmd run build:api
pnpm.cmd run build:web
pnpm.cmd run test:api
pnpm.cmd run test:smoke
pnpm.cmd run pipeline:test
pnpm.cmd run model:test
git diff --check
```

Capture deployed endpoint checks for:

```text
GET /api/health
GET /api/agent/status
GET /api/evaluation/latest
```

Capture frontend checks for:

- root page loads
- evaluation page loads
- squad search returns prediction-backed candidates or a clear missing-data state
- squad analysis returns deterministic optimizer output or a clear missing-data state
- explanation panel reports deterministic fallback or provider-ready mode

## Required Production State

Before a production-like demo, the database should contain:

- normalized FPL teams, players, gameweeks, and fixtures
- ingestion run metadata
- prediction run metadata
- player prediction rows
- model evaluation rows

The API should serve these records from PostgreSQL. The frontend should not depend on mock recommendation data, removed legacy services, or local-only files in normal web serving.

## Claims Boundary

Production readiness does not mean the app has been deployed, that the expected-points model is better than the baseline, or that an LLM is making recommendations.

The current recommendation decision path remains deterministic optimizer logic. The optional provider-backed agent only explains existing optimizer outputs, and deterministic fallback is a valid mode when provider credentials are absent.

## Current deployment blockers / open questions

These items are grounded in the current repository state and should be resolved or explicitly accepted before claiming ScoutIQ is live:

- Production CORS must be configured. `apps/api/src/index.ts` defaults `FRONTEND_URL` to `http://localhost:3000`, so a deployed frontend origin must be set for the API service.
- Frontend API routing must be decided. `apps/web/src/lib/api.ts` currently sends relative `/api` requests, so separate frontend/API hosts need a platform rewrite or a code change before deployment.
- Database migrations are manual. The repo has `pnpm.cmd run db:migrate`, but no deployment hook currently guarantees migrations run before the API starts.
- Prediction and evaluation data loading is manual. The API expects prediction and evaluation rows in PostgreSQL, while the generation and `db:load:predictions` steps are batch commands outside web serving.
- Scheduled data refresh is not implemented in the repo. Ingestion, history ingestion, feature generation, backtesting, prediction generation, and database loading need a scheduler or an agreed manual runbook.
- `docker-compose.yml` provisions local PostgreSQL only. It is not a production app stack for the API, frontend, or scheduled jobs.
- Production database SSL and backup settings depend on the selected provider. `DATABASE_SSL` is available, but provider-specific requirements still need to be set.
- Live LLM mode is not validated by CI. CI disables provider use, so OpenAI or Azure OpenAI mode must be tested privately with real secrets before it is enabled for a demo.
- The current expected-points model is not clearly better than the historical baseline. Deployment docs and demos must not claim model superiority unless future evaluation artifacts support it.
- Portfolio screenshots are still not committed. This is not a runtime deployment blocker, but README-linked screenshots should wait until real files exist under `docs/assets/screenshots/`.

## Deployment Smoke Test Plan

Set deployment targets before running the existing smoke helper:

```powershell
$env:SCOUTIQ_API_URL="https://<api-host>"
$env:SCOUTIQ_WEB_URL="https://<frontend-host>"
pnpm.cmd run smoke:app
```

The current smoke helper checks:

- `GET /api/health`
- `GET /api/agent/status`
- `GET /api/evaluation/latest`
- frontend root
- `/evaluation`
- `/analyze`

Run these additional manual checks after deployment:

1. Open the frontend root and confirm the app loads without browser console API-routing errors.
2. Open `/evaluation` and confirm it shows loaded evaluation data or a clear missing-data state.
3. Open `/squad`, search for a player, and confirm search returns prediction-backed candidates or a clear missing-data state.
4. Analyze a valid selected squad and confirm deterministic optimizer recommendations appear when prediction rows are loaded.
5. Trigger the explanation panel and confirm it reports deterministic fallback or provider-ready mode without exposing provider secrets.
6. Call `GET /api/evaluation/data-health` to confirm data coverage and freshness signals are available.
7. Review API and frontend host logs for startup errors, CORS failures, database connection failures, and provider configuration warnings.
