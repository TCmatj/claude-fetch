import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { CaptureRecord } from '../model/capture-record.js';

type RawBodyFile = {
  path: string;
  mtimeMs: number;
  kind: 'request' | 'response';
};

export async function collectRawBodyFileRecords(outputRoot: string, sessionId: string, sinceMs: number): Promise<CaptureRecord[]> {
  const bodyDir = path.join(outputRoot, 'otel-bodies');
  let names: string[];
  try {
    names = await readdir(bodyDir);
  } catch {
    return [];
  }

  const files = (await Promise.all(names.map((name) => toRawBodyFile(bodyDir, name, sinceMs)))).filter((file): file is RawBodyFile => Boolean(file));
  const requests = files.filter((file) => file.kind === 'request').sort((a, b) => a.mtimeMs - b.mtimeMs);
  const responses = files.filter((file) => file.kind === 'response').sort((a, b) => a.mtimeMs - b.mtimeMs);
  const count = Math.min(requests.length, responses.length);
  const records: CaptureRecord[] = [];

  for (let index = 0; index < count; index += 1) {
    records.push(await toRecord(sessionId, requests[index], responses[index]));
  }

  return records;
}

async function toRawBodyFile(bodyDir: string, name: string, sinceMs: number): Promise<RawBodyFile | undefined> {
  const kind = rawBodyKind(name);
  if (!kind) {
    return undefined;
  }
  const filePath = path.join(bodyDir, name);
  const fileStat = await stat(filePath).catch(() => undefined);
  if (!fileStat?.isFile() || fileStat.mtimeMs < sinceMs) {
    return undefined;
  }
  return { path: filePath, mtimeMs: fileStat.mtimeMs, kind };
}

function rawBodyKind(name: string): RawBodyFile['kind'] | undefined {
  if (name.endsWith('.request.json')) {
    return 'request';
  }
  if (name.endsWith('.response.json')) {
    return 'response';
  }
  return undefined;
}

async function toRecord(sessionId: string, requestFile: RawBodyFile, responseFile: RawBodyFile): Promise<CaptureRecord> {
  const requestBody = JSON.parse(await readFile(requestFile.path, 'utf8'));
  const responseBody = JSON.parse(await readFile(responseFile.path, 'utf8'));
  const startedAt = new Date(requestFile.mtimeMs).toISOString();
  const endedAt = new Date(responseFile.mtimeMs).toISOString();
  return {
    id: `local_${Date.now()}_${randomUUID()}`,
    sessionId,
    source: 'debug_log',
    completeness: 'complete',
    truncated: false,
    startedAt,
    endedAt,
    durationMs: Math.max(0, Math.round(responseFile.mtimeMs - requestFile.mtimeMs)),
    request: {
      method: 'POST',
      path: '/v1/messages',
      headers: {
        'otel.body.ref': requestFile.path,
      },
      body: requestBody,
    },
    response: {
      status: 200,
      headers: {
        'otel.body.ref': responseFile.path,
      },
      body: responseBody,
    },
    usage: normalizeUsage(responseBody),
    error: null,
  };
}

function normalizeUsage(responseBody: unknown): CaptureRecord['usage'] {
  const usage = objectValue(objectValue(responseBody).usage);
  return {
    inputTokens: numberValue(usage.input_tokens) ?? 0,
    outputTokens: numberValue(usage.output_tokens) ?? 0,
    cacheCreationInputTokens: numberValue(usage.cache_creation_input_tokens) ?? 0,
    cacheReadInputTokens: numberValue(usage.cache_read_input_tokens) ?? 0,
  };
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
