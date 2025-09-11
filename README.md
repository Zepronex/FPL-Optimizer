# FPL Optimizer

A comprehensive Fantasy Premier League team optimization tool that provides AI-powered analysis and personalized suggestions to maximize your FPL points potential.

## Features

- **Squad Analysis**: Analyze your current FPL squad with configurable scoring weights
- **Player Suggestions**: Get personalized replacement suggestions for underperforming players
- **Advanced Metrics**: Consider form, expected goals/assists, expected minutes, and fixture difficulty
- **Real-time Data**: Uses official FPL API for up-to-date player and fixture information
- **Responsive UI**: Modern, mobile-friendly interface built with React and Tailwind CSS

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd FPL-Optimizer
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
# Copy the example environment file
cp apps/api/env.example apps/api/.env

# Edit the .env file with your configuration
```

4. Start the development servers:
```bash
# Start both API and web app
npm run dev

# Or start them separately
npm run dev:api    # API server on port 3001
npm run dev:web    # Web app on port 3000
```

5. Open your browser and navigate to `http://localhost:3000`

## Project Structure

```
FPL-Optimizer/
├── apps/
│   ├── api/                 # Express.js API server
│   │   ├── src/
│   │   │   ├── lib/         # Core business logic
│   │   │   ├── routes/      # API endpoints
│   │   │   └── types.ts     # TypeScript types
│   │   └── package.json
│   └── web/                 # React frontend
│       ├── src/
│       │   ├── components/  # React components
│       │   ├── pages/       # Page components
│       │   ├── state/       # State management hooks
│       │   └── lib/         # Utilities and API client
│       └── package.json
├── docs/                    # Documentation
└── package.json            # Root package.json
```

## API Endpoints

### Players
- `GET /api/players` - Get all players
- `GET /api/players/search?name={name}` - Search players by name
- `GET /api/players/:id` - Get specific player
- `GET /api/players/position/:pos` - Get players by position

### Analysis
- `POST /api/analyze` - Analyze squad and get suggestions
- `POST /api/analyze/validate` - Validate squad configuration
- `GET /api/analyze/weights` - Get default analysis weights

### Suggestions
- `POST /api/suggestions` - Get player suggestions for a specific slot
- `POST /api/suggestions/bulk` - Get suggestions for multiple players

### Fixtures
- `GET /api/fixtures` - Get all fixtures
- `GET /api/fixtures/gameweek/:gw` - Get fixtures for specific gameweek
- `GET /api/fixtures/current` - Get current gameweek

## Configuration

### Analysis Weights

The tool uses configurable weights to score players based on different metrics:

- **Form** (30%): Recent performance and consistency
- **xG/90** (25%): Expected goals per 90 minutes
- **xA/90** (20%): Expected assists per 90 minutes
- **Expected Minutes** (15%): Likelihood of playing time
- **Next 3 Fixtures** (10%): Difficulty of upcoming matches

You can adjust these weights in the web interface to match your preferences.

### Data Sources

- **Official FPL API**: Player data, fixtures, and basic statistics
- **Advanced Analytics**: Mock implementation (can be extended with real data sources)

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run API tests
npm run test:api

# Run web app tests
npm run test:web
```

### Building for Production

```bash
# Build both API and web app
npm run build

# Build individually
npm run build:api
npm run build:web
```

## Deployment

### API Server

The API can be deployed to any Node.js hosting service:

- **Vercel**: Zero-config deployment
- **Railway**: Simple deployment with database support
- **Fly.io**: Global deployment with edge functions

### Web App

The React app can be deployed as a static site:

- **Vercel**: Automatic deployments from Git
- **Netlify**: Drag-and-drop or Git integration
- **GitHub Pages**: Free hosting for public repositories

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and add tests
4. Commit your changes: `git commit -m 'Add feature'`
5. Push to the branch: `git push origin feature-name`
6. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Disclaimer

This tool is for educational and entertainment purposes only. It is not affiliated with the official Fantasy Premier League. Always make your own decisions when managing your FPL team.

## Support

If you encounter any issues or have questions:

1. Check the [documentation](docs/)
2. Search existing [issues](https://github.com/your-repo/issues)
3. Create a new issue with detailed information

## Roadmap

- [ ] Multi-gameweek planning
- [ ] Transfer sequencing with hit costs
- [ ] Chip strategy recommendations
- [ ] Personalized risk profiles
- [ ] "What-if" transfer simulation
- [ ] Integration with real advanced analytics APIs

