# API response mapping examples

## Nested REST JSON

```json
{"data":{"logs":[{"createdAt":"2026-11-02T10:00:00Z","severity":"ERROR","message":"Failure","service":"orders"}]}}
```

Use mapping `{listPath:'data.logs',fields:{timestamp:'createdAt',level:'severity',message:'message',service:'service'}}`.

## ADTS-style raw log text

```json
{"tests":[{"rawLogs":"2026-11-02 10:30:00 ERROR Stream lost\n2026-11-02 10:30:01 INFO Retrying"}]}
```

Use `{listPath:'tests',rawTextPath:'rawLogs'}`. This preserves multi-line grouping and avoids hardcoding `applicant_no` in the SDK; pass project-specific query values in the URL from the host app.

## SSE

Use `new SSEAdapter()` with `{url:'/api/stream',withCredentials:true}`. The server should send `data: {"level":"INFO","message":"hi"}\n\n` frames. Native EventSource is GET-based and does not support arbitrary custom headers.

## WebSocket

Use `new WebSocketAdapter()` with `{url:'wss://domain/ws'}`. On each message, valid JSON is parsed; otherwise the string is fed into the text parser. Use server-mediated authentication rather than exposing a secret in the URL.

## Field customization

`listPath` uses simple dot paths. For unusual nesting use `transform` and `mapRecord`. The alpha does not implement a full JSONPath grammar.

## Log filtering

Search supports `ERROR | WARNING` (OR) and `timeout + payment` (AND); words are matched case-insensitively against message, level, service, traceId. This is client-only search over the currently buffered events.
