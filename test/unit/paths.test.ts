import { describe, expect, it } from 'vitest';
import { captureDatePath, captureFilePrefix } from '../../src/utils/paths.js';

describe('capture paths', () => {
  it('uses local timezone for date path and file prefix', () => {
    const date = new Date(2026, 3, 28, 10, 5, 6, 7);

    expect(captureDatePath(date)).toBe('2026-04-28');
    expect(captureFilePrefix(date)).toBe('2026-04-28T10-05-06-007');
  });
});
