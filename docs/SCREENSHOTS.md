# Screenshot Capture Guide

This guide explains how to capture real ScoutIQ screenshots for README and portfolio use.

Do not commit fake screenshots. Do not link to screenshot files from the README until the image files exist in `docs/assets/screenshots/`.

## Start The Local App

From the repository root:

```powershell
pnpm.cmd install
if (!(Test-Path .env)) { Copy-Item .env.example .env }
if (!(Test-Path apps\api\.env)) { Copy-Item apps\api\.env.example apps\api\.env }
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

In a second terminal, confirm the demo path:

```powershell
pnpm.cmd run smoke:app
```

The local demo works without an OpenAI API key. When provider credentials are not configured, deterministic fallback explanation mode is expected and should be labelled honestly.

## Capture Settings

Use a desktop viewport of `1440 x 1000` for the main portfolio screenshots. Keep browser zoom at `100%`.

Before capturing:

- close browser extensions or panels that reveal private data
- keep local `.env` files, terminals with secrets, and API keys out of frame
- use real app screens from `http://localhost:3000`
- include setup or missing-data states only when that is the state being documented

## Screenshot List

| File | URL | What to show |
| --- | --- | --- |
| `docs/assets/screenshots/home.png` | `http://localhost:3000` | Home page or analysis entry point with the app loaded and API connected. |
| `docs/assets/screenshots/optimizer-result.png` | `http://localhost:3000/analyze` | Squad analysis result with optimizer recommendations, starting XI, bench order, captaincy, and constraint status visible. |
| `docs/assets/screenshots/explanation-agent.png` | `http://localhost:3000/analyze` | Recommendation explanation panel with the explanation mode visible. Deterministic fallback is acceptable for the local demo. |
| `docs/assets/screenshots/evaluation-dashboard.png` | `http://localhost:3000/evaluation` | Model Evaluation page showing MAE, RMSE, baseline comparison, data coverage, and limitation messaging. |
| `docs/assets/screenshots/ci-green.png` | GitHub Actions workflow page | Optional real passing CI run for `.github/workflows/ci.yml`. Capture only after the workflow is actually green. |

## Suggested Capture Flow

1. Open `http://localhost:3000` and save `docs/assets/screenshots/home.png`.
2. Build or load a complete 15-player squad, run analysis, then open `http://localhost:3000/analyze`.
3. Capture the optimizer result area as `docs/assets/screenshots/optimizer-result.png`.
4. Capture the recommendation explanation panel as `docs/assets/screenshots/explanation-agent.png`.
5. Open `http://localhost:3000/evaluation` and save `docs/assets/screenshots/evaluation-dashboard.png`.
6. Optionally capture a real passing GitHub Actions run as `docs/assets/screenshots/ci-green.png`.

## Review Checklist

Before committing screenshots:

- filenames match the table above
- no secrets, keys, tokens, local paths with private values, or private browser profile details are visible
- fallback/provider status is visible where the explanation panel is shown
- the evaluation screenshot does not imply the model outperforms the baseline
- screenshots show real app output, not fabricated data or image placeholders
- README image links are added only for files that exist
