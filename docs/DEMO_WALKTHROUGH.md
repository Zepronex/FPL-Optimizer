# Demo Walkthrough

This walkthrough is a reviewer-facing script for demonstrating ScoutIQ locally. It focuses on what the system proves, how the pieces fit together, and which limitations should be stated clearly.

## Start The Local Demo

From a clean checkout:

```powershell
pnpm.cmd install
if (!(Test-Path .env)) { Copy-Item .env.example .env }
if (!(Test-Path apps\api\.env)) { Copy-Item apps\api\.env.example apps\api\.env }
```

Prepare PostgreSQL, FPL data, features, model outputs, backtest output, predictions, and prediction-serving tables:

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
```

Start the API and web app:

```powershell
pnpm.cmd run dev:app
```

From a second terminal, run the smoke check:

```powershell
pnpm.cmd run smoke:app
```

The default demo path does not require an OpenAI API key. Deterministic fallback explanation mode is expected when provider credentials are not configured.

## Pages To Open

Open these pages during a short technical review:

```text
http://localhost:3000
http://localhost:3000/analyze
http://localhost:3000/evaluation
http://localhost:3001/api/health
```

Suggested order:

1. Home page: show that the web app is connected to the API.
2. Team Analysis: show the squad analysis workflow and optimizer recommendation area.
3. Evaluation: show model metrics, baseline comparison, coverage, and setup warnings.
4. API health route: show the backend is responding independently of the frontend.

## Click Path

Use this path for a concise demo:

1. Start at the home page and confirm the app shell loads.
2. Open Team Analysis from the navigation.
3. Enter or reuse a complete 15-player squad when local data is available.
4. Run analysis and review the optimizer recommendation panel.
5. Point out the starting XI, bench order, captaincy, projected points, transfer recommendation, budget impact, and constraint status.
6. Open Evaluation and review the latest backtest card, baseline comparison, data-health section, and limitation messaging.
7. If discussing explanations, call `GET /api/agent/status` or use the UI explanation panel when available to show whether the response came from deterministic fallback or a live provider.

If predictions are missing, the optimizer area should show setup guidance instead of fabricated recommendations.

## How To Explain The Optimizer

The optimizer is deterministic decision logic. It consumes prediction-backed player data and explicit constraints, then selects recommendation outputs under FPL rules.

Useful points to state:

- The model estimates player expected points.
- PostgreSQL serves prediction rows to the API.
- The optimizer applies constraints such as squad size, positions, formation, budget, club limits, captaincy, and bench order.
- Optimizer responses include metadata that connects recommendations back to prediction data.
- The optimizer does not call the LLM agent and does not use random recommendation data.

Avoid describing the optimizer as an autonomous agent. It is constraint-based software over model-backed inputs.

## How To Explain Fallback LLM Mode

The explanation layer is downstream of the optimizer. It explains decisions already present in the optimizer result.

In the default local demo:

- no OpenAI API key is required
- `GET /api/agent/status` should show deterministic fallback mode when provider credentials are absent
- fallback text is generated from the optimizer payload
- provider errors, schema failures, timeouts, or unsafe output fall back to deterministic explanations
- API responses expose safe status codes, not raw secrets or raw provider errors

The LLM explanation agent does not select players, transfers, captaincy, bench order, or chips.

## How To Explain The Evaluation Dashboard

The evaluation dashboard is a transparency surface. It should be used to show how ScoutIQ reports model quality and data coverage before a reviewer trusts recommendations.

State this clearly:

- MAE and RMSE are error metrics, so lower is better.
- The current backtest is mixed: MAE is worse than baseline, while RMSE is better.
- The model is not clearly better than the historical baseline yet.
- The dashboard should not present predictions as certainty.
- Missing data states are intentional and should guide local setup rather than hiding pipeline gaps.

The current backtest numbers to cite are:

```text
rows=28352
mae=1.0925
rmse=2.0246
baseline_mae=1.0366
baseline_rmse=2.1458
```

## What Not To Claim

Do not claim:

- the model outperforms the baseline
- the LLM makes recommendation decisions
- the app is production deployed unless a real deployment is configured and current
- predictions are guaranteed outcomes
- public FPL data contains full tactical, injury, or team-news context
- chip strategy is implemented

Safe claims:

- deterministic ingestion from public FPL data
- PostgreSQL-backed prediction serving
- leakage-aware feature and backtest design
- baseline comparison and transparent reporting
- deterministic constraint-based optimizer
- controlled explanation agent with fallback behavior
- local demo, health endpoint, and smoke-test tooling

## Screenshot Placeholders

No fake screenshots are committed. Add real screenshots later after a local demo run, preferably under `docs/screenshots/`, for:

- home or analyze page
- optimizer recommendation result
- explanation panel with fallback/provider status
- evaluation dashboard

When screenshots are added, include the local data date or run context in the surrounding documentation so reviewers know what they are seeing.
