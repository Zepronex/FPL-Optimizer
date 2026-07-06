# FPL Optimizer

An intelligent Fantasy Premier League team optimization tool that analyzes player performance and suggests optimal team compositions.

## Features

- **Team Generation**: Generate optimized squads using different strategies (Premium, Balanced, Value, etc.)
- **Squad Analysis**: Analyze your current team with configurable scoring weights
- **Player Suggestions**: Get replacement recommendations based on performance metrics
- **Recommendation Explanations**: Explain optimizer outputs without changing optimizer decisions
- **Real-time Data**: Uses official FPL API for up-to-date player and fixture information

## Quick Start

```bash
# Install dependencies
pnpm install

# Setup ML service (optional, only for ML-backed strategy work)
./setup_ml.sh

# Start normal ScoutIQ development servers
pnpm.cmd run dev:app
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

### Optional ML Strategy Setup

The ML strategy service is optional and should not block normal frontend/API development. Use `pnpm.cmd run dev:app` for the main ScoutIQ web app and API.

To work on the optional ML strategy path:

1. **Setup ML service**: Run `./setup_ml.sh` to install Python dependencies
2. **Train the model**: Run `pnpm.cmd run train:ml` to train the ML model
3. **Start app services**: Run `pnpm.cmd run dev:app`
4. **Start ML service separately**: Run `pnpm.cmd run dev:ml`

`pnpm.cmd run dev:all` starts API, web, and ML together when all three services are needed.

## How It Works

The tool uses advanced metrics to score players:

- **Form**: Recent performance and consistency
- **Expected Goals/Assists**: Statistical performance indicators
- **Expected Minutes**: Playing time likelihood
- **Fixture Difficulty**: Upcoming match difficulty
- **Average Points**: Historical FPL performance

## ScoutIQ Data Pipeline

The current rebuild adds deterministic ingestion, Bronze/Silver/Gold feature preparation, and a simple expected-points baseline. See:

- [Databricks Lakehouse Pipeline](docs/DATABRICKS.md)
- [Expected-Points Baseline](docs/EXPECTED_POINTS_BASELINE.md)
- [PostgreSQL Foundation](docs/DATABASE.md)
- [Prediction Serving and Optimizer Recommendations](docs/PREDICTION_SERVING.md)

## Model Evaluation Dashboard

The web app includes a `Model Evaluation` page at `/evaluation`. It shows the latest walk-forward backtest, baseline comparison, data coverage, pipeline status, and current limitations.

Generate and load the evaluation data locally with:

```powershell
pnpm.cmd run ingest:fpl
pnpm.cmd run db:migrate
pnpm.cmd run db:load:fpl
pnpm.cmd run ingest:fpl:history
pnpm.cmd run pipeline:features
pnpm.cmd run model:train
pnpm.cmd run model:backtest
pnpm.cmd run model:predict
pnpm.cmd run db:load:predictions
```

The dashboard reads:

- `GET /api/evaluation/latest`
- `GET /api/evaluation/runs`
- `GET /api/evaluation/data-health`

It reports MAE, RMSE, baseline MAE, baseline RMSE, row counts, prediction-run metadata, and coverage counts for players, teams, gameweeks, fixtures, player-gameweek history rows, and latest prediction rows.

MAE and RMSE are error metrics, so lower values are better. The app compares the model against the recent-points baseline and does not claim model superiority unless the model is lower than the baseline on both MAE and RMSE. The current backtest has lower RMSE than the baseline, but higher MAE, so the dashboard states that the model is not clearly better across tracked metrics.

This page is intended to support transparent data decision-making: recommendations remain deterministic optimizer outputs, and predictions should be treated as decision support rather than certainty.

Relevant validation commands:

```powershell
pnpm.cmd run build
pnpm.cmd run build:api
pnpm.cmd run build:web
pnpm.cmd run test:api
pnpm.cmd run pipeline:test
pnpm.cmd run model:test
```

## Recommendation Explanations

The optimizer remains the only layer that selects squads, transfers, captaincy, and bench order. The explanation endpoint only summarizes optimizer output that already exists in the request payload. The agent does not choose players, transfers, captaincy, bench order, or chips.

`POST /api/agent/explain-recommendation` accepts the optimizer result and returns structured JSON with summary, recommended actions, starting XI reasoning, captaincy reasoning, transfer reasoning, risks, alternatives, data limitations, constraint summary, and disclaimer fields.

The response includes `agentStatus` metadata so the API and frontend can show whether the explanation used deterministic fallback or a live provider. Fallback reasons are safe public codes such as `missing_provider_config`, `provider_error`, `schema_validation_failed`, and `hallucination_guard_failed`; raw provider errors and secrets are not returned.

`GET /api/agent/status` returns safe public status for local demos: whether the agent is enabled, the selected provider type when known, whether required config appears present, the active mode, and the configured model or deployment name when safe. It does not return API keys or raw environment values.

The deterministic fallback explanation works without provider credentials and is the default local demo path. It uses only supplied optimizer data and states when prediction run, gameweek, or player metadata is missing. Optional provider output is schema-validated and checked for ungrounded player references before it can reach the API response; invalid, timed out, unavailable, or unsafe provider output falls back to deterministic explanation.

Run normal local web and API development with:

```bash
pnpm.cmd run dev:app
```

With the dev servers running, check local fallback status and exercise the explanation endpoint with the committed demo fixture:

```powershell
Invoke-RestMethod -Uri http://localhost:3001/api/agent/status

$payload = Get-Content .\fixtures\agent\recommendation-explanation-request.json -Raw
Invoke-RestMethod `
  -Uri http://localhost:3001/api/agent/explain-recommendation `
  -Method Post `
  -ContentType 'application/json' `
  -Body $payload
```

The fixture is for local development and tests only. It is not loaded by the optimizer and is not part of the production recommendation path.

Configure local explanation behavior with empty or non-secret values in `.env.example` or `apps/api/.env.example`:

```bash
SCOUTIQ_AGENT_ENABLED=true
OPENAI_API_KEY=
OPENAI_MODEL=
```

To enable a live OpenAI provider locally, keep `SCOUTIQ_AGENT_ENABLED=true`, set `SCOUTIQ_AGENT_PROVIDER=openai` if you do not want auto-detection, and provide private values in your local `.env` file only:

```bash
SCOUTIQ_AGENT_ENABLED=true
SCOUTIQ_AGENT_PROVIDER=openai
OPENAI_API_KEY=<private key>
OPENAI_MODEL=<model name>
```

Optional provider selection, Azure OpenAI, base URL, and timeout settings are documented in `apps/api/.env.example`. Do not commit real API keys.

In the UI, deterministic fallback means the explanation text came from the local fallback builder. Live provider mode means the explanation text came from the configured OpenAI or Azure OpenAI provider after schema validation and grounding checks. In both modes, the recommendation itself came from the deterministic optimizer before the explanation was generated.

Useful validation commands for this path:

```bash
pnpm.cmd run build
pnpm.cmd run build:api
pnpm.cmd run build:web
pnpm.cmd run test:api
pnpm.cmd run pipeline:test
pnpm.cmd run model:test
```

## Project Structure

```
├── apps/
│   ├── api/          # Express.js backend
│   └── web/          # React frontend
└── README.md
```

## Deployment

The application is deployed to Vercel and automatically builds from the main branch.

## License

MIT License - see [LICENSE](LICENSE) for details.
