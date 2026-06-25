# FPL Optimizer v2 Target Architecture

This document describes the intended v2 architecture. It is a planning artifact, not a request to rewrite the current application during cleanup work.

## Goals

- Provide reliable fantasy football squad, transfer, captaincy, and chip decisions.
- Separate data ingestion, modeling, optimization, and explanation concerns.
- Make every recommendation reproducible from pre-deadline inputs.
- Support backtesting before promoting model or optimizer changes.

## System Components

### React Frontend

The frontend remains a React application for squad entry, recommendation review, scenario comparison, and explanation display. It should call the backend API rather than reaching directly into model, database, or ingestion internals.

### Backend API

The API owns request validation, authentication-ready boundaries, rate limiting, orchestration of optimizer/model calls, and response shaping for the web app. It should expose stable endpoints for players, fixtures, squads, recommendations, backtests, and health checks.

### PostgreSQL Database

PostgreSQL is the source of truth for normalized FPL data, imported snapshots, engineered features, predictions, optimizer outputs, and evaluation results. Schemas should preserve temporal boundaries so historical decisions can be reproduced exactly.

### Data Ingestion Pipeline

The ingestion pipeline fetches FPL bootstrap data, fixtures, player histories, prices, ownership, injuries/status, and any approved external data sources. Every ingest should record source URL, fetch time, season, gameweek, and data version.

### Feature Engineering

Feature engineering converts raw snapshots into time-aware model features such as recent form, minutes trends, expected goal involvement, fixture difficulty, price movement, availability, and team context. Features must be calculated using only data available before the prediction deadline.

### Expected-Points Model

The model predicts player expected points over one or more future gameweeks. It should be trained and evaluated with time-series splits, persisted with feature metadata, and versioned so optimizer outputs can be traced to the exact model run.

### Constraint Optimizer

The optimizer selects squads, transfers, captaincy, and chip strategies under FPL constraints: budget, squad size, position counts, club limits, free transfers, hits, bench order, and formation rules. It consumes model predictions and explicit user constraints rather than embedding prediction logic.

### LLM Explanation Agent

The LLM explanation agent turns model and optimizer outputs into concise user-facing reasoning. It must not invent inputs, override the optimizer, or cite unavailable data. Explanations should reference the actual factors used by the recommendation.

### Backtesting and Evaluation

Backtesting replays historical gameweeks with only pre-deadline data, records recommended actions, compares outcomes against baselines, and reports metrics such as total points, rank proxies, hit cost, captaincy accuracy, transfer value, and calibration.

### Deployment

Deployment should support separate web, API, worker, database, and ML/model artifact concerns. Production deployments need environment-specific configuration, migrations, observability, scheduled ingestion, and rollback paths for model or optimizer releases.

## Data Flow

1. Ingestion jobs fetch and version raw source data.
2. Transformation jobs normalize data into PostgreSQL.
3. Feature jobs build pre-deadline feature tables.
4. Training jobs produce versioned expected-points models.
5. Prediction jobs write player projections for upcoming gameweeks.
6. The API calls the optimizer with projections, constraints, and user squad state.
7. The explanation agent summarizes the resulting recommendation using recorded inputs.
8. Backtests replay the same path across historical deadlines.
