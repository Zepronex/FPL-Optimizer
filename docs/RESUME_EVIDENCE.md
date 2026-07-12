# ScoutIQ Résumé Evidence

This document audits repository code, local tests, and the successful Databricks Free Edition execution completed on 2026-07-11. ScoutIQ is a deployed portfolio/data-engineering pipeline, not a production deployment.

## Reproducible evidence

Local metrics remain generated rather than hard-coded:

```sh
python3 scripts/generate_resume_metrics.py
python3 -m unittest scripts/test_generate_resume_metrics.py
```

The ignored `artifacts/resume_metrics.json` reads canonical local FPL manifests, feature rows, and backtest results. The separate Databricks evidence below came from a full public snapshot uploaded to a managed Unity Catalog Volume. Its SHA-256 snapshot hash was `b4cf811ba886c26c65de2d17c6b071776dee018c1e39b08aa2e853f1f34671e7`; it was recorded as `dataset_type=public-fpl` and `is_test_fixture=false`.

The deployed four-task Job ran from 2026-07-11 11:21:35 UTC through 11:32:53 UTC. Bronze, Silver, Gold, and Evaluation all terminated successfully. Independent SQL queries and Unity Catalog metadata inspection confirmed the persisted row counts, metrics, managed-table status, and Delta format. Workspace URLs, identities, warehouse identifiers, and run identifiers are intentionally not recorded in the repository.

## Remote Databricks results

| Layer | Verified output rows |
| --- | ---: |
| Bronze manifest / source metadata | 1 / 2 |
| Bronze players / teams / gameweeks / fixtures | 841 / 20 / 38 / 380 |
| Bronze player-gameweek-fixture history | 29,747 |
| Silver players / teams / gameweeks / fixtures | 841 / 20 / 38 / 380 |
| Silver player-gameweek-fixture history | 29,747 |
| Gold historical features / outcomes | 29,338 / 29,338 |
| Gold current player-gameweek / team-fixture features | 0 / 0 |
| Evaluation predictions / metric rows / run summaries | 26,262 / 10 / 1 |

The snapshot was captured after gameweek 38, so no unplayed fixtures existed and both current/upcoming Gold tables correctly contained zero rows. Historical features and evaluation remained fully populated.

Walk-forward evaluation used gameweeks 5–38 (34 gameweeks) and only earlier gameweeks for correction terms. The recent-points baseline had MAE `1.0473` and RMSE `2.1120`; the rule-based expected-points variant had MAE `1.0570` and RMSE `2.0508`. The expected-points variant improved RMSE but not MAE. These are full public-snapshot metrics, not committed-fixture results.

## Claim audit

| Claim | Verdict | Direct evidence | Required qualification |
| --- | --- | --- | --- |
| End-to-end TypeScript, React, PostgreSQL, Python, and Databricks portfolio platform | VERIFIED | `apps/api`, `apps/web`, `db/migrations`, `pipelines/expected_points`, `src/scoutiq_databricks`; local builds/tests and the successful remote Job | PostgreSQL remains the serving path; Databricks is the transformation and analytics layer. Do not call it production-deployed. |
| Reproducible public-FPL Bronze/Silver/Gold pipeline using PySpark and managed Delta tables | VERIFIED | `scripts/prepare_databricks_snapshot.py`, `src/scoutiq_databricks/{bronze,silver,gold}.py`, `databricks.yml`, `resources/scoutiq_job.yml`; 19 managed Delta tables inspected after the successful run | The full snapshot is gitignored; a small labeled public fixture is committed only for tests. |
| Leakage-aware walk-forward expected-points evaluation with MAE/RMSE and recent-points baseline | VERIFIED | `src/scoutiq_databricks/evaluation.py`, PySpark leakage/evaluation tests, 26,262 persisted predictions and 10 persisted metric rows | Report both MAE and RMSE: the variant improved RMSE but not MAE. |
| Deterministic optimization plus explanation-only LLM integration | VERIFIED | `apps/api/src/optimizer`, `apps/api/src/agent`, structured-schema and fallback tests | The LLM explains optimizer results; it does not choose the squad. |

