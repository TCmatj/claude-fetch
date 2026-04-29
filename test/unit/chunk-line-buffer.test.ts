import { describe, expect, it } from 'vitest';
import { ChunkLineBuffer } from '../../src/collectors/chunk-line-buffer.js';

describe('ChunkLineBuffer', () => {
  it('joins chunks into complete lines', () => {
    const buffer = new ChunkLineBuffer();

    expect(buffer.push('hel')).toEqual([]);
    expect(buffer.push('lo\nwor')).toEqual(['hello']);
    expect(buffer.push('ld\n')).toEqual(['world']);
    expect(buffer.flush()).toEqual([]);
  });

  it('supports CRLF lines', () => {
    const buffer = new ChunkLineBuffer();

    expect(buffer.push('a\r\nb\r\n')).toEqual(['a', 'b']);
  });

  it('flushes remaining text without newline', () => {
    const buffer = new ChunkLineBuffer();

    expect(buffer.push('last line')).toEqual([]);
    expect(buffer.flush()).toEqual(['last line']);
  });

  it('strips ANSI control sequences before returning lines', () => {
    const buffer = new ChunkLineBuffer();

    expect(buffer.push('[32mbody[0m: [32m"claude_code.api_request"[0m\n')).toEqual([
      'body: "claude_code.api_request"',
    ]);
  });
});
