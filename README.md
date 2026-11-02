# LogScope — Universal Log Viewer SDK

**Version:** 1.0.0-alpha.1 · React + TypeScript + Tailwind CSS playground · MIT

An embeddable, transport-independent log viewer. Core normalizes arbitrary log shapes; source adapters connect to REST, SSE or WebSocket; React renders search, severity filter, event inspector, JSON/TXT export and summary metrics.

## Quickstart

Requirements: Node.js 20+ and npm 10+.

```bash
npm install
npm run dev
```

Open http://localhost:5173 and add a source. You can connect a REST, WebSocket or SSE endpoint, or import a local `.log` / `.txt` file.

```bash
npm run build
npm run test
```

## Package layout

- `@logscope/core` — source contracts, normalizers, parsing, deduplicated in-memory log store and plugin lifecycle
- `@logscope/react` — viewer component and CSS
- `@logscope/adapter-rest` — REST and polling
- `@logscope/adapter-sse` — browser EventSource
- `@logscope/adapter-websocket` — browser WebSocket
- `@logscope/playground` — Vite + React + Tailwind UI / connection builder

## Embed into another React application

```tsx
import {useMemo} from 'react';
import {LogViewer} from '@logscope/react';
import {RestAdapter} from '@logscope/adapter-rest';
import '@logscope/react/style.css';

export function Logs(){
  const adapter=useMemo(()=>new RestAdapter(),[]);
  const source={id:'my-backend',name:'My service',type:'rest',config:{url:'/api/logs',pollIntervalMs:5000},mapping:{listPath:'data.logs',fields:{timestamp:'createdAt',level:'severity',message:'message',service:'service'}}};
  return <LogViewer source={source} adapter={adapter} height={650}/>;
}
```

Do not pass a newly constructed adapter object every render; memoize it. For nested text logs use `mapping:{listPath:'tests',rawTextPath:'rawLogs'}`.

## Safety + practical limitations

- The frontend does not bypass CORS. Use a same-origin backend proxy or configure CORS on trusted APIs.
- Never put API tokens, secrets or unrestricted remote URLs into browser-distributed configuration. Authenticate at your backend.
- Source data is shown in the event inspector and exported; redact sensitive data **before** handing records to this alpha SDK.
- No backend indexing, resume cursors, server-side filtering, guaranteed delivery, automatic WebSocket reconnect, or production-ready handling of untrusted third-party plugins.
- REST poll emits all returned records; dedup uses IDs. For huge datasets use cursor-based backend APIs.
- For true zero-config arbitrary APIs, manual response mapping is still sometimes required.
- Streaming HTTP, GraphQL subscriptions and cloud connectors are planned extension points, not included adapters.
- `raw` is included in the memory store and exports. Do not feed secrets into it.

## Release

The `@logscope/*` names here are local workspace identifiers, not proof of npm registry ownership or publication. Verify the namespace before publishing. For an alpha release, run build/tests, `npm pack --dry-run` per package, then publish core before dependent packages. Version peers/dependencies consistently.

See `docs/ARCHITECTURE.md`, `docs/INTEGRATION.md` and `docs/ROADMAP.md`.

## Vite workspace package resolution (fixed in alpha.2)

The Vite playground aliases workspace imports directly to `packages/*/src`, allowing
`npm run dev` immediately after `npm install`, without first building each SDK package.
Published packages still expose compiled `dist` files through package exports.

```bash
npm install
npm run dev       # local development (source aliases)
npm run build     # builds packages before the Vite application
npm run test
```

For a clean rebuild run `npm run clean && npm run build`.

### Dependency security

If npm reports vulnerabilities, run `npm audit --json` to identify affected
dependencies and available patched versions; avoid blindly using
`npm audit fix --force`, which can introduce breaking major-version upgrades.


## Auto-detection studio

The playground opens the Auto Detect API workflow by default. See [docs/AUTO_DETECTION.md](docs/AUTO_DETECTION.md) for API probing, ADTS raw-text parsing, manual field mapping and CORS notes.

## Violet Dark + Light Studio (updated build)

The React playground has a black/violet-blue aesthetic with a matching light theme. It includes Live Logs, Compare, Replay, connection testing (REST GET/POST, WebSocket first-message, SSE first-event), local `.log` / `.txt` import, automatic response detection, field visibility/rename, searchable combined events, timestamp offsets, JSON export, and browser IndexedDB history. Add a source to begin; no demo events are preloaded.

### Start

```bash
npm install
npm run dev
```

The Vite playground resolves workspace TypeScript source locally; no manual package build is required before `npm run dev`. Run `npm run build` to build publishable packages and playground.

### Important alpha limitations

- API testing is performed by the *browser*: `localhost` means the end user's computer; CORS and authentication still apply.
- WebSocket and SSE test mode waits for a first message and does not reliably discover silent or non-message events.
- This alpha polls REST sources every 10 seconds and does not yet support cursor-based pagination, resumable streaming, secure credentials vaults, source-level retention policies, or reconnect/backpressure robustness.
- IndexedDB preserves captured or imported events across page refresh, but does not collect new data when the browser is closed.
- Playback reconstructs captured events; it does not execute their original external actions. Cross-app proximity is not proof of causality.
- Timestamp offsets are manually configurable, not automatically inferred clock skew.
- 3-hour retention is a target subject to quotas and maximum event count; the UI does not guarantee uninterrupted coverage.
