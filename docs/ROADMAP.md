# Release roadmap

## Alpha v1.0.0-alpha.1 — included
- TypeScript core with normalized log schema
- REST GET/POST + polling adapter
- SSE browser adapter
- WebSocket browser adapter
- Nested JSON field mapping, raw multiline text parsing
- React event explorer, severity selection, search, summary counts, event details
- JSON/TXT download
- Standalone Vite React + Tailwind CSS playground
- Core unit tests and documentation

## Beta priorities
- Security: pre-store redaction, safe auth/permissions, controlled remote endpoints
- Reliability: reconnect with jitter, resume cursors, heartbeats, failover, streaming overflow limits
- Performance: virtualized lists, worker parsing, batched subscription updates
- Data quality: timezones, custom parsers, per-source stable identifiers, advanced mapping wizard
- Search: server-side query API and pagination
- UI: accessible keyboard navigation, shadcn/ui components, advanced timeline, field filters
- Integrations: production GraphQL, streaming HTTP, file drop, telemetry plugin, correlation view
- CI/CD: npm publish workflow, package smoke tests, examples, size budgets

## Problems solved
- Avoid custom log-viewer UI per product
- Let host apps pass different log schemas through mapping
- Rapidly embed search, severity filters, event details, and downloads
- Separate transport concerns from reusable UI

## Important
"v1.0.0-alpha.1" is a prerelease milestone, not a stable 1.0 support promise. API breaking changes may occur.
