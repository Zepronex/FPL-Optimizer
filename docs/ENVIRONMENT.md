# Environment Reference

This reference covers configuration used by the current ScoutIQ codebase and the example environment files. Do not commit real `.env` files, credentials, service account files, database dumps, or provider keys.

## Active Runtime Variables

| Variable | Used by | Local demo | Production API | Live LLM mode | Secret | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `NODE_ENV` | API error handling | Optional | Recommended | No | No | Use `production` for hosted API runtime. Development mode can include error details. |
| `PORT` | API server | Optional | Required when the host sets an expected port | No | No | Defaults to `3001` locally. |
| `FRONTEND_URL` | API CORS | Optional | Required for a deployed frontend origin | No | No | Defaults to `http://localhost:3000`; set to the deployed frontend origin before production traffic. |
| `SCOUTIQ_APP_VERSION` | API health response | Optional | Optional | No | No | Adds a safe version label to `GET /api/health`. |
| `DATABASE_URL` | API database config and database scripts | Optional when component variables are set | Required unless component variables are set | No | Yes | Preferred production setting because most managed PostgreSQL providers expose one URL. |
| `DATABASE_SSL` | API database config | Optional | Required when the database provider requires SSL | No | No | Accepts truthy values such as `true`, `1`, `yes`, or `on`. |
| `POSTGRES_HOST` | API database config | Optional | Alternative to `DATABASE_URL` | No | No | Defaults to `localhost` when `DATABASE_URL` is absent. |
| `POSTGRES_PORT` | API database config and Docker Compose | Optional | Alternative to `DATABASE_URL` | No | No | Defaults to `5432`. |
| `POSTGRES_DB` | API database config and Docker Compose | Optional | Alternative to `DATABASE_URL` | No | No | Defaults to `scoutiq`. |
| `POSTGRES_USER` | API database config and Docker Compose | Optional | Alternative to `DATABASE_URL` | No | No | Defaults to `scoutiq`. |
| `POSTGRES_PASSWORD` | API database config and Docker Compose | Optional for local defaults | Alternative to `DATABASE_URL` | No | Yes | Required if component variables are used for a non-default database. |
| `SCOUTIQ_AGENT_ENABLED` | Explanation agent | Optional | Optional | Required | No | Leave `false` for deterministic fallback. Set `true` only when provider config is available and tested. |
| `SCOUTIQ_AGENT_PROVIDER` | Explanation agent | Optional | Optional | Optional | No | Supports `auto`, `openai`, or `azure_openai`; defaults to `auto`. |
| `SCOUTIQ_AGENT_TIMEOUT_MS` | Explanation agent | Optional | Optional | Optional | No | Defaults to `10000`. |
| `OPENAI_API_KEY` | OpenAI explanation provider | No | Optional | Required for OpenAI mode | Yes | Keep private in the deployment secret store. |
| `OPENAI_MODEL` | OpenAI explanation provider | No | Optional | Required for OpenAI mode | No | Required together with `OPENAI_API_KEY`. |
| `OPENAI_BASE_URL` | OpenAI explanation provider | No | Optional | Optional | No | Defaults to `https://api.openai.com/v1`. |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI explanation provider | No | Optional | Required for Azure mode | Yes | Keep private in the deployment secret store. |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI explanation provider | No | Optional | Required for Azure mode | No | Endpoint URL for the Azure OpenAI resource. |
| `AZURE_OPENAI_DEPLOYMENT` | Azure OpenAI explanation provider | No | Optional | Required for Azure mode unless `AZURE_OPENAI_MODEL` is set | No | Preferred Azure deployment variable. |
| `AZURE_OPENAI_MODEL` | Azure OpenAI explanation provider | No | Optional | Alternative Azure deployment variable | No | Current code accepts this as a fallback for `AZURE_OPENAI_DEPLOYMENT`. |
| `FPL_SEASON` | FPL ingestion | Optional | Batch job only | No | No | Optional season label for ingestion when `--season` is not passed. |
| `SCOUTIQ_API_URL` | Smoke test script | Optional | Deployment smoke checks only | No | No | Defaults to `http://localhost:3001`; set to deployed API base URL for smoke checks. |
| `SCOUTIQ_WEB_URL` | Smoke test script | Optional | Deployment smoke checks only | No | No | Defaults to `http://localhost:3000`; set to deployed frontend base URL for smoke checks. |
| `SCOUTIQ_SMOKE_TIMEOUT_MS` | Smoke test script | Optional | Deployment smoke checks only | No | No | Defaults to `5000`. |

## Frontend Variables

`apps/web/.env.example` currently lists:

| Variable | Current status | Notes |
| --- | --- | --- |
| `VITE_API_BASE_URL` | Example-only | The current web client hardcodes relative `/api` requests in `apps/web/src/lib/api.ts`. A separate-origin deployment must use `/api` rewrites or update the client before relying on this variable. |
| `VITE_APP_NAME` | Example-only | Not read by the current web code. |

## Reserved Or Example-Only API Variables

`apps/api/.env.example` includes operational placeholders that are not currently read by `apps/api/src`:

- `FPL_API_BASE_URL`
- `CACHE_TTL_SECONDS`
- `RATE_LIMIT_WINDOW_MS`
- `RATE_LIMIT_MAX_REQUESTS`
- `RATE_LIMIT_STRICT_MAX`
- `REQUEST_SIZE_LIMIT`
- `LOG_LEVEL`

Do not rely on these as active production controls until the API code reads and validates them.

## Pipeline And Data Paths

The current batch pipeline uses command defaults and CLI flags rather than deployment environment variables for data paths. Generated local artifacts live under gitignored `data/` paths by default. Database loaders read the default paths from `apps/api/src/db/config.ts` unless code or command arguments are changed.

Production-like batch runs should keep generated artifacts and database credentials outside source control.
