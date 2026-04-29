import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const bodyDir = process.env.MOCK_OTEL_BODY_DIR;
if (!bodyDir) {
  throw new Error('MOCK_OTEL_BODY_DIR is required');
}
await mkdir(bodyDir, { recursive: true });
const requestPath = path.join(bodyDir, 'request.json');
const responsePath = path.join(bodyDir, 'response.json');
await writeFile(requestPath, JSON.stringify({
  model: 'claude-opus-4-7',
  max_tokens: 128,
  messages: [{ role: 'user', content: 'hello <script>alert(1)</script>' }],
  headers: { authorization: 'Bearer nested-secret' }
}), 'utf8');
await writeFile(responsePath, JSON.stringify({
  type: 'message',
  model: 'claude-opus-4-7',
  usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  content: [{ type: 'text', text: 'world' }]
}), 'utf8');

const blocks = [
`{
  resource: {
    attributes: {
      "service.name": "claude-code",
    },
  },
  timestamp: 1777354411185000,
  body: "claude_code.api_request_body",
  attributes: {
    "session.id": "otel-session",
    "event.name": "api_request_body",
    "event.timestamp": "2026-04-28T05:33:31.185Z",
    "event.sequence": 6,
    "prompt.id": "prompt-1",
    body_ref: "${requestPath}",
    body_length: "512",
    model: "claude-opus-4-7",
  },
}`,
`{
  resource: {
    attributes: {
      "service.name": "claude-code",
    },
  },
  timestamp: 1777354415104000,
  body: "claude_code.api_request",
  attributes: {
    "session.id": "otel-session",
    "event.name": "api_request",
    "event.timestamp": "2026-04-28T05:33:35.104Z",
    "event.sequence": 9,
    "prompt.id": "prompt-1",
    model: "claude-opus-4-7",
    input_tokens: "10",
    output_tokens: "5",
    duration_ms: "3918",
  },
}`,
`{
  resource: {
    attributes: {
      "service.name": "claude-code",
    },
  },
  timestamp: 1777354415104000,
  body: "claude_code.api_response_body",
  attributes: {
    "session.id": "otel-session",
    "event.name": "api_response_body",
    "event.timestamp": "2026-04-28T05:33:35.104Z",
    "event.sequence": 10,
    "prompt.id": "prompt-1",
    body_ref: "${responsePath}",
    body_length: "128",
    model: "claude-opus-4-7",
  },
}`
];

for (const block of blocks) {
  console.error(block);
}
