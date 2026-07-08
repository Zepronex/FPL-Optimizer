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

The API should serve these records from PostgreSQL. The frontend should not depend on mock recommendation data, the optional old ML service, or local-only files in normal web serving.

## Claims Boundary

Production readiness does not mean the app has been deployed, that the expected-points model is better than the baseline, or that an LLM is making recommendations.

The current recommendation decision path remains deterministic optimizer logic. The optional provider-backed agent only explains existing optimizer outputs, and deterministic fallback is a valid mode when provider credentials are absent.
