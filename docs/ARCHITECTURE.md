# HLD / LLD: LogScope SDK alpha

## HLD

Host React App → LogViewer → LogEngine → SourceAdapter (REST | SSE | WebSocket) → ResponseMapping → normalizeResponse → LogEntry[] → buffered store → filtering & inspector → export.

Core has no React dependency. Adapters only know `connect(config, context)` and `disconnect()`. `SourceContext.emit` delivers raw batches. Engine normalizes batches, deduplicates by ID, buffers up to maxEntries, and notifies subscribers. React uses core subscriptions, not backend-specific state.

## Contracts

`LogEntry`: id, timestamp (ISO), level, message, sourceId, optional service/traceId, metadata, raw.
`LogSource`: id, name, type, config, mapping.
`FieldMapping`: listPath, rawTextPath, optional fields/transform/mapRecord.
`LogSourceAdapter`: connect/disconnect, status, emit, error, AbortSignal.
`LogPlugin`: setup(engine) with optional teardown.

## Data flow

1. Host chooses adapter instance and config.
2. `LogEngine.connect` aborts old source, empties store, sets status.
3. Adapter fetches or opens transport and emits raw payload.
4. `normalizeResponse` extracts and maps record(s), including multi-line timestamped text.
5. Engine deduplicates by stable event ID, truncates retained data to cap, notifies React.
6. React filters/searches/sorts, presents events and optional raw JSON.
7. On unmount or source switch, engine stops the adapter and releases listeners.

## Extension points and intended improvements

- Connector registry and factory for dynamic plugin installation rather than supplying `adapter` directly.
- Parser strategies for non-JSON formats and timestamp formats.
- Secure redaction pipeline before `LogEntry.raw` is retained.
- Server-side filtered queries and cursor pagination.
- Virtualized log table and batched stream updates.
- Authentication callbacks/secure backend proxy.
- Streaming HTTP and GraphQL subscription adapters.
- WebSocket backoff/jitter and SSE error recovery monitoring.
- Plugin UI slots and custom metrics with controlled permissions.

## Known alpha limitations

No production auth or redaction, no log virtualization, no streaming overflow/backpressure mechanism, SSE relies on native browser reconnection, WebSocket has no auto-reconnect, auto timestamp normalization for ambiguous timezone input may not be accurate. The generated sample data is not operational telemetry.
