# ScoutIQ Security

This document records ScoutIQ's threat model, implemented controls, deployment assumptions, security checks, and residual risks. It describes a portfolio security-hardening pass; it is not a penetration-test report, security certification, or claim that the application is completely secure.

## Threat Model

### Assets

- PostgreSQL credentials and serving data
- optional OpenAI or Azure OpenAI credentials
- integrity and provenance of ingested snapshots, model artifacts, evaluations, and optimizer output
- API/provider availability and bounded compute spend
- non-sensitive operational configuration and deployment metadata

### Relevant actors

- an unauthenticated caller sending malformed, oversized, high-rate, or adversarial API requests;
- a caller attempting to spoof proxy headers or cross-origin browser access;
- malformed or compromised public FPL/provider responses;
- an operator supplying invalid or unsafe environment configuration;
- a compromised dependency or CI action; and
- accidental credential or local-identity disclosure through source, history, logs, errors, artifacts, or documentation.

### Trust boundaries

1. Browser to Express API
2. Express API to PostgreSQL
3. Express API to the optional explanation provider
4. Local ingestion to official public FPL endpoints
5. Ignored public snapshot package to the Databricks managed Volume
6. Developer/CI environment to repository source and generated artifacts

There are no user accounts, cookies, authenticated browser sessions, uploaded files, HTTP ingestion routes, or HTTP administrator/maintenance routes.

## Implemented HTTP Controls

### Rate limiting

All requests pass through an in-memory per-client-IP limiter before route dispatch, including unknown `/api` requests.

| Policy | Default | Covered requests |
| --- | ---: | --- |
| Global | 100 requests per 900,000 ms | Every route group and 404 response |
| Expensive | 20 requests per 900,000 ms | `GET` and implicit `HEAD` on `/api/evaluation/data-health`, `POST /api/analyze`, all three optimizer POST routes, and `POST /api/agent/explain-recommendation` |

The expensive limiter is additional to the global limiter. Responses use HTTP `429`, stable JSON error codes, draft-7 standard rate-limit headers, and no legacy rate-limit headers.

Express `req.ip` is normalized through the rate-limit library's IP key generator. `TRUST_PROXY` defaults to `false`; literal `true`, unspecified addresses, non-canonical networks, IPv4 CIDRs broader than `/16`, IPv6 CIDRs broader than `/32`, and mapped-IPv4 CIDRs broader than `/112` are rejected. A deployment may configure only explicit trusted proxy IPs or narrow deployment-owned CIDRs. Consequently, arbitrary `X-Forwarded-For` input does not select a client identity in the default configuration.

The store is process memory. It is appropriate only for a single API instance and resets when that process restarts. Multiple instances require an external shared store before aggregate enforcement can be claimed.

### Request parsing

Secure defaults are centrally validated:

| Limit | Default |
| --- | ---: |
| JSON body | 65,536 bytes |
| URL-encoded body | 16,384 bytes |
| Query parameters | 20 |
| URL length | 2,048 characters |

JSON parsing is strict, compressed request bodies are rejected, URL-encoded parsing is non-nested, and Express uses its simple query parser. Malformed JSON returns `400`, oversized bodies return `413`, unsupported media types/encodings return `415`, and oversized URLs return `414`. Unknown routes return a stable JSON `404`.

### Validation bounds

All route queries reject unknown keys; POST routes also reject query keys. JSON object schemas are strict, finite numbers must be JSON numbers rather than coerced strings, and bounded enums are used where applicable.

Important route limits include:

- canonical positive database IDs from 1 through 2,147,483,647;
- gameweeks from 1 through 38;
- list/query result limits from 1 through 100;
- trimmed player searches from 1 through 100 characters;
- analysis squads with exactly 11 starting and 4 bench players, unique IDs, bank from 0 through 100, and weights from 0 through 1;
- optimizer squads with exactly 15 unique players, budget from 1 through 200, bank from 0 through 200 with bank not exceeding budget, and both caller-supplied and database-derived transfer/squad candidate pools capped at 100;
- player prices, predicted points, display scores, free transfers, hits, and reserved bank constrained to their route-specific ranges;
- no more than two transfer recommendations, two moves per recommendation, ten unique prediction-run IDs, 32 constraint checks, or 16 constraint violations in agent input; and
- provider explanation arrays capped at 12 entries with each text field capped at 2,000 characters.

