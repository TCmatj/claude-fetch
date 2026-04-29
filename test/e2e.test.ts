import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runClaude } from '../src/claude-runner.js';

describe('claude-fetch e2e', () => {
  it('generates redacted artifacts from debug logs', async () => {
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'claude-fetch-'));
    try {
      const code = await runClaude({
        outputRoot,
        command: process.execPath,
        args: [path.resolve('test/fixtures/mock-claude-debug.js')],
        enableDebugLog: true,
        redact: true,
        html: true,
        indexHtml: true,
        json: true,
        sessionId: 'test-session',
      });

      expect(code).toBe(0);
      const manifest = JSON.parse(await readFile(path.join(outputRoot, 'manifest.json'), 'utf8'));
      expect(manifest.items).toHaveLength(1);
      expect(manifest.items[0].path).toBe('/v1/messages');
      expect(manifest.items[0].requestId).toBe('req_mock_123');

      const captureDir = path.join(outputRoot, 'captures', '2026-04-28');
      const files = await readdir(captureDir);
      const jsonFile = files.find((file) => file.endsWith('.json'));
      const htmlFile = files.find((file) => file.endsWith('.html'));
      expect(jsonFile).toBeTruthy();
      expect(htmlFile).toBeTruthy();

      const json = await readFile(path.join(captureDir, jsonFile!), 'utf8');
      expect(json).toContain('[REDACTED]');
      expect(json).not.toContain('sk-ant-secret');
      expect(json).not.toContain('secret-token');

      const html = await readFile(path.join(captureDir, htmlFile!), 'utf8');
      expect(html).toContain('data-json-root="request.body"');
      expect(html).toContain('copyPath');
      expect(html).not.toContain('<script>alert(1)</script>');

      const index = await readFile(path.join(outputRoot, 'index.html'), 'utf8');
      expect(index).toContain('iframe');
      expect(index).toContain('req_mock_123');

      const log = await readFile(path.join(outputRoot, 'logs', 'claude-fetch.log'), 'utf8');
      expect(log).toContain('req_mock_123');
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });

  it('generates partial artifacts from real Claude Code debug blocks', async () => {
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'claude-fetch-real-'));
    try {
      const code = await runClaude({
        outputRoot,
        command: process.execPath,
        args: [path.resolve('test/fixtures/mock-claude-real-debug.js')],
        enableDebugLog: true,
        redact: true,
        html: true,
        indexHtml: true,
        json: true,
        sessionId: 'test-real-session',
      });

      expect(code).toBe(0);
      const manifest = JSON.parse(await readFile(path.join(outputRoot, 'manifest.json'), 'utf8'));
      expect(manifest.items).toHaveLength(1);
      expect(manifest.items[0].path).toBe('/v1/messages?beta=true');
      expect(manifest.items[0].requestId).toBe('202604280356141242618298268d9d64t5Vrks4');

      const captureDirs = await readdir(path.join(outputRoot, 'captures'));
      const captureDir = path.join(outputRoot, 'captures', captureDirs[0]);
      const files = await readdir(captureDir);
      const jsonFile = files.find((file) => file.endsWith('.json'));
      expect(jsonFile).toBeTruthy();

      const json = JSON.parse(await readFile(path.join(captureDir, jsonFile!), 'utf8'));
      expect(json.completeness).toBe('partial');
      expect(json.truncated).toBe(true);
      expect(json.request.url).toBe('https://newapi.matc2025.click/v1/messages?beta=true');
      expect(json.request.headers.authorization).toBe('[REDACTED]');
      expect(json.response.status).toBe(200);
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });

  it('generates complete artifacts from official OTEL raw body events', async () => {
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'claude-fetch-otel-'));
    const bodyDir = path.join(outputRoot, 'mock-bodies');
    const oldBodyDir = process.env.MOCK_OTEL_BODY_DIR;
    process.env.MOCK_OTEL_BODY_DIR = bodyDir;
    try {
      const code = await runClaude({
        outputRoot,
        command: process.execPath,
        args: [path.resolve('test/fixtures/mock-claude-otel-raw.js')],
        enableDebugLog: false,
        redact: true,
        html: true,
        indexHtml: true,
        json: true,
        sessionId: 'test-otel-session',
      });

      expect(code).toBe(0);
      const manifest = JSON.parse(await readFile(path.join(outputRoot, 'manifest.json'), 'utf8'));
      expect(manifest.items).toHaveLength(1);
      expect(manifest.items[0].model).toBe('claude-opus-4-7');
      expect(manifest.items[0].durationMs).toBe(3918);

      const captureDirs = await readdir(path.join(outputRoot, 'captures'));
      const captureDir = path.join(outputRoot, 'captures', captureDirs[0]);
      const files = await readdir(captureDir);
      const jsonFile = files.find((file) => file.endsWith('.json'));
      const json = JSON.parse(await readFile(path.join(captureDir, jsonFile!), 'utf8'));
      expect(json.completeness).toBe('complete');
      expect(json.truncated).toBe(false);
      expect(json.request.headers['otel.event.name']).toBe('api_request_body');
      expect(json.response.headers['otel.event.name']).toBe('api_response_body');
      expect(json.request.body.messages[0].content).toContain('hello');
      expect(json.request.body.headers.authorization).toBe('[REDACTED]');
      expect(json.response.body.content[0].text).toBe('world');
      expect(json.usage.inputTokens).toBe(10);
      expect(json.usage.outputTokens).toBe(5);

      const htmlFile = files.find((file) => file.endsWith('.html'));
      const html = await readFile(path.join(captureDir, htmlFile!), 'utf8');
      expect(html).toContain('replace(/\\[(\\d+)\\]/g');
      expect(html).toContain('User Prompts');
      expect(html).toContain('System Prompt');
      expect(html).toContain('Tools');
      expect(html).toContain('Model / Thinking / Output');
    } finally {
      if (oldBodyDir === undefined) {
        delete process.env.MOCK_OTEL_BODY_DIR;
      } else {
        process.env.MOCK_OTEL_BODY_DIR = oldBodyDir;
      }
      await rm(outputRoot, { recursive: true, force: true });
    }
  });

  it('generates complete artifacts from raw body files when console events are missing', async () => {
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'claude-fetch-otel-files-'));
    const bodyDir = path.join(outputRoot, 'otel-bodies');
    const oldBodyDir = process.env.MOCK_OTEL_BODY_DIR;
    process.env.MOCK_OTEL_BODY_DIR = bodyDir;
    try {
      const code = await runClaude({
        outputRoot,
        command: process.execPath,
        args: [path.resolve('test/fixtures/mock-claude-otel-files-only.js')],
        enableDebugLog: false,
        redact: true,
        html: true,
        indexHtml: true,
        json: true,
        sessionId: 'test-otel-files-session',
      });

      expect(code).toBe(0);
      const manifest = JSON.parse(await readFile(path.join(outputRoot, 'manifest.json'), 'utf8'));
      expect(manifest.items).toHaveLength(1);
      expect(manifest.items[0].model).toBe('claude-opus-4-7');

      const captureDirs = await readdir(path.join(outputRoot, 'captures'));
      const captureDir = path.join(outputRoot, 'captures', captureDirs[0]);
      const files = await readdir(captureDir);
      const jsonFile = files.find((file) => file.endsWith('.json'));
      const json = JSON.parse(await readFile(path.join(captureDir, jsonFile!), 'utf8'));
      expect(json.completeness).toBe('complete');
      expect(json.request.body.messages[0].content).toBe('hello from raw file fallback');
      expect(json.response.body.content[0].text).toBe('fallback world');
      expect(json.usage.inputTokens).toBe(7);
      expect(json.usage.outputTokens).toBe(3);
    } finally {
      if (oldBodyDir === undefined) {
        delete process.env.MOCK_OTEL_BODY_DIR;
      } else {
        process.env.MOCK_OTEL_BODY_DIR = oldBodyDir;
      }
      await rm(outputRoot, { recursive: true, force: true });
    }
  });
});
