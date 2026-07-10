# ScoutIQ Résumé Evidence

This document distinguishes code that is present and tested from local data artifacts that are intentionally gitignored. It is an audit of the repository on 2026-07-10, not a claim of production deployment or live cloud use.

## Reproducible metrics

Run this after creating the normal local pipeline artifacts:

```sh
# macOS/Linux
python3 scripts/generate_resume_metrics.py

# Windows PowerShell
python scripts/generate_resume_metrics.py
```

It writes the ignored `artifacts/resume_metrics.json`. The script reads only these canonical local files:

| Metric | Canonical input |
| --- | --- |
| Player, team, gameweek, fixture counts | `data/fpl/latest/manifest.json` → `recordCounts` |
| Historical player-gameweek rows | `data/features/player_gameweek_training_rows.jsonl` |
| Evaluated rows, MAE, RMSE, and baseline metrics | `data/evaluation/expected_points_backtest.json` |

If an input is absent, the matching output value is `null`; the script does not use README values, test fixtures, mock data, or live API calls. In this audit workspace all three inputs were absent. Therefore the uncommitted claims `841` players, `20` teams, `38` gameweeks, `380` fixtures, `29,747` training rows, and `28,352` backtest rows are **not independently reproducible from the checkout**. The latter three figures occur in API test fixtures; test fixtures are not evidence of a historical run.

Run the extractor test with:

```sh
python3 -m unittest scripts/test_generate_resume_metrics.py
```

## Claim audit

| Claim | Verdict | Direct evidence | Required qualification |
| --- | --- | --- | --- |
| End-to-end platform using TypeScript, React, PostgreSQL, and Python to ingest/model 841 players, 20 teams, 38 gameweeks, and 380 fixtures | PARTIALLY VERIFIED | TypeScript Express API: `apps/api/src/index.ts`; React app: `apps/web/src/App.tsx`; PostgreSQL schema: `db/migrations/001_fpl_foundation.sql`; FPL ingestion: `apps/api/src/ingestion/ingest.ts`; Python pipeline: `pipelines/expected_points/features.py` | The stack and ingestion/model paths are implemented. State counts only when `artifacts/resume_metrics.json` from the relevant snapshot supplies them; no canonical snapshot is committed here. |
| Deterministic ingestion and Bronze/Silver/Gold transformations with idempotent PostgreSQL upserts, typed endpoints, and migration checksum validation | VERIFIED | Deterministic snapshot/load-plan tests: `apps/api/src/ingestion/normalizers.test.ts`, `apps/api/src/db/fplLoadPlan.test.ts`; layers: `pipelines/databricks/transforms.py`; conflict-upsert loader: `apps/api/src/db/fplLoader.ts`; Zod route schemas: `apps/api/src/routes/*.ts`; checksum guard: `apps/api/src/db/migrate.ts` | Say “lakehouse-style” and “PostgreSQL upserts”; do not imply a managed lakehouse or a database migration run unless one is recorded. |
| Leakage-safe expected-points features and backtesting on 29,747 rows, evaluating 28,352 rows using MAE/RMSE versus a historical baseline | PARTIALLY VERIFIED | Prior-only feature construction and validation: `pipelines/expected_points/features.py`; strict walk-forward split and metrics: `pipelines/expected_points/evaluation.py`; coverage tests: `pipelines/expected_points/tests/test_expected_points.py` | Leakage controls, walk-forward evaluation, MAE/RMSE, and a baseline are implemented/tested. The exact row counts and reported metric values require a generated local artifact; they are not present in this checkout. |
| Rule-validated squad, transfer, and captaincy optimization plus a controlled LLM explanation layer with structured JSON validation and fallback handling | VERIFIED | Rules and deterministic selection: `apps/api/src/optimizer/rules.ts`, `startingXi.ts`, `transfers.ts`, `squadBuilder.ts`; test coverage: `apps/api/src/optimizer/*.test.ts`; strict JSON schema, grounding, and fallback: `apps/api/src/agent/explanationService.ts`, `schemas.ts`, `fallbackExplanation.ts` and their tests | “LLM explanation layer” is accurate. It explains already-created optimizer results and is not a decision-maker. |

## Technology audit