Duplicate player IDs, prediction-run IDs, and other semantically unique lists are rejected.

### Headers, CORS, and errors

- Helmet sets API security headers.
- `X-Powered-By` is disabled.
- Every response receives an opaque request ID.
- CORS accepts an exact, validated origin allowlist; wildcard origins and credentialed CORS are disabled.
- Production requires HTTPS origins.
- Disallowed browser origins receive a stable `403` response.
- Production `500` responses contain neither a stack trace nor internal exception details.
- Request bodies and secret headers are not logged by application middleware.
- The evaluation health response returns only an artifact basename, never an absolute local path.
- The configured evaluation history artifact is capped at 32 MiB with checks before and after the read.

When the React application is hosted separately, its static host must set its own CSP and browser security headers; API Helmet headers do not protect HTML served by a different service.

## Environment Configuration

`apps/api/src/config.ts` is the central server configuration boundary. It loads the canonical root `.env` for local development, validates types/ranges/relationships, and fails startup with variable names only. Secret values are not included in configuration errors or public status responses.

Production configuration must come from the hosting platform's secret/configuration store. The tracked `.env.example` contains placeholders and safe non-secret defaults only. Local `.env` files are ignored.

### Server-only secrets

- `DATABASE_URL`
- `POSTGRES_PASSWORD`
- `OPENAI_API_KEY`
- `AZURE_OPENAI_API_KEY`

These values must never use a `VITE_` prefix or be placed in frontend source, build configuration, documentation, screenshots, or client responses.

### Non-secret server configuration

