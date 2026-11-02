# API Auto-Detection (Alpha)

## Quick start

1. Run `npm install` followed by `npm run dev`.
2. Open the **Auto Detect API** page.
3. Paste a GET REST endpoint, for example `http://localhost:8001/api/logs/raw-test/v2?applicant_no=2026090642462&startTime=12:06:23`.
4. Select **Test & Auto Detect**. The browser fetches the API, detects fields and renders parsed log entries.
5. If detection is imperfect, adjust the array path or raw text field and choose **Apply field mapping**.

### Response from ADTS

The API returns `tests[]` containing `rawLogs` strings. Detection selects `listPath: tests` and `rawTextPath: rawLogs` and extracts each timestamped Python-style log entry (timestamp, logger/executable, level, message and bracketed tags). Other test fields remain available as detection metadata.

### CORS / networking

This tool executes in your browser. For the frontend on `http://localhost:5173`, the API on `http://localhost:8001` must permit CORS from that origin and must be reachable from the browser. `localhost` always refers to the computer running the browser. Do not disable browser security to fix CORS. Do not paste secrets into a URL. For protected or third-party services, use a trusted backend proxy with authorization and an allowlist, not an unrestricted server-side URL fetch endpoint.

### Detection scope

Supports nested JSON arrays (e.g. `tests`, `data.logs`, `items`, `payload.events`), simple structured JSON objects, raw multi-line timestamped strings, and Python-style log lines. Custom mapping remains necessary for ambiguous formats. This is REST GET auto-detection; live WebSocket and SSE adapters are configured separately.

### Performance and safety

A large response is loaded into browser memory in alpha. Add server-side pagination, stream processing, response-size limits, virtualized rendering, data redaction and field allowlists before production deployment.
