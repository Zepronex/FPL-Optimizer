# Prediction Serving

ScoutIQ stores Day 5 expected-points outputs in PostgreSQL so the backend API, optimizer, and frontend can consume deterministic prediction data. This layer does not add agent behavior or explanation generation.

## Local Artifact Inputs

The loader reads the local Day 5 outputs from gitignored paths:

```text
data/predictions/expected_points_latest.jsonl
data/models/expected_points_baseline.json
data/evaluation/expected_points_backtest.json
```

The prediction JSONL file is required. The model artifact and evaluation report are loaded when present.

If the prediction file is missing, run the generation flow first:

```powershell
pnpm.cmd run ingest:fpl:history
pnpm.cmd run pipeline:features
pnpm.cmd run model:train
pnpm.cmd run model:backtest
pnpm.cmd run model:predict
```

## Database Tables

Migration `003_prediction_serving.sql` adds:

```text
prediction_runs
player_predictions
model_evaluations
```

`prediction_runs` stores one deterministic serving run per prediction artifact, with model name/version, target gameweek, file hashes, source snapshot metadata, optional source ingestion run, and row count.

`player_predictions` stores one row per player-fixture prediction for a run. It includes player id, target gameweek, fixture id, predicted points, optional baseline points, optional confidence/uncertainty, source snapshot fields, and feature values.

`model_evaluations` stores the latest backtest report shape, including overall metrics, baseline metrics, position metrics, evaluated gameweeks, skipped gameweeks, and prediction count.

Runs use stable hash keys and `ON CONFLICT DO UPDATE` upserts, so re-running the loader with the same artifacts updates existing rows instead of creating duplicates.

## Load Predictions

Start Postgres, apply migrations, and load the normalized FPL snapshot before loading predictions:

```powershell
docker compose up -d postgres
pnpm.cmd run db:migrate
pnpm.cmd run db:load:fpl
```

Generate and load the Day 5 prediction outputs:

```powershell
pnpm.cmd run ingest:fpl:history
pnpm.cmd run pipeline:features
pnpm.cmd run model:train
pnpm.cmd run model:backtest
pnpm.cmd run model:predict
pnpm.cmd run db:load:predictions
```

Windows wrapper:

```powershell
.\scripts\load-predictions-db.ps1
```

Custom artifact paths:

```powershell
pnpm.cmd run db:load:predictions -- --predictions data/predictions/expected_points_latest.jsonl --model data/models/expected_points_baseline.json --evaluation data/evaluation/expected_points_backtest.json
.\scripts\load-predictions-db.ps1 -PredictionsPath data/predictions/expected_points_latest.jsonl -ModelPath data/models/expected_points_baseline.json -EvaluationPath data/evaluation/expected_points_backtest.json
```

The loader prints the prediction count, prediction run id, run key, and evaluation id when an evaluation report is loaded.

## API Endpoints

The backend exposes typed JSON endpoints for frontend consumers:

```text
GET /api/predictions/latest
GET /api/predictions/player/:playerId
GET /api/predictions/gameweek/:gameweekId
GET /api/predictions/top?gameweekId=&position=&limit=
GET /api/model/evaluations/latest
GET /api/evaluation/latest
GET /api/evaluation/runs
GET /api/evaluation/data-health
```

Prediction responses include:

- `run`: prediction run metadata and source hashes
- `predictions`: player prediction rows with player/team context
- `count`: returned row count

Top predictions are sorted by `predictedPoints` descending, then player name and fixture id for deterministic ties. `position` accepts `GK`, `DEF`, `MID`, or `FWD`; `limit` is capped at 100.

The Top Players web page uses `GET /api/predictions/top` from PostgreSQL prediction-serving data. It does not call the optional legacy ML service.

## Evaluation Dashboard API

The `/api/evaluation/*` endpoints shape prediction-serving and evaluation records for the web dashboard.

`GET /api/evaluation/latest` returns:

- latest evaluation metadata: model name, model version, evaluation type, evaluation key and timestamps
- backtest row count
- MAE and RMSE
- baseline MAE and baseline RMSE
- difference versus baseline for each metric
- `modelBeatsBaseline` flags for MAE and RMSE
- latest prediction-run metadata when prediction rows are loaded
- setup commands and warnings when evaluation or prediction data is missing

`GET /api/evaluation/runs` returns recent evaluation runs in deterministic newest-first order by `createdAt`, then id.

`GET /api/evaluation/data-health` returns coverage counts for players, teams, gameweeks, fixtures, player-gameweek history rows from the local history artifact, latest prediction rows, prediction runs, and evaluation runs.

MAE and RMSE are error metrics, so lower values are better. The dashboard does not claim the model is clearly better unless both MAE and RMSE are lower than the baseline. The current backtest should be interpreted as mixed: RMSE is lower than the baseline, but MAE is higher.

The evaluation dashboard is a transparency surface. It should be used to inspect model quality, data coverage, and pipeline status before relying on prediction-backed optimizer recommendations.

## Optimizer API

The optimizer API reads prediction-serving rows and returns deterministic recommendations:

```text
POST /api/optimizer/starting-xi
POST /api/optimizer/transfers
POST /api/optimizer/squad
```

`starting-xi` accepts a 15-player squad as either explicit prediction-backed slots or `playerIds`. When `playerIds` are provided, the API resolves them against the latest prediction run or an explicit `gameweekId`.

`transfers` accepts the current squad, optional candidate pool, free transfer count, and maximum hits. If no candidate pool is supplied, it uses the prediction-serving table for the latest or requested gameweek.

`squad` builds a 15-player squad from the prediction-backed candidate pool under FPL budget, position, and max-three-per-club constraints.

Optimizer responses include the selected prediction run ids and target gameweek id so recommendations can be traced back to the model data used. Per-fixture player predictions are aggregated by player for the requested gameweek before optimization.

Local smoke example after the API and database are running:

```powershell
$squad = @{
  squad = @{
    playerIds = @(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15)
    bank = 0
    budget = 100
  }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/optimizer/starting-xi -ContentType 'application/json' -Body $squad
```

Replace the sample ids with a complete squad that has prediction rows loaded.

## Frontend Recommendations

The web app shows optimizer recommendations on the squad analysis page after a squad has been analyzed. Manual analysis uses backend default scoring weights internally instead of user-tuned sliders. It sends the stored 15-player squad ids and bank to the optimizer, then displays:

- recommended starting XI and bench order
- captain and vice captain
- projected points total
- transfer recommendation and expected points gain
- budget impact and bank after transfer
- constraint validation status

The current frontend transfer request assumes 1 free transfer and no points hits. Chip strategy is not included.

If predictions are not loaded, the UI shows:

```text
Prediction data is missing. Run the prediction pipeline and load predictions into PostgreSQL.
```

Required local setup before using optimizer recommendations:

```powershell
docker compose up -d postgres
pnpm.cmd run db:migrate
pnpm.cmd run db:load:fpl
pnpm.cmd run ingest:fpl:history
pnpm.cmd run pipeline:features
pnpm.cmd run model:train
pnpm.cmd run model:backtest
pnpm.cmd run model:predict
pnpm.cmd run db:load:predictions
pnpm.cmd run dev:app
```

The ML service is optional for normal frontend/API development. Start it separately with `pnpm.cmd run dev:ml` only when working on ML-backed strategy behavior.

Current limitations:

- no chip strategy
- generated-team review is unavailable in the current web demo path
- transfer UI does not yet expose free-transfer or hit controls
- recommendations depend on prediction rows being present for all squad players

The serving layer intentionally persists per-fixture prediction rows. The optimizer consumes those rows but does not call LLM or agent workflows.
