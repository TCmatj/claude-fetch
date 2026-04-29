import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { CaptureRecord } from '../model/capture-record.js';
import type { OTelEvent } from './otel-console-parser.js';

type PendingRawBody = {
  requestEvent?: OTelEvent;
  responseEvent?: OTelEvent;
  apiEvent?: OTelEvent;
};

export class OTelRawBodyCollector {
  private readonly pending = new Map<string, PendingRawBody>();

  constructor(private readonly sessionId: string) {}

  async accept(event: OTelEvent): Promise<CaptureRecord[]> {
    if (!['claude_code.api_request_body', 'claude_code.api_response_body', 'claude_code.api_request'].includes(event.body)) {
      return [];
    }

    const promptId = event.attributes['prompt.id'] ?? randomUUID();
    const pending = this.pending.get(promptId) ?? {};
    if (event.body === 'claude_code.api_request_body') {
      pending.requestEvent = event;
    } else if (event.body === 'claude_code.api_response_body') {
      pending.responseEvent = event;
    } else {
      pending.apiEvent = event;
    }
    this.pending.set(promptId, pending);

    if (!pending.requestEvent || !pending.responseEvent) {
      return [];
    }

    this.pending.delete(promptId);
    return [await this.toRecord(promptId, pending.requestEvent, pending.responseEvent, pending.apiEvent)];
  }

  async flush(): Promise<CaptureRecord[]> {
    const records: CaptureRecord[] = [];
    for (const [promptId, pending] of this.pending.entries()) {
      if (pending.requestEvent && pending.responseEvent) {
        records.push(await this.toRecord(promptId, pending.requestEvent, pending.responseEvent, pending.apiEvent));
      }
    }
    this.pending.clear();
    return records;
  }

  private async toRecord(promptId: string, requestEvent: OTelEvent, responseEvent: OTelEvent, apiEvent?: OTelEvent): Promise<CaptureRecord> {
    const requestBody = await readJsonRef(requestEvent.attributes.body_ref);
    const responseBody = await readJsonRef(responseEvent.attributes.body_ref);
    const startedAt = eventTime(requestEvent);
    const endedAt = eventTime(responseEvent);
    const usage = normalizeUsage(responseBody, apiEvent);
    return {
      id: `local_${Date.now()}_${randomUUID()}`,
      sessionId: requestEvent.attributes['session.id'] ?? this.sessionId,
      source: 'debug_log',
      completeness: 'complete',
      truncated: false,
      startedAt,
      endedAt,
      durationMs: numberAttribute(apiEvent, 'duration_ms'),
      request: {
        method: 'POST',
        path: '/v1/messages',
        headers: otelHeaders(requestEvent),
        body: requestBody,
      },
      response: {
        status: 200,
        headers: otelHeaders(responseEvent),
        body: responseBody,
      },
      usage,
      error: null,
    };
  }
}

async function readJsonRef(filePath: string | undefined): Promise<unknown> {
  if (!filePath) {
    return undefined;
  }
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function otelHeaders(event: OTelEvent): Record<string, unknown> {
  return {
    'otel.event.name': event.attributes['event.name'],
    'otel.event.timestamp': event.attributes['event.timestamp'],
    'otel.prompt.id': event.attributes['prompt.id'],
    'otel.body.ref': event.attributes.body_ref,
    'otel.body.length': event.attributes.body_length,
    'otel.model': event.attributes.model,
  };
}

function eventTime(event: OTelEvent): string {
  if (event.attributes['event.timestamp']) {
    return event.attributes['event.timestamp'];
  }
  if (event.timestamp) {
    return new Date(Math.floor(event.timestamp / 1000)).toISOString();
  }
  return new Date().toISOString();
}

function normalizeUsage(responseBody: unknown, apiEvent?: OTelEvent): CaptureRecord['usage'] {
  const responseUsage = objectValue(objectValue(responseBody).usage);
  return {
    inputTokens: numberValue(responseUsage.input_tokens) ?? numberAttribute(apiEvent, 'input_tokens') ?? 0,
    outputTokens: numberValue(responseUsage.output_tokens) ?? numberAttribute(apiEvent, 'output_tokens') ?? 0,
    cacheCreationInputTokens: numberValue(responseUsage.cache_creation_input_tokens) ?? numberAttribute(apiEvent, 'cache_creation_tokens') ?? 0,
    cacheReadInputTokens: numberValue(responseUsage.cache_read_input_tokens) ?? numberAttribute(apiEvent, 'cache_read_tokens') ?? 0,
  };
}

function numberAttribute(event: OTelEvent | undefined, key: string): number | undefined {
  if (!event) {
    return undefined;
  }
  const value = Number(event.attributes[key]);
  return Number.isFinite(value) ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
