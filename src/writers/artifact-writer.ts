import type { CaptureRecord, ManifestItem } from '../model/capture-record.js';
import { redactValue } from '../utils/redact.js';
import { toPosixRelative } from '../utils/paths.js';
import { writeCaptureJson } from './json-writer.js';
import { writeRequestHtml } from './request-html-writer.js';
import { ManifestWriter } from './manifest-writer.js';
import { writeIndexHtml } from './index-html-writer.js';
import { LogWriter } from './log-writer.js';

export type ArtifactOptions = {
  json: boolean;
  html: boolean;
  indexHtml: boolean;
  redact: boolean;
};

export class ArtifactWriter {
  private readonly manifestWriter: ManifestWriter;
  private readonly logWriter: LogWriter;

  constructor(
    private readonly outputRoot: string,
    sessionId: string,
    private readonly options: ArtifactOptions,
  ) {
    this.manifestWriter = new ManifestWriter(outputRoot, sessionId);
    this.logWriter = new LogWriter(outputRoot);
  }

  async write(record: CaptureRecord): Promise<void> {
    const safeRecord = this.options.redact ? redactValue(record) as CaptureRecord : record;
    let jsonPath: string | undefined;
    let htmlPath: string | undefined;

    if (this.options.json) {
      jsonPath = toPosixRelative(this.outputRoot, await writeCaptureJson(this.outputRoot, safeRecord));
    }
    if (this.options.html) {
      htmlPath = toPosixRelative(this.outputRoot, await writeRequestHtml(this.outputRoot, safeRecord));
    }

    const item = toManifestItem(safeRecord, jsonPath, htmlPath);
    const manifest = await this.manifestWriter.append(item);
    if (this.options.indexHtml) {
      await writeIndexHtml(this.outputRoot, manifest);
    }
    await this.logWriter.append(safeRecord, item);
  }
}

function toManifestItem(record: CaptureRecord, jsonPath?: string, htmlPath?: string): ManifestItem {
  return {
    id: record.id,
    time: record.endedAt ?? record.startedAt,
    method: record.request.method,
    path: extractRequestPath(record),
    model: extractModel(record.request.body),
    status: record.response?.status,
    durationMs: record.durationMs,
    requestId: getHeader(record.response?.headers, 'request-id') ?? getHeader(record.response?.headers, 'x-request-id') ?? getHeader(record.response?.headers, 'x-oneapi-request-id'),
    jsonPath,
    htmlPath,
  };
}

function extractRequestPath(record: CaptureRecord): string {
  if (record.request.path !== '/v1/messages' || !record.request.body || typeof record.request.body !== 'object' || Array.isArray(record.request.body)) {
    return record.request.path;
  }
  return '/v1/messages';
}

function extractModel(body: unknown): string | undefined {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return undefined;
  }
  const model = (body as { model?: unknown }).model;
  return typeof model === 'string' ? model : undefined;
}

function getHeader(headers: Record<string, unknown> | undefined, name: string): string | undefined {
  if (!headers) {
    return undefined;
  }
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return typeof entry?.[1] === 'string' ? entry[1] : undefined;
}
