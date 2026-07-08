# Release Checklist

Use this checklist before tagging, opening a portfolio PR, or updating external project material.

## Validation

- [ ] `pnpm.cmd run build`
- [ ] `pnpm.cmd run build:api`
- [ ] `pnpm.cmd run build:web`
- [ ] `pnpm.cmd run test:api`
- [ ] `pnpm.cmd run test:smoke`
- [ ] `pnpm.cmd run pipeline:test`
- [ ] `pnpm.cmd run model:test`
- [ ] `git status`

## Local Demo

- [ ] PostgreSQL starts locally with `docker compose up -d postgres`.
- [ ] Migrations run with `pnpm.cmd run db:migrate`.
- [ ] FPL data is ingested and loaded.
- [ ] History data is ingested.
- [ ] Feature, train, backtest, predict, and prediction-load steps complete.
- [ ] `pnpm.cmd run dev:app` starts API and web.
- [ ] `pnpm.cmd run smoke:app` passes against the running local app.

## Screenshots

- [ ] Real screenshots are captured from the running local app.
- [ ] `docs/assets/screenshots/home.png`
- [ ] `docs/assets/screenshots/optimizer-result.png`
- [ ] `docs/assets/screenshots/explanation-agent.png`
- [ ] `docs/assets/screenshots/evaluation-dashboard.png`
- [ ] Optional: `docs/assets/screenshots/ci-green.png`
- [ ] Screenshots show no secrets, tokens, keys, private browser details, or private local environment values.
- [ ] README image links are added only for screenshot files that actually exist.

## Claims Review

- [ ] README claims match current code, docs, and validation evidence.
- [ ] Demo script does not claim model superiority.
- [ ] Release notes describe the current model as not clearly better than baseline.
- [ ] CV bullets are checked against repo reality before reuse.
- [ ] LLM wording says explanation-only, not recommendation-making.
- [ ] Optimizer wording says deterministic and constraint-based.
- [ ] Deployment wording does not claim production deployment is complete.

## Security And Artifacts

- [ ] No `.env` files are staged.
- [ ] No API keys, tokens, credentials, service account files, or database dumps are staged.
- [ ] Generated local `data/` artifacts are not staged unless a future task explicitly changes the artifact policy.
- [ ] Screenshot files do not expose secrets or private local configuration.

## Deployment Blockers

- [ ] Web, API, database, workers, and model artifacts have clear deployment boundaries.
- [ ] Production migration workflow is defined.
- [ ] Scheduled ingestion and prediction refresh are defined.
- [ ] Monitoring is planned for ingestion freshness, prediction freshness, optimizer errors, and agent fallback rates.
- [ ] Secrets and environment-variable handling are documented for the target platform.
