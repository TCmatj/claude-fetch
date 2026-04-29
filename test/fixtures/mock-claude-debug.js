const request = {
  type: 'anthropic_request',
  method: 'POST',
  url: 'https://example.test/v1/messages',
  path: '/v1/messages',
  headers: {
    'anthropic-version': '2023-06-01',
    'x-api-key': 'sk-ant-secret',
    authorization: 'Bearer secret-token'
  },
  body: {
    model: 'claude-opus-4-7',
    max_tokens: 128,
    messages: [{ role: 'user', content: 'hello <script>alert(1)</script>' }]
  },
  startedAt: '2026-04-28T10:00:00.000Z'
};

const response = {
  type: 'anthropic_response',
  status: 200,
  headers: {
    'request-id': 'req_mock_123',
    'set-cookie': 'session=secret'
  },
  body: {
    id: 'msg_mock',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: 'world' }],
    usage: { input_tokens: 10, output_tokens: 5 }
  },
  usage: {
    input_tokens: 10,
    output_tokens: 5,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0
  },
  durationMs: 1234,
  endedAt: '2026-04-28T10:00:01.234Z',
  completeness: 'complete'
};

console.error(JSON.stringify(request));
console.error(JSON.stringify(response));
