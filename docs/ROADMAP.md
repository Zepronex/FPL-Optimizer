# Limitations And Roadmap

This document captures the current project limits and the most useful next engineering steps. It should be read as a reviewer aid, not as a claim that the system is production-ready.

## Completed Foundations

ScoutIQ currently includes:

- deterministic public FPL ingestion with source metadata
- PostgreSQL migrations and loaders for normalized FPL data
- Bronze, Silver, and Gold pipeline layers for local and Databricks-compatible execution
- expected-points feature engineering, training, backtesting, and prediction scripts
- prediction-serving tables and API routes
- deterministic optimizer routes for starting XI, transfers, and squad generation
- controlled recommendation explanation endpoint with deterministic fallback behavior
- evaluation dashboard API and frontend page
- local demo, health endpoint, and smoke-test tooling

## Current Limitations

### Model Quality

The current model does not clearly outperform the historical baseline. The latest known backtest is:

```text
rows=28352
mae=1.0925
rmse=2.0246
baseline_mae=1.0366
baseline_rmse=2.1458
```

MAE and RMSE are error metrics, so lower values are better. The model has better RMSE but worse MAE, so the project should describe model performance as mixed.

### Public Data Limits

The system uses public FPL API data. That keeps the project reproducible, but it limits richer context such as detailed tactical information, training reports, private injury updates, and market intelligence.

### Recommendation Dependencies

Prediction-backed recommendations require:

- current normalized FPL data
- generated feature rows
- trained and backtested model artifacts
- loaded prediction rows in PostgreSQL
- complete squad inputs that satisfy optimizer constraints

When these dependencies are missing, the UI should show setup guidance rather than invented recommendations.

### Explanation Agent Scope

The LLM explanation layer explains optimizer output after decisions have already been made. It does not choose players, transfers, captaincy, bench order, or chips. Provider output must pass schema validation and grounding checks, otherwise deterministic fallback output is returned.

### Local Artifacts And Secrets

Generated data, feature, model, evaluation, and prediction artifacts live under gitignored `data/` paths. They are local runtime outputs, not committed source files.

No secrets, API keys, service account files, local `.env` files, or database dumps should be committed.

## Roadmap

### Improved Features

- Add richer pre-deadline player and team context while preserving leakage boundaries.
- Improve minutes, availability, fixture congestion, and team-strength features.
- Version feature definitions more explicitly so model comparisons are easier to audit.

### Better Model Comparison

- Compare multiple expected-points models against the same historical splits.
- Add calibration reporting and position-specific error analysis.
- Track model changes as release gates before using predictions in recommendation demos.

### Richer Recommendation Context

- Surface clearer constraint reasons when optimizer inputs are incomplete.
- Add better scenario comparison without changing the deterministic optimizer contract.
- Keep chip strategy out of scope until there is a dedicated tested implementation.

### Deployment

- Separate deployable concerns for web, API, database, workers, and model artifacts.
- Add environment-specific setup documentation and production migration workflow.
- Add monitoring for ingestion, prediction freshness, optimizer errors, and agent fallback rates.

### CI/CD Hardening

- Add GitHub Actions or another CI runner only when the commands are verified in that environment.
- Run API, pipeline, model, smoke, and frontend build validation automatically.
- Publish accurate status badges only after real CI is configured and passing.

### Demo Evidence

- Add real screenshots or a short demo video after running the local app.
- Suggested screenshot targets:
  - home or analyze page
  - optimizer recommendation result
  - explanation panel with fallback/provider status
  - evaluation dashboard
- Store screenshots under `docs/screenshots/` and document the data run used to create them.
