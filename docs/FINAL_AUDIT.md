# Final Audit

This audit records the repository state after the final cleanup pass before a portfolio snapshot.

## Complete

- User-facing product copy uses ScoutIQ. FPL-Optimizer remains only where it is repository, package, or local path naming.
- Normal local app work runs through the API and web app with `pnpm.cmd run dev:app`.
- Normal user-facing pages do not depend on the removed legacy ranking service.
- Player search, Top Players, squad validation, and analyzed-squad workflows are prediction-backed when prediction rows are loaded into PostgreSQL.
- Recommendation decisions remain deterministic and constraint-based.
- The explanation endpoint explains optimizer output only, with schema validation and deterministic fallback behavior.
- The evaluation dashboard reports current metrics, baseline comparison, data coverage, and setup warnings without claiming model superiority.
- Release docs, command references, and local demo docs separate implemented functionality from deployment and screenshot follow-up work.

## Not Claimed

- Production deployment is complete.
- The expected-points model is clearly better than the historical baseline.
- Predictions are guaranteed outcomes.
- An LLM chooses players, transfers, captaincy, bench order, or chips.
- Chip strategy or chip recommendations are implemented.
- Real portfolio screenshots are committed.
- Optional live provider mode has been validated with private credentials in this cleanup pass.

## Known Deployment Blockers

- Production boundaries for the web app, API, database, scheduled jobs, and model artifacts still need to be defined for a target platform.
- Production migration and rollback workflow is not yet documented.
- Scheduled ingestion, feature generation, prediction refresh, and artifact promotion are not yet productionized.
- Production monitoring is still needed for ingestion freshness, prediction freshness, optimizer errors, and explanation fallback rates.
- Real screenshots still need to be captured from a validated local demo run before README image links are added.

## Safe External Claims

- ScoutIQ is a full-stack FPL decision-support project with deterministic public-data ingestion.
- ScoutIQ stores normalized FPL records, prediction runs, prediction rows, and evaluation metrics in PostgreSQL.
- ScoutIQ includes leakage-aware feature generation, model testing, walk-forward backtesting, and baseline comparison.
- ScoutIQ serves prediction-backed player search, Top Players, and squad analysis from local application APIs.
- ScoutIQ includes deterministic optimizer logic for squad, starting XI, bench, captaincy, and transfer recommendations.
- ScoutIQ includes a controlled explanation layer with schema validation and deterministic fallback.
- ScoutIQ includes local build, API test, smoke test, pipeline test, model test, and CI validation paths.

## Remaining Future Work

- Capture and commit real screenshots after a validated local demo run.
- Define and document deployment architecture for the target hosting environment.
- Add production-ready job scheduling and monitoring.
- Decide how generated model and prediction artifacts are promoted between environments.
- Validate optional live provider mode with private credentials if it is needed for a demo.
- Add free-transfer, hit-cost, and chip-planning controls only if transfer planning scope expands.

## Validation Run

Record the final cleanup validation here before tagging or publishing a portfolio snapshot.

| Command | Result |
| --- | --- |
| `pnpm.cmd run build` | Passed; web build ran outside the sandbox for Vite/esbuild access and reported a non-failing Browserslist data-age warning. |
| `pnpm.cmd run build:api` | Passed. |
| `pnpm.cmd run build:web` | Passed outside the sandbox for Vite/esbuild access; reported a non-failing Browserslist data-age warning. |
| `pnpm.cmd run test:api` | Passed, 72 tests. |
| `pnpm.cmd run test:smoke` | Passed, 5 tests. |
| `pnpm.cmd run pipeline:test` | Passed, 14 tests. |
| `pnpm.cmd run model:test` | Passed, 7 tests. |
| `git diff --check` | Passed; Git reported line-ending normalization warnings only. |
| `git status` | Checked before final audit commit; only final audit cleanup files were modified. |

Manual smoke QA with `pnpm.cmd run dev:app` and `pnpm.cmd run smoke:app` was attempted during cleanup. API health and frontend route checks responded, but the full smoke run did not pass because local PostgreSQL was not running for evaluation data access; repeated probes also hit the local API rate limit. Run the local demo setup in `docs/LOCAL_DEMO.md` before publishing screenshots or an external demo.
