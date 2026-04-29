import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveExecutable } from '../../src/claude-runner.js';

describe('resolveExecutable', () => {
  it('finds executable from PATH', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'claude-fetch-path-'));
    const executablePath = path.join(tempDir, 'mock-claude');
    try {
      await writeExecutable(executablePath);

      await expect(resolveExecutable('mock-claude', { PATH: tempDir })).resolves.toBe(executablePath);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('accepts executable path', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'claude-fetch-absolute-'));
    const executablePath = path.join(tempDir, 'mock-claude');
    try {
      await writeExecutable(executablePath);

      await expect(resolveExecutable(executablePath, { PATH: '' })).resolves.toBe(executablePath);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('fails with clear error when command is missing', async () => {
    await expect(resolveExecutable('missing-claude', { PATH: '' })).rejects.toThrow(
      '无法启动命令 "missing-claude"：PATH 中未找到可执行文件。若 missing-claude 是 shell alias/function，请改用真实可执行路径。',
    );
  });
});

async function writeExecutable(filePath: string): Promise<void> {
  await writeFile(filePath, '#!/bin/sh\nexit 0\n');
  await chmod(filePath, 0o700);
}
