# FPL Optimizer

A Fantasy Premier League team optimization tool that provides AI-powered analysis and personalized suggestions to maximize your FPL points potential.

## Features

- **Squad Analysis**: Analyze your current FPL squad with configurable scoring weights
- **Player Suggestions**: Get personalized replacement suggestions for underperforming players
- **Advanced Metrics**: Consider form, expected goals/assists, expected minutes, and fixture difficulty
- **Real-time Data**: Uses official FPL API for up-to-date player and fixture information
- **Responsive UI**: Modern, mobile-friendly interface built with React and Tailwind CSS

## Quick Start

1. Clone the repository:
```bash
git clone <repository-url>
cd FPL-Optimizer
```

2. Install dependencies:
```bash
npm install
```

3. Start the development servers:
```bash
npm run dev
```

4. Open your browser and navigate to `http://localhost:3000`

## Project Structure

```
FPL-Optimizer/
├── apps/
│   ├── api/                 # Express.js API server
│   └── web/                 # React frontend
├── docs/                    # Documentation
└── package.json            # Root package.json
```

## Configuration

### Analysis Weights

The tool uses configurable weights to score players based on different metrics:

- **Form** (30%): Recent performance and consistency
- **xG/90** (25%): Expected goals per 90 minutes
- **xA/90** (20%): Expected assists per 90 minutes
- **Expected Minutes** (15%): Likelihood of playing time
- **Next 3 Fixtures** (10%): Difficulty of upcoming matches

You can adjust these weights in the web interface to match your preferences.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Disclaimer

This tool is for educational and entertainment purposes only. It is not affiliated with the official Fantasy Premier League. Always make your own decisions when managing your FPL team.