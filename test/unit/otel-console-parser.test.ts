import { describe, expect, it } from 'vitest';
import { OTelConsoleParser } from '../../src/parsers/otel-console-parser.js';

describe('OTelConsoleParser', () => {
  it('parses the last attributes object from CRLF PTY output', () => {
    const parser = new OTelConsoleParser();
    const input = '{\r\n  resource: {\r\n    attributes: {\r\n      "service.name": "claude-code",\r\n    },\r\n  },\r\n  timestamp: 1777377551274000,\r\n  body: "claude_code.api_request_body",\r\n  attributes: {\r\n    "event.name": "api_request_body",\r\n    "prompt.id": "prompt-1",\r\n    body_ref: "/tmp/request.json",\r\n    body_length: "123",\r\n    model: "gpt-5.5(medium)",\r\n  },\r\n}\r\n';

    const events = input.split('\n').flatMap((line) => parser.parseLine(line));

    expect(events).toHaveLength(1);
    expect(events[0].attributes['prompt.id']).toBe('prompt-1');
    expect(events[0].attributes.body_ref).toBe('/tmp/request.json');
    expect(events[0].attributes.model).toBe('gpt-5.5(medium)');
  });
});
