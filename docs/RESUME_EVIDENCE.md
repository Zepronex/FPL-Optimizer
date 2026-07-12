# ScoutIQ Résumé Evidence

This document owns verified metrics and qualified technical claims for ScoutIQ. It separates code presence, local validation, and a recorded Databricks portfolio run from claims that would require a live production deployment.

## Reproduce Local Evidence

```sh
pnpm run resume:metrics
pnpm run resume:metrics:test
```

The generated, ignored `artifacts/resume_metrics.json` reads canonical local manifests, feature rows, and backtest results. Metrics in that artifact depend on the locally generated snapshot and are not hard-coded into the repository.

## Recorded Databricks Run

The separate Databricks evidence below came from a full public FPL snapshot, not the committed test fixture. The snapshot SHA-256 was `b4cf811ba886c26c65de2d17c6b071776dee018c1e39b08aa2e853f1f34671e7`; its metadata recorded `dataset_type=public-fpl` and `is_test_fixture=false`.

The four-task Job ran on 2026-07-11 from 11:21:35 UTC through 11:32:53 UTC. Bronze, Silver, Gold, and Evaluation completed successfully. SQL queries and Unity Catalog metadata inspection confirmed persisted counts, metrics, managed-table status, and Delta format. Workspace URLs, identities, warehouse identifiers, and run identifiers are intentionally not recorded.

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

The snapshot was captured after gameweek 38, so no unplayed fixtures existed and both current/upcoming Gold tables correctly contained zero rows. Historical features and evaluation remained populated.

Walk-forward evaluation covered gameweeks 5–38 and used only earlier gameweeks for correction terms. The recent-points comparison baseline recorded MAE `1.0473` and RMSE `2.1120`; the rule-based expected-points variant recorded MAE `1.0570` and RMSE `2.0508`. The variant improved RMSE but not MAE. These are full-snapshot portfolio metrics, not a claim of general model superiority.

## Claim Audit

| Claim | Verdict | Direct evidence | Required qualification |
| --- | --- | --- | --- |
| End-to-end TypeScript, React, PostgreSQL, Python, and Databricks portfolio platform | Verified | `apps/api`, `apps/web`, migrations, pipelines, bundle resources, local builds/tests, and the recorded remote Job | PostgreSQL is the serving path; Databricks is offline transformation/evaluation. The application is not claimed as production-deployed. |
| Reproducible public-FPL PySpark medallion pipeline using managed Delta | Verified | Snapshot packager, PySpark tasks, keyed writes, bundle resources, and 19 inspected managed Delta tables | The full snapshot is ignored; the committed fixture is small and test-only. |
| Leakage-aware walk-forward evaluation with baseline comparison | Verified | Prior-only transforms/tests and 26,262 persisted predictions across gameweeks 5–38 | Report both metrics: RMSE improved and MAE regressed. |
| Deterministic optimization plus explanation-only LLM integration | Verified in code and local tests | Optimizer, agent schemas, grounding checks, timeouts, and deterministic fallback tests | The LLM explains; it does not select the squad. Live provider deployment is not demonstrated. |
| API security hardening | Implemented and locally tested | Global/expensive rate limiters, strict schemas, bounded request parsing, CORS/Helmet controls, centralized configuration, and security-focused API tests | This is a secure-engineering pass, not formal penetration testing or certification. The public API remains unauthenticated. |
| GitHub Actions validation | Configured | `.github/workflows/ci.yml` and locally runnable commands | No successful hosted CI run is claimed unless a specific run is inspected separately. |

## Technology Evidence

| Technology | Evidence and qualification |
| --- | --- |
| PySpark | Exactly pinned development dependency, local Spark transformation tests, and completed deployed DataFrame tasks on the full public snapshot |
| Databricks | Bundle validation/deployment and complete four-task serverless Job recorded on 2026-07-11 |
| Delta Lake | All 19 outputs inspected as managed Delta tables; first creation and keyed repeat-write paths are implemented |
| Unity Catalog | Managed schema, Volume, and tables used by the recorded run |
| PostgreSQL | Migrations, checksum guard, typed loaders, parameterized access, and API tests; no production database deployment is claimed |
| React / Express / TypeScript | Implemented frontend and API builds with typed request/response boundaries |
| GitHub Actions | Least-privilege workflow is present; hosted status is not asserted here |
| Azure OpenAI | Optional adapter is implemented and mock-tested; no live Azure deployment is claimed |

ScoutIQ does not use pandas, scikit-learn, or FastAPI; those technologies should not be attributed to this project.

## Résumé-Safe Bullets

- Deployed a reproducible public-FPL medallion pipeline to Databricks Free Edition using a Declarative Automation Bundle and four dependent serverless Job tasks, producing 19 managed Unity Catalog Delta tables.
- Engineered PySpark Bronze/Silver/Gold transformations with deterministic deduplication, source lineage, keyed Delta writes, and leakage-safe prior-gameweek features across 29,747 player-gameweek-fixture records and 29,338 Gold player-gameweek rows.
- Built walk-forward expected-points evaluation over 26,262 predictions and 34 gameweeks, recording RMSE 2.0508 versus a 2.1120 recent-points baseline and MAE 1.0570 versus 1.0473, with overall, position, and provenance metrics persisted in Delta.
- Hardened an Express/React portfolio application with strict schema validation, bounded requests, layered per-IP rate limits, centralized server configuration, security headers, and automated security-focused tests.

## Claim Boundaries

- Say "deployed Databricks portfolio pipeline," not "production application."
- Say "managed Delta tables verified in one recorded run," not "production lakehouse SLA."
- Report both MAE and RMSE; do not claim the expected-points model beat the baseline overall.
- Describe the provider layer as optional, explanation-only, and mock-tested unless a live provider run is separately evidenced.
- Describe GitHub Actions as configured unless a hosted run has actually been inspected.
- Describe the security work as implementation hardening and automated testing, not penetration testing, certification, or proof of complete security.
