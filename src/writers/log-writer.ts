import { mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';
import type { CaptureRecord, ManifestItem } from '../model/capture-record.js';

export class LogWriter {
  private queue = Promise.resolve();

  constructor(private readonly outputRoot: string) {}

  append(record: CaptureRecord, item: ManifestItem): Promise<void> {
    this.queue = this.queue.then(async () => {
      const logDir = path.join(this.outputRoot, 'logs');
      await mkdir(logDir, { recursive: true, mode: 0o700 });
      const line = {
        time: record.endedAt ?? record.startedAt,
        level: record.error ? 'error' : 'info',
        sessionId: record.sessionId,
        id: record.id,
        source: record.source,
        completeness: record.completeness,
        truncated: record.truncated,
        method: record.request.method,
        path: record.request.path,
        model: item.model,
        status: record.response?.status,
        durationMs: record.durationMs,
        requestId: item.requestId,
        inputTokens: record.usage.inputTokens,
        outputTokens: record.usage.outputTokens,
        jsonPath: item.jsonPath,
        htmlPath: item.htmlPath,
        indexPath: 'index.html',
      };
      await appendFile(path.join(logDir, 'claude-fetch.log'), `${JSON.stringify(line)}\n`, 'utf8');
    });
    return this.queue;
  }
}
