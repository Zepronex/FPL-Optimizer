# Repository Working Rules

These rules apply to every change in this repository.

## Data and Recommendations

- Recommendation and optimizer logic must not use random, fabricated, or mock data.
- Any fallback values used for development must be isolated from production recommendation paths and clearly named as fixtures.
- ML features must only use information available before the relevant FPL deadline. Do not include post-deadline points, outcomes, ownership changes, injuries, or fixture results in training features for that deadline.
- Data ingestion should preserve source timestamps and enough metadata to reproduce a training or backtest run.

## Secrets and Configuration

- Do not commit secrets, tokens, credentials, local `.env` files, service account files, or database dumps.
- Keep required configuration documented in the relevant `.env.example` file.
- Prefer environment variables for deployment-specific settings.

## Testing Expectations

- Optimizer logic, scoring rules, constraint handling, and data transformation code require tests.
- Feature engineering and model evaluation code must include leakage checks or tests that enforce time-aware data boundaries.
- Bug fixes in shared logic should include regression coverage.

## Collaboration

- Work should happen on feature branches and be reviewed through pull requests.
- Keep commits focused and avoid mixing cleanup, product behavior, and formatting churn.
- Update docs when architecture, data contracts, or setup requirements change.
