import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const bodyDir = process.env.MOCK_OTEL_BODY_DIR;
if (!bodyDir) {
  throw new Error('MOCK_OTEL_BODY_DIR is required');
}
await mkdir(bodyDir, { recursive: true });
await writeFile(path.join(bodyDir, 'a.request.json'), JSON.stringify({
  model: 'claude-opus-4-7',
  max_tokens: 128,
  messages: [{ role: 'user', content: 'hello from raw file fallback' }]
}), 'utf8');
await writeFile(path.join(bodyDir, 'b.response.json'), JSON.stringify({
  type: 'message',
  model: 'claude-opus-4-7',
  usage: { input_tokens: 7, output_tokens: 3, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  content: [{ type: 'text', text: 'fallback world' }]
}), 'utf8');
