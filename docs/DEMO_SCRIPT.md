# Demo Script

Use this as a short speaking guide for recruiter screens, interviews, or technical walkthroughs.

## 30-Second Summary

ScoutIQ is a local-first Fantasy Premier League decision-support project. It ingests public FPL data, stores normalized records in PostgreSQL, builds expected-points features, evaluates model output against a historical baseline, and uses deterministic optimizer logic to produce squad, transfer, starting XI, captaincy, and bench recommendations.

The important boundary is that the optimizer makes the decisions. The optional LLM layer only explains an optimizer result that already exists, and the local demo works without an OpenAI API key through deterministic fallback.

## 2-Minute Technical Walkthrough

1. Start at `http://localhost:3000` and show that the React app is connected to the API.
2. Open `http://localhost:3000/analyze` and show the squad analysis result.
3. Point to the optimizer panel: starting XI, bench order, captaincy, transfers, projected points, and constraint validation.
4. Open the recommendation explanation panel and show the explanation mode. If it says deterministic fallback, explain that this is the expected local path without provider credentials.
5. Open `http://localhost:3000/evaluation` and show MAE, RMSE, baseline comparison, coverage, recent runs, and limitation messaging.
6. Close by showing `http://localhost:3001/api/health` or the smoke-test command to demonstrate the backend can be checked directly.

## Data Pipeline Explanation

ScoutIQ starts with public FPL data. The ingestion step normalizes bootstrap, fixture, and player-history records while preserving source metadata such as fetch timestamps, source URLs, record counts, and snapshot hashes.

The local pipeline then builds Bronze, Silver, and Gold layers. Bronze stays close to source records, Silver normalizes typed tables, and Gold creates feature-oriented rows. The expected-points pipeline uses historical player-gameweek data for training and backtesting while keeping future prediction features separated from post-deadline outcomes.

## Optimizer Explanation

The model estimates expected points. PostgreSQL serves prediction rows to the API. The optimizer applies deterministic FPL constraints such as squad size, positions, formation, club limits, budget, captaincy, and bench order.

The optimizer does not call the LLM agent and does not rely on random recommendation data. Its output can be traced back to prediction run metadata.

## LLM Agent Safety Explanation

The explanation agent is downstream of the optimizer. It receives optimizer result JSON and returns explanatory text.

Live provider responses must pass structured JSON validation and grounding checks before display. If provider mode is disabled, credentials are missing, a request times out, output is invalid, or grounding fails, the API returns deterministic fallback output.

The agent does not add players or change recommendation decisions.

## Evaluation Dashboard Explanation

MAE and RMSE are error metrics, so lower is better. The dashboard compares the expected-points model against a historical recent-points baseline.

The current known snapshot is mixed: MAE is worse than baseline, while RMSE is better. That means the project should be described as transparent and evaluable, not as a model that clearly outperforms the baseline.

Use the dashboard to show setup status, data coverage, latest evaluation metadata, and honest limitation messaging.

## Likely Questions

### Does the model beat the baseline?

Not clearly. The latest known backtest has better RMSE but worse MAE than the historical baseline, so the repo does not claim model superiority.

### Does the LLM make the recommendations?

No. The deterministic optimizer makes recommendations. The LLM layer only explains optimizer output and can be replaced by deterministic fallback.

### Can it run without an API key?

Yes. The normal local demo works without an OpenAI API key because deterministic fallback explanations are enabled.

### Is this production deployed?

No. The repo has local demo and CI validation paths, but production deployment, scheduled ingestion, monitoring, and production migration workflows are still future work.

### What should a reviewer inspect first?

Start with `README.md`, `docs/LOCAL_DEMO.md`, `docs/SCREENSHOTS.md`, `docs/RELEASE_NOTES.md`, and the Model Evaluation page at `http://localhost:3000/evaluation`.

### What is the strongest engineering point?

The strongest point is the separation of concerns: deterministic data ingestion, auditable model evaluation, constraint-based optimization, and explanation-only LLM behavior with fallback and validation.
