# FPL Transfer Optimizer

Machine-learning–powered Fantasy Premier League transfer recommendations. Provide your current 15-player squad, bank, and free transfers; the system returns the best transfer plan to maximize expected points over the next 3–5 gameweeks while respecting FPL rules (positions, formation, team limits, and budget) and optional hit limits.

## Features

- **Transfer optimization**: Multi-week ILP optimizer (via OR-Tools) that balances expected points and hit costs.
- **ML-driven projections**: LightGBM-based xPts predictions per player per future gameweek sourced from FPL data (and optionally Understat).
- **Starting XI suggestions**: Recommended XI for the next gameweek alongside transfer ins/outs and projected deltas.
- **Thin API proxy**: Express API forwards optimization requests to the Python ML service.
- **Web UI**: Squad builder plus an Optimize Transfers page for submitting squads and viewing recommendations.

## Project structure

```
apps/
  api/   # Express proxy for players, fixtures, and /api/optimize
  ml/    # FastAPI service for xPts prediction and transfer optimization
  web/   # React frontend (Squad Builder + Optimize Transfers)
```

## Quick start (development)

```bash
# Install JS dependencies
pnpm install

# Set up the Python ML environment
./setup_ml.sh

# Start API + web + ML services
pnpm run dev
```

The dev script starts the web app on http://localhost:3000, the API on http://localhost:3001, and the ML service on http://localhost:3002.

## API contract

### POST /api/optimize

Request body:

```json
{
  "squad_player_ids": [15],
  "bank": 0.5,
  "free_transfers": 1,
  "horizon": 3,
  "allow_hits": true,
  "max_extra_transfers": 2
}
```

Response body:

```json
{
  "transfers_out": [{ "player_id": 1, "name": "Player A", "price": 7.5 }],
  "transfers_in": [{ "player_id": 2, "name": "Player B", "price": 7.4 }],
  "projected_points": {
    "horizon": 3,
    "before": 16.2,
    "after": 22.7,
    "delta": 6.5,
    "hit_cost": 4
  },
  "starting_xi_next_gw": [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  "meta": { "current_gw": 25, "timestamp": "2024-01-01T00:00:00Z" }
}
```

## Usage

1. Build your squad in the Squad Builder (or load an existing squad if available).
2. Open **Optimize Transfers**, set `free_transfers`, `bank`, `horizon` (3–5), and optionally toggle hit limits.
3. Submit to see transfer ins/outs, projected points before/after, and the suggested XI for the next gameweek.

## Testing

- API type-check: `pnpm --filter @fpl-optimizer/api build`
- Web type-check: `pnpm --filter @fpl-optimizer/web build`

These commands ensure the TypeScript surfaces compile.

## License

MIT — see [LICENSE](LICENSE).
