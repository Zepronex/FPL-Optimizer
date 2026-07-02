# FPL Data Ingestion

The Day 2 ingestion path fetches only official Fantasy Premier League data:

- `https://fantasy.premierleague.com/api/bootstrap-static/`
- `https://fantasy.premierleague.com/api/fixtures/`

The TypeScript ingestion module lives in `apps/api/src/ingestion`. It validates the raw response shape with Zod, normalizes players, teams, events, and fixtures into typed records, checks basic references, then writes deterministic JSON files.

## Output

By default, ingestion writes these local files:

- `data/fpl/latest/manifest.json`
- `data/fpl/latest/players.json`
- `data/fpl/latest/teams.json`
- `data/fpl/latest/events.json`
- `data/fpl/latest/fixtures.json`

The `data/` directory is gitignored. The manifest records source URLs, fetch timestamps, HTTP cache metadata when present, season, current event, schema version, and record counts.

## Commands

From the repository root:

```powershell
pnpm.cmd run ingest:fpl
```

Windows PowerShell wrapper:

```powershell
.\scripts\ingest-fpl.ps1
```

Optional output and season:

```powershell
pnpm.cmd run ingest:fpl -- --out data/fpl/2026-27 --season 2026-27
.\scripts\ingest-fpl.ps1 -OutputDir data/fpl/2026-27 -Season 2026-27
```

## Scope

This foundation does not add ML models, optimizer behavior, or LLM features. The normalized records are local JSON for now and are shaped so they can be inserted into a database later without changing the source ingestion contract.