| Technology | Assessment | Evidence / qualification |
| --- | --- | --- |
| Python | Verified | Pipeline and model code under `pipelines/`; 21 Python unit tests passed in this audit. |
| SQL | Verified | PostgreSQL migrations under `db/migrations/`. |
| TypeScript | Verified | API, optimizer, ingestion, and frontend source; API build/tests passed. |
| JavaScript | Verified | Node smoke and development helpers under `scripts/`. |
| PostgreSQL | Verified | `pg` client, schema migrations, loaders, queries, and Docker Compose service. This audit did not start a database. |
| React | Verified | `apps/web` React/Vite application build passed. |
| REST APIs | Verified | Express routes under `apps/api/src/routes`; ingestion calls the public FPL HTTP API. |
| ETL pipelines / data ingestion / data modeling | Verified | Typed FPL normalization, metadata-preserving ingestion, Bronze/Silver/Gold transformations, and relational schema. |
| Docker | Verified | `docker-compose.yml` defines the PostgreSQL development service; not run during this audit. |
| GitHub Actions CI | Verified | `.github/workflows/ci.yml` builds and tests on pull requests and `dev` pushes. |
| Model evaluation | Verified | Walk-forward split, MAE/RMSE, historical baseline in `pipelines/expected_points/evaluation.py`. |
| Optimization | Verified | Deterministic FPL squad, XI, captaincy, and transfer logic with tests. |
| Structured LLM output validation | Verified | Strict JSON schemas, Zod parsing, grounded player-reference checks, and deterministic fallback tests. |
| scikit-learn | Unsupported | No repository imports or model use. An environment installation is not project evidence. |
| pandas | Unsupported | No repository imports or model use. |
| FastAPI | Unsupported | The API is Express, not FastAPI. |
| PySpark | Partially verified | `pipelines/databricks/spark_io.py` implements a Spark writer and CLI path, but PySpark is not locked/installed and was not run in this audit. |
| Databricks | Unsupported | No notebooks, jobs, Asset Bundles, or execution evidence. The code is only documented as compatible. |
| Microsoft Azure | Partially verified | Optional Azure OpenAI explanation-provider adapter is implemented and mock-tested. No Azure deployment or actual Azure use is evidenced. |

## Résumé-ready wording

Use these only with the stated scope.

- Built ScoutIQ, a local-first Fantasy Premier League decision-support platform with a TypeScript/Express API, React frontend, PostgreSQL schema/loaders, and Python feature, training, backtesting, and prediction pipelines.
- Implemented metadata-preserving public FPL ingestion and deterministic lakehouse-style Bronze/Silver/Gold transformations, with PostgreSQL load plans, conflict-upsert behavior, and checksum-guarded SQL migrations.
- Built leakage-aware, walk-forward expected-points evaluation using MAE and RMSE against a recent-points baseline; report snapshot-specific row counts and metrics only from generated local artifacts.
- Developed deterministic FPL squad, transfer, starting-XI, bench, and captaincy optimization with rule validation, plus an explanation-only LLM layer using strict JSON validation, grounding checks, and deterministic fallbacks.

### Three-bullet data-engineering version

- Built metadata-preserving FPL API ingestion and typed PostgreSQL loading for players, teams, gameweeks, fixtures, prediction runs, and evaluation records.
- Implemented deterministic Bronze/Silver/Gold JSONL transformations and leakage-aware Python features with snapshot hashes and source timestamps retained for reproducibility.
- Added walk-forward expected-points backtesting with MAE/RMSE and a historical baseline; metrics are generated from local canonical artifacts rather than hard-coded résumé values.

### Three-bullet applied-AI/software version

- Developed a React and TypeScript/Express decision-support application backed by PostgreSQL prediction-serving routes.
- Implemented deterministic, rule-validated FPL squad, transfer, starting-XI, captaincy, and bench optimization from prediction-backed candidates.
- Added an explanation-only OpenAI/Azure OpenAI integration with structured JSON schemas, grounded player references, timeouts, safe error handling, and deterministic fallback output.

## Safe Technical Skills entries

`Python, SQL, TypeScript, JavaScript, PostgreSQL, React, Express, REST APIs, ETL/Data Pipelines, Data Ingestion, Data Modeling, Docker Compose, GitHub Actions, Model Evaluation, Constraint Optimization, Structured LLM Output Validation`

Do not list `scikit-learn`, `pandas`, `FastAPI`, or `Databricks` for ScoutIQ. List `PySpark` only after installing it and running the Spark path against project data; list Azure only as an optional Azure OpenAI integration unless an actual Azure deployment is demonstrated.

## Remaining high-value improvements

1. Preserve a versioned, non-sensitive data manifest/evaluation summary (or CI-generated artifact) so historic row counts and metrics are independently auditable without committing raw data.
2. Add an ephemeral PostgreSQL integration-test service to exercise migrations, checksum mismatches, and actual `ON CONFLICT` upserts rather than only load-plan tests.
3. Add PySpark as an explicitly managed optional dependency and run its writer against a representative canonical fixture in CI before claiming Spark experience; add Databricks assets only after a real workspace execution is in scope.
