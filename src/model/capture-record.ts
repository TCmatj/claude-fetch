import { z } from 'zod';

export const HeaderMapSchema = z.record(z.string(), z.unknown()).default({});

export const SseEventSchema = z.object({
  event: z.string().optional(),
  data: z.unknown().optional(),
  raw: z.string(),
});

export const CaptureRecordSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  source: z.enum(['debug_log', 'stderr', 'stdout', 'transcript', 'proxy']),
  completeness: z.enum(['complete', 'partial', 'unknown']).default('partial'),
  truncated: z.boolean().default(false),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  durationMs: z.number().optional(),
  request: z.object({
    method: z.string().default('POST'),
    url: z.string().optional(),
    path: z.string().default('/v1/messages'),
    headers: HeaderMapSchema,
    body: z.unknown().optional(),
  }),
  response: z.object({
    status: z.number().optional(),
    headers: HeaderMapSchema,
    body: z.unknown().optional(),
    sse: z.object({
      raw: z.string().default(''),
      events: z.array(SseEventSchema).default([]),
    }).optional(),
  }).optional(),
  usage: z.object({
    inputTokens: z.number().default(0),
    outputTokens: z.number().default(0),
    cacheCreationInputTokens: z.number().default(0),
    cacheReadInputTokens: z.number().default(0),
  }).default({}),
  error: z.object({
    type: z.string().optional(),
    message: z.string(),
    raw: z.string().optional(),
  }).nullable().default(null),
});

export type SseEvent = z.infer<typeof SseEventSchema>;
export type CaptureRecord = z.infer<typeof CaptureRecordSchema>;

export type CaptureArtifact = {
  jsonPath?: string;
  htmlPath?: string;
};

export type ManifestItem = {
  id: string;
  time: string;
  method: string;
  path: string;
  model?: string;
  status?: number;
  durationMs?: number;
  requestId?: string;
  jsonPath?: string;
  htmlPath?: string;
};

export type Manifest = {
  sessionId: string;
  generatedAt: string;
  items: ManifestItem[];
};
