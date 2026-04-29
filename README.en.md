# claude-fetch

`claude-fetch` captures Claude Code Messages API request/response artifacts locally and generates JSON, HTML, manifest, and log files for debugging, auditing, and prompt/response inspection.

Core principle: **no proxying, no route rewriting, no authentication environment override**. If Claude Code currently uses the official API, a custom gateway, Bedrock, Vertex, or a compatible endpoint, it keeps using the same route.

中文文档：[README.md](README.md)

## Features

- Capture complete request/response bodies from Claude Code official OTEL raw body files.
- Preserve original routing and authentication configuration.
- Recursively redact sensitive fields before writing artifacts.
- Generate browsable local reports: `index.html` and per-request detail pages.
- Support debug log fallback when OTEL raw body data is unavailable.
- Pair concurrent request/response events by `prompt.id`.

## Installation

Install globally after package publish:

```bash
npm install -g @matijun/claude-fetch
```

Install for local development:

```bash
git clone <repo-url>
cd claude-fetch
npm install
npm run build
npm link
```

Command after installation:

```bash
claude-fetch
```

## Quick start

Start Claude Code through `claude-fetch`:

```bash
claude-fetch
```

Equivalent to:

```bash
node dist/src/cli.js start -- claude
```

Send one prompt and write captures to a custom directory:

```bash
claude-fetch --output ./tmp-real-captures -- claude -p "hello"
```

Open overview page:

```bash
open ./tmp-real-captures/index.html
```

Default output directory:

```text
./claude-fetch-output/
```

## Usage

```bash
claude-fetch [options] -- <claude-command> [claude-args...]
```

`claude-command` defaults to `claude`, so these commands are equivalent:

```bash
claude-fetch
claude-fetch -- claude
claude-fetch start -- claude
```

Common examples:

```bash
claude-fetch --output ./captures
claude-fetch --output ./captures -- claude -p "hello"
claude-fetch --enable-debug-log -- claude -p "hello"
claude-fetch --json true --html true --index-html true -- claude
```

## CLI options

| Option | Default | Description |
| --- | --- | --- |
| `--output <dir>` | `./claude-fetch-output` | Capture output directory. |
| `--enable-debug-log` | `false` | Set `ANTHROPIC_LOG=debug` only when it is not already set. Used as fallback. |
| `--redact <value>` | `true` | Redact sensitive fields before writing artifacts. Supports `false`, `0`, `no`. |
| `--html <value>` | `true` | Generate per-request HTML detail pages. |
| `--index-html <value>` | `true` | Generate overview `index.html`. |
| `--json <value>` | `true` | Generate per-request JSON records. |
| `--mode <mode>` | `debug-log` | Capture mode. `proxy` is reserved and not implemented. |

## Output

```text
<output>/
  index.html
  manifest.json
  captures/
    <yyyy-mm-dd>/
      <capture-id>.json
      <capture-id>.html
  logs/
    claude-fetch.log
  otel-bodies/
    ...
```

Files:

- `index.html`: overview page with request list, filters, and iframe preview.
- `manifest.json`: capture summaries for all requests.
- `captures/<date>/*.json`: full structured records for each request.
- `captures/<date>/*.html`: per-request detail pages.
- `logs/claude-fetch.log`: JSONL runtime log.
- `otel-bodies/`: Claude Code official raw body files.

## How it works

`claude-fetch` does not proxy, forward, or rewrite traffic. It only starts `claude` as a child process and enables Claude Code official telemetry/raw body output.

### 1. Start Claude Code as a child process

`claude-fetch` uses `child_process.spawn` and inherits the current shell environment by default.

It does not set or override routing/authentication variables:

```text
ANTHROPIC_BASE_URL
ANTHROPIC_API_KEY
ANTHROPIC_AUTH_TOKEN
AWS_*
GOOGLE_*
```

Existing Claude Code routing remains unchanged:

- Official Anthropic API remains official API.
- Custom gateway remains custom gateway.
- Bedrock remains Bedrock.
- Vertex remains Vertex.

### 2. Enable OTEL raw body capture

Runtime sets only capture-related telemetry variables:

```text
CLAUDE_CODE_ENABLE_TELEMETRY=1
OTEL_LOGS_EXPORTER=console
OTEL_METRICS_EXPORTER=none
OTEL_LOG_RAW_API_BODIES=file:<output>/otel-bodies
OTEL_LOGS_EXPORT_INTERVAL=1000
```

Claude Code emits events such as:

```text
claude_code.api_request_body
claude_code.api_request
claude_code.api_response_body
```

`api_request_body` and `api_response_body` include `body_ref`, which points to raw JSON body files. `claude-fetch` reads these files to recover complete request and response bodies.

### 3. Pair events by `prompt.id`

One API call produces multiple telemetry events with the same `prompt.id`. `claude-fetch` merges them into one `CaptureRecord`.

Merged fields:

- request body from `api_request_body.body_ref`
- response body from `api_response_body.body_ref`
- model, token usage, and duration from `api_request`
- OTEL metadata stored under request/response `otel.*` headers

Complete records are marked:

```json
{
  "completeness": "complete",
  "truncated": false
}
```

Partial fallback records are marked:

```json
{
  "completeness": "partial",
  "truncated": true
}
```

### 4. Debug fallback

Enable debug fallback:

```bash
claude-fetch --enable-debug-log -- claude -p "hello"
```

If `ANTHROPIC_LOG` is not already set, the program sets:

```text
ANTHROPIC_LOG=debug
```

Debug logs may collapse nested objects into `[Object ...]`, so they are fallback only. Complete OTEL raw body records take priority.

## Security and redaction

Sensitive fields are recursively redacted before any artifact is written:

```text
x-api-key
authorization
proxy-authorization
cookie
set-cookie
```

HTML pages use local inline assets only. Captured content is HTML-escaped and injected through safe JSON script serialization to avoid local XSS.

Output files may still contain prompts, model responses, request metadata, and business data not covered by redaction rules. Treat capture directories as sensitive.

## Development

Install dependencies:

```bash
npm install
```

Run in development:

```bash
npm run dev -- -- claude -p "hello"
```

Build:

```bash
npm run build
```

Typecheck:

```bash
npm run typecheck
```

Test:

```bash
npm test
```

Full validation:

```bash
npm run typecheck
npm test
npm run build
```

## Project structure

```text
src/
  cli.ts                         CLI entry
  claude-runner.ts               child process runner and lifecycle management
  collectors/                    stdout/stderr line collection
  parsers/                       debug and OTEL parsers
  writers/                       JSON, HTML, manifest, and log writers
  utils/                         path, HTML, and redaction helpers
test/
  fixtures/                      mock Claude Code outputs
  e2e.test.ts                    end-to-end artifact tests
```

## Publishing

Package name uses scoped package format to avoid global npm name conflicts:

```json
{
  "name": "@matijun/claude-fetch",
  "bin": {
    "claude-fetch": "./dist/src/cli.js"
  }
}
```

Publish public scoped package:

```bash
npm publish --access public
```

Install published package:

```bash
npm install -g @matijun/claude-fetch
claude-fetch
```

## Cleanup

Delete output directories:

```bash
rm -rf ./claude-fetch-output
rm -rf ./tmp-real-captures
```
