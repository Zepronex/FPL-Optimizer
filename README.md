# FPL Optimizer

An intelligent Fantasy Premier League team optimization tool that analyzes player performance and suggests optimal team compositions.

## Features

- **Team Generation**: Generate optimized squads using different strategies (Premium, Balanced, Value, etc.)
- **Squad Analysis**: Analyze your current team with configurable scoring weights
- **Player Suggestions**: Get replacement recommendations based on performance metrics
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
