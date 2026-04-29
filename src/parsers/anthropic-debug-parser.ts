import { randomUUID } from 'node:crypto';
import type { CaptureRecord } from '../model/capture-record.js';
import { parseSse } from './sse-parser.js';

type PendingRequest = {
  method: string;
  url?: string;
  path: string;
  headers: Record<string, unknown>;
  body?: unknown;
  startedAt: string;
};

type DebugBlock = {
  id: string;
  kind: 'request' | 'responseStart' | 'responseParsed';
  lines: string[];
};

export class AnthropicDebugParser {
  private pending?: PendingRequest;
  private block?: DebugBlock;

  constructor(private readonly sessionId: string) {}

  parseLine(line: string): CaptureRecord[] {
    const blockResult = this.parseDebugBlockLine(line);
    if (blockResult) {
      return blockResult;
    }

    const parsed = this.parseJsonLine(line);
    if (!parsed) {
      return [];
    }

    return this.parseStructuredEvent(parsed, line);
  }

  flush(): CaptureRecord[] {
    const records = this.block ? this.finishDebugBlock() : [];
    if (!this.pending) {
      return records;
    }
    const request = this.pending;
    this.pending = undefined;
    records.push({
      id: `local_${Date.now()}_${randomUUID()}`,
      sessionId: this.sessionId,
      source: 'debug_log',
      completeness: 'partial',
      truncated: false,
      startedAt: request.startedAt,
      endedAt: new Date().toISOString(),
      request,
      usage: normalizeUsage(undefined),
      error: {
        message: 'Debug log ended before matching response was captured',
      },
    });
    return records;
  }

  private parseStructuredEvent(parsed: Record<string, unknown>, rawLine: string): CaptureRecord[] {
    if (parsed.type === 'anthropic_request' || parsed.type === 'request') {
      this.pending = {
        method: stringValue(parsed.method, 'POST'),
        url: optionalString(parsed.url),
        path: stringValue(parsed.path, extractPath(optionalString(parsed.url)) ?? '/v1/messages'),
        headers: objectValue(parsed.headers),
        body: parsed.body,
        startedAt: stringValue(parsed.startedAt, new Date().toISOString()),
      };
      return [];
    }

    if (parsed.type === 'anthropic_response' || parsed.type === 'response') {
      const now = new Date().toISOString();
      const request = this.pending ?? {
        method: 'POST',
        path: '/v1/messages',
        headers: {},
        startedAt: stringValue(parsed.startedAt, now),
      };
      this.pending = undefined;
      const sseRaw = typeof parsed.sseRaw === 'string' ? parsed.sseRaw : '';
      return [{
        id: `local_${Date.now()}_${randomUUID()}`,
        sessionId: this.sessionId,
        source: 'debug_log',
        completeness: parsed.completeness === 'complete' ? 'complete' : 'partial',
        truncated: Boolean(parsed.truncated),
        startedAt: request.startedAt,
        endedAt: stringValue(parsed.endedAt, now),
        durationMs: numberValue(parsed.durationMs),
        request,
        response: {
          status: numberValue(parsed.status),
          headers: objectValue(parsed.headers),
          body: parsed.body,
          sse: sseRaw ? { raw: sseRaw, events: parseSse(sseRaw) } : undefined,
        },
        usage: normalizeUsage(parsed.usage),
        error: null,
      }];
    }

    if (parsed.type === 'anthropic_error' || parsed.type === 'error') {
      const now = new Date().toISOString();
      const request = this.pending ?? {
        method: 'POST',
        path: '/v1/messages',
        headers: {},
        startedAt: now,
      };
      this.pending = undefined;
      return [{
        id: `local_${Date.now()}_${randomUUID()}`,
        sessionId: this.sessionId,
        source: 'debug_log',
        completeness: 'partial',
        truncated: false,
        startedAt: request.startedAt,
        endedAt: now,
        request,
        response: undefined,
        usage: normalizeUsage(undefined),
        error: {
          type: optionalString(parsed.errorType),
          message: stringValue(parsed.message, 'Unknown debug log error'),
          raw: rawLine,
        },
      }];
    }

    return [];
  }

  private parseDebugBlockLine(line: string): CaptureRecord[] | undefined {
    const start = line.match(/^\[(log_[^\]]+)] (sending request|response start|response parsed) \{$/);
    if (start) {
      const records = this.block ? this.finishDebugBlock() : [];
      this.block = {
        id: start[1],
        kind: start[2] === 'sending request' ? 'request' : start[2] === 'response start' ? 'responseStart' : 'responseParsed',
        lines: [],
      };
      return records;
    }

    const status = line.match(/^\[(log_[^\]]+)] post (\S+) succeeded with status (\d+) in (\d+)ms$/);
    if (status) {
      return [];
    }

    if (!this.block) {
      return undefined;
    }

    if (line === '}') {
      return this.finishDebugBlock();
    }

