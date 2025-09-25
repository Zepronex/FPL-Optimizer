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

# Setup ML service (optional, for AI Strategy)
./setup_ml.sh

# Start development servers
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

### AI Strategy Setup

The AI Strategy uses machine learning to optimize team selection. To use it:

1. **Setup ML service**: Run `./setup_ml.sh` to install Python dependencies
2. **Train the model**: Run `pnpm run train:ml` to train the ML model
3. **Start services**: Run `pnpm run dev` to start all services
4. **Use AI Strategy**: Select "AI Strategy" in the team generation page

The AI Strategy will predict optimal player selections for the next 3 gameweeks using historical data and advanced algorithms.

## How It Works

The tool uses advanced metrics to score players:

- **Form**: Recent performance and consistency
- **Expected Goals/Assists**: Statistical performance indicators
- **Expected Minutes**: Playing time likelihood
- **Fixture Difficulty**: Upcoming match difficulty
- **Average Points**: Historical FPL performance

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