- runtime: `NODE_ENV`, `PORT`, `API_BIND_ADDRESS`, `SCOUTIQ_APP_VERSION`
- browser/proxy policy: `CORS_ALLOWED_ORIGINS`, `TRUST_PROXY`
- rate limits: `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `RATE_LIMIT_EXPENSIVE_MAX`
- parser limits: `JSON_BODY_LIMIT_BYTES`, `URLENCODED_BODY_LIMIT_BYTES`, `MAX_QUERY_PARAMETERS`, `MAX_URL_LENGTH`
- PostgreSQL: `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `DATABASE_SSL`, `DATABASE_SSL_REJECT_UNAUTHORIZED`, `DATABASE_CONNECT_TIMEOUT_MS`, `DATABASE_QUERY_TIMEOUT_MS`
- agent: `SCOUTIQ_AGENT_ENABLED`, `SCOUTIQ_AGENT_PROVIDER`, `SCOUTIQ_AGENT_TIMEOUT_MS`
- provider metadata: `OPENAI_MODEL`, `OPENAI_BASE_URL`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`

The API binds to `127.0.0.1` by default; a production platform that requires an all-interface listener must explicitly set `API_BIND_ADDRESS=0.0.0.0`. Production PostgreSQL requires `DATABASE_URL` and an explicit `DATABASE_SSL=true`. Certificate verification defaults on and cannot be disabled in production configuration. Connection-string query parameters and fragments are rejected so `pg` cannot override the validated TLS policy. Database connections time out after 5 seconds and statements/queries after 30 seconds by default. Provider URLs must use HTTPS in production and cannot contain URL credentials, query strings, or fragments.

### Local tooling configuration

- `POSTGRES_BIND_ADDRESS` controls the local Docker port bind address.
- `SCOUTIQ_API_URL`, `SCOUTIQ_WEB_URL`, and `SCOUTIQ_SMOKE_TIMEOUT_MS` configure smoke checks and must not contain credentials.
- `FPL_SEASON` labels operator-run ingestion output; it is batch metadata, not API runtime configuration.
- `PYTHON` optionally selects the local Python executable used by `scripts/run-python.mjs`.

Repository wrappers load only the variables each command needs. Smoke checks receive only
their three `SCOUTIQ_*` settings, ingestion reads only `FPL_SEASON`, and the Python wrapper
loads only `PYTHON` while removing database and provider credentials from the child process.

### Public frontend configuration

None. The web client uses relative `/api` requests and reads no `import.meta.env` values. Every future `VITE_*` value must be assumed public and explicitly approved by the frontend environment check.

Obsolete example-only names removed during consolidation include `FRONTEND_URL`, `FPL_API_BASE_URL`, `CACHE_TTL_SECONDS`, `RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_STRICT_MAX`, `REQUEST_SIZE_LIMIT`, `LOG_LEVEL`, `VITE_API_BASE_URL`, `VITE_APP_NAME`, and `AZURE_OPENAI_MODEL`.

## Data, Injection, and Provider Boundaries

### PostgreSQL

HTTP-controlled SQL values use parameterized queries. The reviewed request path does not accept raw SQL, table names, or column names. Database credentials remain server-only, and database errors are mapped to non-sensitive API responses.

### XSS and browser storage

React renders API, player, and provider strings through normal escaped text nodes. No `dangerouslySetInnerHTML`, manual `innerHTML`, or raw HTML rendering exists in the frontend source. Session storage contains squad/analysis navigation state only; it is neither authenticated nor trusted by the server.

### SSRF, redirects, paths, and commands

- Callers cannot supply outbound URLs. Public FPL sources are fixed, while provider endpoints are server configuration validated at startup.
- No open redirect is implemented.
- HTTP callers cannot choose local file paths. Evaluation artifact paths come from server configuration, are size-checked, and are not returned verbatim.
- Request data is not passed to a shell, `eval`, `Function`, or dynamic module loader.
- Simple query parsing plus strict schemas avoids untrusted nested-object merging and reduces prototype-pollution exposure.

### LLM safety

The provider receives a completed optimizer result and cannot mutate the deterministic recommendation object. The prompt requests explanation-only output, but schema and grounding checks cannot prove the semantic faithfulness of every free-text sentence. Provider text is therefore treated as bounded narrative, not as a new optimizer decision. Provider fetches use a configurable timeout from 1 to 60 seconds, defaulting to 10 seconds.

Live generation is capped at 800 output tokens and responses are capped at 131,072 bytes before JSON parsing through both `Content-Length` validation and streamed byte accounting. Output must then pass strict schema and grounding checks. Oversized, malformed, ungrounded, timed-out, or unavailable provider behavior falls back to deterministic local explanation without exposing raw provider errors.

### External data provenance

Public FPL payloads are schema-validated before normalization. DB-backed IDs are capped at PostgreSQL `INTEGER`, gameweeks at 38, and statistics/fixture scores at finite domain bounds; parse errors do not echo rejected external values. Normalized manifests preserve source metadata; PostgreSQL load plans and Databricks package metadata add deterministic snapshot/file hashes. The snapshot packager captures each allowlisted non-symlink regular source file once into a staging directory and binds validation and hashing to those exact bytes. It caps history at 32 MiB and uses the normalized-file limits below for the other sources. Databricks Bronze checks all seven uploaded package-file lengths before JSON parsing or SHA content processing, verifies the six declared data-file digests and snapshot linkage, and rejects malformed required flags plus null, non-finite, and out-of-domain numerics in Bronze/Silver.

The TypeScript loaders and local compatibility reader accept only non-symlink regular files, detect replacement or mutation while reading, use strict UTF-8/JSON, and cap the manifest at 256 KiB, players/fixtures at 8 MiB each, and teams/events at 512 KiB each. Local prediction JSONL is capped at 16 MiB, 5,000 rows, and 64 KiB per row; model/evaluation JSON is capped at 4 MiB. Those artifacts are decoded as strict UTF-8 and parsed from the same buffers that are hashed; strict loader schemas reject coerced, non-finite, duplicate, malformed-hash, lineage-inconsistent, or oversized fields before database writes.

Expected-points JSONL inputs are capped at 64 MiB, 64 KiB per line, and 100,000 rows; model JSON is capped at 4 MiB. Player history is capped at 16 MiB and 400,000 rows, with exact fields, ingestion-aligned numeric domains, unique player/fixture pairs, snapshot/season/player-count lineage, and complete player/fixture/gameweek/team references. Local medallion parsing likewise rejects bool-as-int values, truthy-string flags, unknown normalized fields, and non-finite/out-of-domain records before transforms. The résumé-evidence generator uses a 64 MiB aggregate input budget and binds strict parsing/counting to SHA-256 provenance in the same bounded read; it emits counts and evaluation metrics only after package hashes, lineage, finite domains, and internal record counts agree.

## Security Audit Coverage

| Area | Status and evidence | Remaining limitation |
| --- | --- | --- |
| Secrets management | Canonical secret names, ignored local files, redacted repository/history scanner, frontend boundary scanner | Rotation is external; pattern scans cannot prove that every possible credential format is absent |
| Environment configuration | Central typed startup validation and non-sensitive errors | Platform secret-store policy is deployment-specific |
| Rate limiting / DoS | Global and expensive-route quotas with automated threshold, header, IP-isolation, spoofing, and route-coverage tests | In-memory, single-instance, restartable counters |
| Input validation | Strict schemas, semantic bounds, duplicate rejection, body/query/URL limits | Upstream public schemas can evolve and require maintenance |
| SQL injection | Parameterized request values; injection-shaped search tested as data | Database permissions and network controls depend on deployment |
| XSS | React escaping and no raw-HTML sink found in frontend source | A separate static host must add its own CSP/headers |
| SSRF | No caller-controlled URL fetch; configured provider URLs validated | An operator can intentionally configure an allowed HTTPS provider host |
| Path traversal | No caller-selected filesystem path; absolute evaluation path removed from response | Batch CLI arguments are operator-trusted, not an untrusted HTTP boundary |
| Command injection | No request-to-shell path, `eval`, or dynamic function construction | Operator-run scripts still inherit local shell/account security |
| Prototype pollution | Simple query parser, non-nested forms, strict object schemas | Dependency updates require continued audit |
| Error and log leakage | Stable errors, production redaction, request IDs, no request-body logger | Hosting/platform logs are outside repository control |
| CORS | Exact HTTPS production allowlist, no wildcard or credentials | Misconfigured deployment origins can block legitimate traffic |
| CSRF | Not applicable to the current cookie-free, unauthenticated, non-mutating HTTP design | Reassess before adding cookies, accounts, or state-changing routes |
| Authentication / authorization | No privileged HTTP route exists, so no administrator key was added | Public endpoints remain available to any network caller |
| Dependency vulnerabilities | Compatible upgrades/removals resolved the audit findings; current Node and Python audits report no known advisories | Python requirements are pinned but not hash-locked; both audits must be rerun as advisory data changes |
| CI / supply chain | Read-only workflow permissions, no PR secret dependency, full history for scanning, immutable action SHAs, checkout credentials not persisted | Hosted CI status is not asserted here |
| Databricks exposure | Bundle hard-codes no host, token, identity, or user path; only public data is packaged | Free Edition derives its deployment root from the current user and has limited security customization and no SLA |
| Database credentials | Server-only values, placeholder example, TLS verification, no connection string in docs | Backup, network isolation, and rotation depend on the database provider |
| LLM prompt/output safety | Optimizer object is immutable to the provider; token/byte caps, timeout, strict schema, grounding, and fallback bound narrative handling | Schema/grounding cannot prove semantic faithfulness of free text; public calls still consume quota within limits |
| Provider failure handling | Abort timeout, bounded read, stable fallback, no raw provider error | Live-provider behavior remains mock-tested unless deployed separately |
| Data provenance | Source metadata, snapshot hashes, exact file-hash verification, prior-only features | Public upstream correctness is not independently guaranteed |
| Production versus local | Explicit CORS/proxy/TLS validation and documented hosting assumptions | No production authentication, shared limiter, monitoring, scheduler, or backup implementation is included |

## Remediated Findings

| Severity | Finding / evidence | Affected files | Fix and validation | Remaining limitation |
| --- | --- | --- | --- | --- |
| Medium | Successful expensive work was not counted, cheap group paths could consume the strict bucket, and body parsing preceded quotas | `apps/api/src/app.ts`, `index.ts` | Exact global/expensive classifiers now run before parsers; `app.security.test.ts` covers thresholds, all route groups, aliases, implicit `HEAD`, headers, independent IPs, and spoofing | Process-memory counters reset and are not shared |
| Medium | Bodies, URLs, and multiple HTTP contracts lacked uniform strict bounds | `app.ts`, `routes/*.ts`, `agent/schemas.ts` | Central byte/URL limits plus strict Zod contracts, finite ranges, canonical IDs, duplicate rejection, and malformed/oversized/media-type tests | Bounds need review when contracts evolve |
| Medium | Fixed public FPL responses could carry DB-overflow IDs, non-finite values, or implausible scores | `ingestion/schemas.ts`, `normalizers.ts`, `history.ts` | DB/gameweek/domain bounds, collection caps, non-echoing parse errors, and normalization/history regression tests | Upstream schema evolution still requires maintenance |
| Medium | Local prediction/model/evaluation artifacts were numerically coerced and lacked file, row, array, hash, and domain caps | `db/predictionLoadPlan.ts`, `predictionLoader.ts` | Strict finite schemas, DB/gameweek/domain/hash/duplicate checks, 5,000-row and 16 MiB/64 KiB/4 MiB caps; loader regressions and the current 841-row artifact pass | Batch paths remain operator-selected and large valid loads still depend on DB capacity |
| Medium | DB-derived optimizer pools bypassed the caller's 100-player work cap | `routes/optimizer.ts` | Cap DB candidates at 100 while preserving current players and a budget-, reserve-, availability-, team-, and position-feasible seed; regressions cover the 841-player artifact plus unavailable and unaffordable high-ranked pools | The deterministic double-transfer search remains the main bounded CPU cost |
| Medium | Production networking/configuration allowed unsafe proxy/TLS/bind or unbounded DB waits | `config.ts`, `db/client.ts`, `index.ts`, `.env.example` | Loopback bind default; canonical narrow proxy trust; required verified production TLS; query-string override rejection; 5s connect/30s query defaults; config/effective-pool tests | Hosting secret storage, DB networking, and timeout tuning remain operator duties |
| Medium | Provider calls had timeout/byte caps but no billed generation cap | `agent/explanationService.ts` | Fixed 800-token output limits for OpenAI/Azure plus request-body tests | Free-text semantic faithfulness cannot be proven; public calls still consume quota |
| Medium | Evaluation health could reveal an absolute artifact path and read an unexpectedly large file | `evaluation/dashboard.ts`, `routes/evaluation.test.ts` | Basename-only metadata, path-free warnings, 32 MiB pre/post-read checks, and regression tests | Operator/platform logs are outside this API boundary |
| Medium | Snapshot packaging and Databricks Bronze could read oversized files, validate/hash different source bytes, or trust declared integrity metadata | `scripts/prepare_databricks_snapshot.py`, `src/scoutiq_databricks/bronze.py`, snapshot/Spark tests | Bounded race-resistant source capture, 32 MiB history cap, uploaded-file length checks before parse/hash, and verification of every packaged SHA-256 and snapshot link; oversize/replacement/tamper regressions pass | Public capture authenticity and metadata signing remain external |
| Medium | TypeScript loaders, expected-points, local medallion, and production Spark parsing could read unbounded files, coerce booleans/truthy strings, silently skip mismatched history, or accept non-finite/unsafe records | `apps/api/src/ingestion/localJson.ts`, `db/fplLoader.ts`, `ingestion/history.ts`, `pipelines/expected_points/*`, `pipelines/databricks/transforms.py`, `src/scoutiq_databricks/{bronze,silver}.py` | Bounded race-resistant reads, strict non-boolean integers/flags, exact schemas, collection/domain/lineage/reference limits, and finite feature/target validation; local, real-artifact, and Spark regressions pass | Future artifact and feature types need equivalent validation |
| Medium | Canonical résumé metrics trusted metadata-derived counts and used separate reads for values and provenance hashes | `scripts/generate_resume_metrics.py`, its tests | Same-capture strict parse/count plus SHA-256, exact package hash/count/history verification, and bounded finite claim schemas; tamper/count/domain tests pass | The generator verifies repository artifacts, not claims made outside the canonical evidence file |
| Medium | Node audit initially reported actionable advisories, including a critical unused dev-chain advisory and vulnerable runtime/build packages | workspace manifests and `pnpm-lock.yaml` | Removed unused dependencies, applied compatible patched releases/override, and moved Vite to a patched major; current Node/Python audits report no known advisories | Python pins have no hash-locked transitive file; advisory data changes |
| Low | Secret checks missed several ignored credential paths, quoted JSON keys, binary containers, and frontend credential classes | `scripts/security/*`, `.gitleaks.toml`, `.gitignore` | Expanded redacted scanners, immutable commit-scoped allowlisting, binary-container detection, and three end-to-end scanner regressions; custom and Gitleaks scans pass | Pattern detection cannot prove absence of every possible secret format |
| Low | Frontend search and route parsing accepted overlong terms or numeric prefixes | `apps/web/src/components/*Search.tsx`, `PlayerDetailPage.tsx` | 100-character search bound and canonical positive-ID parsing before requests; production build scanner passes | API validation remains authoritative |
| Informational | Documentation duplicated setup, linked stale files, named inactive variables, and embedded a synthetic local DB URL | README and `docs/*` | Consolidated into five canonical documents, placeholders, current commands/links, and corrected CI/screenshot/metric qualifications | Documentation must evolve with code and hosted CI remains unverified |

## Run Security Checks

Install Node and Python development dependencies first, then run:

```sh
pnpm run security:check
```

The command runs:

1. `security:secrets` over current tracked files, relevant untracked/ignored local files, and the complete Git patch history; findings contain file/rule metadata but never the matched value;
2. production API and frontend builds followed by `security:frontend` over web source, configuration, and built assets for unapproved `VITE_*`, server-secret names, and credential patterns;
3. `pnpm audit --audit-level=moderate`;
4. `node scripts/run-python.mjs -m pip_audit --strict -r requirements-dev.txt`; and
5. API, local pipeline, snapshot-packaging, expected-points, PySpark, and résumé-evidence security-relevant tests.

Additional full validation remains:

```sh
pnpm run build
pnpm run test:smoke
pnpm run pipeline:test
pnpm run databricks:snapshot:test
git diff --check
```

Gitleaks can be run as a second independent scanner when installed:

```sh
pnpm run security:gitleaks
```

The repository configuration extends Gitleaks defaults and excludes generated dependency/virtual-environment installations plus Git internals; application paths are not broadly excluded. Keep output redacted; never paste a matched value into an issue, terminal transcript, or audit report.

## Credential Rotation And History Cleanup

If any likely real credential is detected:

1. revoke or rotate it immediately at the provider;
2. remove it from the current tree and replace it with a server-side environment reference;
3. confirm local credential/config files are ignored;
4. identify affected files and commits without copying the value;
5. coordinate a history rewrite with all collaborators; and
6. re-scan the rewritten mirror before force-updating remote refs.

Do not rewrite shared history automatically. A coordinated cleanup can use a fresh mirror plus `git filter-repo --sensitive-data-removal --replace-text <private-replacements-file>`, followed by provider-specific cache/support steps and a forced re-clone for collaborators. Keep the replacements file outside the repository and destroy it securely after verification.

## Vulnerability Reporting

Use the repository host's private security-advisory channel when available. Do not open a public issue containing exploit details, credentials, private workspace metadata, personal identifiers, or database contents. Include the affected version/commit, reproduction steps using synthetic data, impact, and a proposed mitigation if known.

## Residual Risks

- The API is intentionally unauthenticated and should not be treated as a private multi-user service.
- Rate limits are per-process memory only and reset on restart.
- Provider calls can incur latency or cost within the allowed quota.
- Live provider integrations are mock-tested unless an operator validates them privately.
- The static frontend host needs independent CSP/security-header configuration.
- Database network isolation, backups, monitoring, and credential rotation are deployment responsibilities.
- Scheduled ingestion/model refresh and freshness monitoring are not implemented as a production scheduler.
- Databricks Free Edition is quota-limited, lacks a production SLA, and has restricted security customization.
- Dependency and secret scans are detection controls, not proof of absence or immunity from supply-chain compromise.
- Python transitive dependencies are not hash-locked, and several operator-only batch readers intentionally load bounded local artifacts in memory; keep those jobs inside the local/CI trust boundary.
- Databricks file hashes detect inconsistent package contents but are not signed; an actor able to replace both files and metadata remains inside the trusted deployment boundary.
- Some public prediction reads can return a complete loaded run; the global quota bounds request frequency, not response size.
- No hosted CI result, formal penetration test, or production security certification is claimed by this document.