    this.block.lines.push(line);
    return [];
  }

  private finishDebugBlock(): CaptureRecord[] {
    if (!this.block) {
      return [];
    }

    const block = this.block;
    this.block = undefined;
    if (block.kind === 'request') {
      this.pending = parseRequestBlock(block.lines);
      return [];
    }

    if (block.kind === 'responseStart') {
      const response = parseResponseStartBlock(block.lines);
      const now = new Date().toISOString();
      const request = this.pending ?? {
        method: 'POST',
        path: extractPath(response.url) ?? '/v1/messages',
        headers: {},
        startedAt: now,
      };
      this.pending = undefined;
      return [{
        id: `local_${Date.now()}_${randomUUID()}`,
        sessionId: this.sessionId,
        source: 'debug_log',
        completeness: 'partial',
        truncated: true,
        startedAt: request.startedAt,
        endedAt: now,
        durationMs: response.durationMs,
        request,
        response: {
          status: response.status,
          headers: response.headers,
          body: {
            note: 'Claude Code debug log exposes response stream metadata here, not complete SSE body.',
          },
        },
        usage: normalizeUsage(undefined),
        error: null,
      }];
    }

    return [];
  }

  private parseJsonLine(line: string): Record<string, unknown> | undefined {
    const trimmed = line.trim();
    const jsonStart = trimmed.indexOf('{');
    if (jsonStart < 0) {
      return undefined;
    }

    try {
      const value = JSON.parse(trimmed.slice(jsonStart));
      return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
    } catch {
      return undefined;
    }
  }
}

function parseRequestBlock(lines: string[]): PendingRequest {
  const url = extractStringField(lines, 'url');
  const method = extractStringField(lines, 'method') ?? 'POST';
  const path = extractNestedStringField(lines, 'options', 'path') ?? extractPath(url) ?? '/v1/messages';
  return {
    method: method.toUpperCase(),
    url,
    path,
    headers: extractObjectBlock(lines, 'headers'),
    body: extractBodySummary(lines),
    startedAt: new Date().toISOString(),
  };
}

function parseResponseStartBlock(lines: string[]): { url?: string; status?: number; headers: Record<string, unknown>; durationMs?: number } {
  return {
    url: extractStringField(lines, 'url'),
    status: extractNumberField(lines, 'status'),
    headers: extractObjectBlock(lines, 'headers'),
    durationMs: extractNumberField(lines, 'durationMs'),
  };
}

function extractBodySummary(lines: string[]): Record<string, unknown> {
  const bodyStart = lines.findIndex((line) => line.trim() === 'body: {');
  if (bodyStart < 0) {
    return { note: 'Request body was not present in debug log.' };
  }

  const bodyLines = collectObjectLines(lines, bodyStart);
  const body: Record<string, unknown> = {
    rawPreview: bodyLines.join('\n'),
    note: 'Claude Code debug log abbreviates nested request body values as [Object ...].',
  };
  for (const key of ['model', 'max_tokens', 'stream']) {
    const line = bodyLines.find((item) => item.trim().startsWith(`${key}:`));
    if (line) {
      body[camelize(key)] = parseScalar(line.split(':').slice(1).join(':').replace(/,$/, '').trim());
    }
  }
  return body;
}

function extractObjectBlock(lines: string[], key: string): Record<string, unknown> {
  const start = lines.findIndex((line) => line.trim() === `${key}: {`);
  if (start < 0) {
    return {};
  }

  const result: Record<string, unknown> = {};
  const objectLines = collectObjectLines(lines, start).slice(1, -1);
  for (const line of objectLines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^"?([^":]+)"?:\s*(.*),?$/);
    if (!match) {
      continue;
    }
    const value = match[2].replace(/,$/, '').trim();
    if (value === '{' || value === '[' || value.includes('[Object')) {
      continue;
    }
    result[match[1]] = parseScalar(value);
  }
  return result;
}

function collectObjectLines(lines: string[], start: number): string[] {
  const collected: string[] = [];
  let depth = 0;
  for (const line of lines.slice(start)) {
    collected.push(line.trimEnd());
    depth += countChar(line, '{') + countChar(line, '[');
    depth -= countChar(line, '}') + countChar(line, ']');
    if (depth <= 0) {
      break;
    }
  }
  return collected;
}

function extractStringField(lines: string[], key: string): string | undefined {
  const line = lines.find((item) => item.trim().startsWith(`${key}:`));
  if (!line) {
    return undefined;
  }
  const value = line.split(':').slice(1).join(':').replace(/,$/, '').trim();
  return stripQuotes(value);
}

function extractNestedStringField(lines: string[], parent: string, key: string): string | undefined {
  const start = lines.findIndex((line) => line.trim() === `${parent}: {`);
  if (start < 0) {
    return undefined;
  }
  return extractStringField(collectObjectLines(lines, start), key);
}

function extractNumberField(lines: string[], key: string): number | undefined {
  const value = extractStringField(lines, key);
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseScalar(value: string): unknown {
  const clean = value.replace(/,$/, '').trim();
  if (clean === 'true') {
    return true;
  }
  if (clean === 'false') {
    return false;
  }
  if (/^-?\d+(\.\d+)?$/.test(clean)) {
    return Number(clean);
  }
  return stripQuotes(clean);
}

function stripQuotes(value: string): string {
  const clean = value.trim();
  if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
    return clean.slice(1, -1);
  }
  return clean;
}

function countChar(value: string, char: string): number {
  return [...value].filter((item) => item === char).length;
}

function camelize(value: string): string {
  return value.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}

function normalizeUsage(value: unknown): CaptureRecord['usage'] {
  const usage = objectValue(value);
  return {
    inputTokens: numberValue(usage.inputTokens) ?? numberValue(usage.input_tokens) ?? 0,
    outputTokens: numberValue(usage.outputTokens) ?? numberValue(usage.output_tokens) ?? 0,
    cacheCreationInputTokens: numberValue(usage.cacheCreationInputTokens) ?? numberValue(usage.cache_creation_input_tokens) ?? 0,
    cacheReadInputTokens: numberValue(usage.cacheReadInputTokens) ?? numberValue(usage.cache_read_input_tokens) ?? 0,
  };
}

function extractPath(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    return new URL(url).pathname + new URL(url).search;
  } catch {
    return url.startsWith('/') ? url : undefined;
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
