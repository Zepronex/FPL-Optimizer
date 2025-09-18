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

# Start development servers
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

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
├── docker-compose.yml
└── README.md
```

## Deployment

The application is containerized and ready for deployment:

```bash
docker-compose up -d
```

## License

MIT License - see [LICENSE](LICENSE) for details.