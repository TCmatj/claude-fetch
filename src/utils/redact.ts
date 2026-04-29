const SENSITIVE_KEYS = new Set([
  'x-api-key',
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
]);

const REDACTED = '[REDACTED]';

export function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      result[key] = REDACTED;
      continue;
    }
    result[key] = redactValue(nestedValue);
  }
  return result;
}

export function redactHeaders(headers: Record<string, unknown> | undefined): Record<string, unknown> {
  return redactValue(headers ?? {}) as Record<string, unknown>;
}
