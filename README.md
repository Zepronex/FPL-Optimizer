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

## Recommendation Explanations

The optimizer remains the only layer that selects squads, transfers, captaincy, and bench order. The explanation endpoint only summarizes optimizer output that already exists in the request payload.

`POST /api/agent/explain-recommendation` accepts the optimizer result and returns structured JSON with summary, recommended actions, starting XI reasoning, captaincy reasoning, transfer reasoning, risks, alternatives, data limitations, constraint summary, and disclaimer fields.

The deterministic fallback explanation works without provider credentials and is the default local mode. It uses only supplied optimizer data and states when prediction run, gameweek, or player metadata is missing. Optional provider output is schema-validated and checked for ungrounded player references before it can reach the API response; invalid, timed out, unavailable, or unsafe provider output falls back to deterministic explanation.

Configure local explanation behavior with empty or non-secret values in `.env.example` or `apps/api/.env.example`:

```bash
SCOUTIQ_AGENT_ENABLED=false
OPENAI_API_KEY=
OPENAI_MODEL=
```

Optional provider selection and timeout settings are documented in `apps/api/.env.example`. Do not commit real API keys.

Run normal local web and API development with:

```bash
pnpm.cmd run dev:app
```

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