## Technology audit

| Technology | Verdict | Direct evidence / qualification |
| --- | --- | --- |
| PySpark | VERIFIED | Pinned `pyspark==3.5.7`; nine local Spark tests passed; deployed Spark DataFrame transformations completed on the full public snapshot. |
| Databricks | VERIFIED | CLI authentication succeeded; bundle deployed; the complete four-task serverless Job succeeded; outputs were independently inspected. |
| Delta Lake | VERIFIED | All 19 output tables were inspected as managed `DELTA` tables; code uses `saveAsTable` for first creation and keyed SQL `MERGE` for repeat writes. |
| Unity Catalog | VERIFIED | Managed schema, managed Volume, and 19 managed tables were created and read in catalog `workspace`. |
| Databricks Jobs | VERIFIED | Bronze, Silver, Gold, and Evaluation task states were all `TERMINATED/SUCCESS` with explicit dependencies. |
| Declarative Automation Bundles | VERIFIED | `databricks.yml` and `resources/scoutiq_job.yml` passed normal and strict validation, deployed, and launched the successful Job. |
| PostgreSQL | VERIFIED | `pg` client, migrations, checksum guard, typed loaders, conflict-upsert plans, and API tests. No claim is made that a production PostgreSQL instance was deployed. |
| GitHub Actions | VERIFIED | `.github/workflows/ci.yml` installs Java/Python/PySpark and runs API, frontend, pipeline, model, snapshot, résumé, and Spark checks. Local equivalents passed; no hosted-run status is claimed here. |
| Python / SQL / TypeScript / React / Express | VERIFIED | Implemented across the data pipelines, migrations, API, optimizer, and frontend; applicable local builds/tests passed. |
| scikit-learn / pandas / FastAPI | NOT SUPPORTED | ScoutIQ does not use these technologies. |
| Microsoft Azure | PARTIALLY VERIFIED | Optional Azure OpenAI adapter is implemented and mock-tested, but no Azure deployment or live Azure execution was demonstrated. |

## Three exact data-engineering résumé bullets

- Deployed a reproducible public-FPL medallion pipeline to Databricks Free Edition using a Declarative Automation Bundle and four dependent serverless Job tasks, producing 19 managed Unity Catalog Delta tables.
- Engineered PySpark Bronze/Silver/Gold transformations with deterministic deduplication, source lineage, keyed Delta MERGE writes, and leakage-safe prior-gameweek features across 29,747 player-gameweek-fixture records and 29,338 Gold player-gameweek rows.
- Built walk-forward expected-points evaluation over 26,262 predictions and 34 gameweeks, achieving RMSE 2.0508 versus a 2.1120 recent-points baseline (MAE 1.0570 versus 1.0473) and persisting overall, position, and run-provenance metrics in Delta.

## Revised Technical Skills

`Python, PySpark, SQL, TypeScript, JavaScript, Databricks, Delta Lake, Unity Catalog, Databricks Jobs, Declarative Automation Bundles, PostgreSQL, React, Express, REST APIs, ETL/Data Pipelines, Data Ingestion, Data Modeling, GitHub Actions, Docker Compose, Model Evaluation, Constraint Optimization, Structured LLM Output Validation`

Do not list `scikit-learn`, `pandas`, or `FastAPI` for ScoutIQ. Describe Azure only as an optional mock-tested integration unless a real Azure deployment is completed.

## Next highest-value improvements

1. Add a deliberate, lineage-preserving export from Gold predictions and evaluation summaries into the existing PostgreSQL serving contracts.
2. Add an ephemeral PostgreSQL integration-test service that executes migrations and real `ON CONFLICT` writes, not only load-plan tests.
3. Schedule a second-season or in-season public snapshot run so the current/upcoming Gold tables and serving export can be validated with non-zero rows.
