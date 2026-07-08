# Release Notes

## v0.1.0 Portfolio Snapshot

Status: local demo and review-ready project snapshot. Production deployment is not yet complete.

This snapshot packages ScoutIQ as a recruiter-readable engineering portfolio project. It documents the implemented local data, model, optimizer, explanation, evaluation, and CI paths without claiming production readiness or model superiority.

## Implemented Features

- Deterministic public FPL ingestion for bootstrap, fixtures, and player gameweek history.
- PostgreSQL schema and loaders for normalized FPL data, prediction runs, player predictions, and model evaluations.
- Lakehouse-style Bronze, Silver, and Gold data transformations with local JSONL execution.
- Expected-points feature generation, training, walk-forward backtesting, prediction output, and model tests.
- Prediction-serving API routes with run metadata for traceability.
- Constraint-based optimizer routes for squad generation, starting XI, bench order, captaincy, and transfers.
- React demo pages for squad workflows, optimizer recommendations, explanation-agent transparency, and model evaluation.
- Controlled recommendation explanation endpoint with schema validation, grounding checks, optional provider mode, and deterministic fallback.
- Evaluation dashboard showing model metrics, baseline comparison, data coverage, recent runs, and setup warnings.
- Local demo workflow, smoke-test helper, and GitHub Actions CI.

## Validation Commands

Run from the repository root:

```powershell
pnpm.cmd run build
pnpm.cmd run build:api
pnpm.cmd run build:web
pnpm.cmd run test:api
pnpm.cmd run test:smoke
pnpm.cmd run pipeline:test
pnpm.cmd run model:test
git status
```

For a full local data refresh before a demo:

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

Then run:

```powershell
pnpm.cmd run smoke:app
```

## Known Limitations

- The expected-points model is not clearly better than the historical baseline across tracked metrics.
- Current public FPL data does not include full tactical, private injury, training, or team-news context.
- Prediction-backed optimizer screens require generated and loaded prediction rows in PostgreSQL.
- Local model, prediction, and evaluation artifacts live under gitignored `data/` paths and are not committed.
- The explanation agent explains optimizer output only. It does not make recommendation decisions.
- Chip strategy is not implemented.
- Live provider mode requires private local credentials and remains optional.
- Production deployment, scheduled ingestion, production monitoring, and production migration workflows are not yet complete.

## Safe Claims

- ScoutIQ uses deterministic ingestion from public FPL API data.
- ScoutIQ stores normalized records and prediction outputs in PostgreSQL.
- ScoutIQ includes leakage-aware feature and backtest design for expected-points modelling.
- ScoutIQ compares model output against a historical baseline and reports mixed results honestly.
- ScoutIQ uses deterministic, constraint-based optimizer logic for recommendations.
- ScoutIQ can run locally without an OpenAI API key through deterministic explanation fallback.
- ScoutIQ has local build, test, smoke, pipeline, model, and CI validation paths.

## Claims To Avoid

- Do not claim the model outperforms the baseline.
- Do not claim the LLM agent chooses players, transfers, captaincy, bench order, or chips.
- Do not claim production deployment is complete.
- Do not claim predictions are guaranteed outcomes.
- Do not imply screenshots exist until real files are committed under `docs/assets/screenshots/`.
- Do not claim private injury, tactical, or market-intelligence data is included.

## Next Deployment-Related Work

- Define deployable boundaries for web, API, database, scheduled data jobs, and model artifacts.
- Add environment-specific deployment documentation and production migration workflow.
- Decide how generated model and prediction artifacts are promoted between environments.
- Add production monitoring for ingestion freshness, prediction freshness, optimizer errors, and agent fallback rates.
- Capture real screenshots after a validated local demo run.
