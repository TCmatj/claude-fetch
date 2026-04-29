import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { ChunkLineBuffer } from './collectors/chunk-line-buffer.js';
import type { CaptureRecord } from './model/capture-record.js';
import { AnthropicDebugParser } from './parsers/anthropic-debug-parser.js';
import { OTelConsoleParser } from './parsers/otel-console-parser.js';
import { OTelRawBodyCollector } from './parsers/otel-raw-body-collector.js';
import { collectRawBodyFileRecords } from './parsers/otel-raw-body-file-collector.js';
import { ArtifactWriter, type ArtifactOptions } from './writers/artifact-writer.js';

export type RunOptions = ArtifactOptions & {
  outputRoot: string;
  command: string;
  args: string[];
  enableDebugLog: boolean;
  sessionId?: string;
};

type RunContext = {
  handleChunk(chunk: string | Buffer): void;
  finish(): Promise<void>;
};

export async function runClaude(options: RunOptions): Promise<number> {
  await mkdir(options.outputRoot, { recursive: true, mode: 0o700 });
  const sessionId = options.sessionId ?? randomUUID();
  const env = buildEnv(options.enableDebugLog, sessionId, options.outputRoot);
  const command = await resolveExecutable(options.command, env);
  const runStartedAtMs = Date.now();
  const context = createRunContext(options, sessionId, runStartedAtMs);

  if (process.stdin.isTTY && process.stdout.isTTY) {
    return runPtyMode(command, options, env, context);
  }
  return runPipeMode(command, options, env, context);
}

function createRunContext(options: RunOptions, sessionId: string, runStartedAtMs: number): RunContext {
  const parser = new AnthropicDebugParser(sessionId);
  const otelParser = new OTelConsoleParser();
  const otelCollector = new OTelRawBodyCollector(sessionId);
  const writer = new ArtifactWriter(options.outputRoot, sessionId, options);
  const lineBuffer = new ChunkLineBuffer();
  const writeTasks: Promise<void>[] = [];
  const debugRecords: CaptureRecord[] = [];
  let wroteOtelRecord = false;

  const handleLine = (line: string) => {
    for (const record of parser.parseLine(line)) {
      if (hasRawBodyTelemetry()) {
        debugRecords.push(record);
      } else {
        writeTasks.push(writeRecord(writer, record));
      }
    }
    for (const event of otelParser.parseLine(line)) {
      writeTasks.push(otelCollector.accept(event).then((records) => Promise.all(records.map((record) => {
        wroteOtelRecord = true;
        return writeRecord(writer, record);
      }))).then(() => undefined));
    }
  };

  return {
    handleChunk(chunk: string | Buffer): void {
      for (const line of lineBuffer.push(chunk)) {
        handleLine(line);
      }
    },
    async finish(): Promise<void> {
      for (const line of lineBuffer.flush()) {
        handleLine(line);
      }
      const pending = hasRawBodyTelemetry() ? [] : parser.flush();
      if (hasRawBodyTelemetry()) {
        debugRecords.push(...parser.flush());
      }
      writeTasks.push(...pending.map((record) => writeRecord(writer, record)));
      writeTasks.push(otelCollector.flush().then((records) => Promise.all(records.map((record) => {
        wroteOtelRecord = true;
        return writeRecord(writer, record);
      }))).then(() => undefined));
      await Promise.all(writeTasks);
      if (hasRawBodyTelemetry() && !wroteOtelRecord) {
        const rawBodyRecords = await collectRawBodyFileRecords(options.outputRoot, sessionId, runStartedAtMs);
        if (rawBodyRecords.length > 0) {
          await Promise.all(rawBodyRecords.map((record) => writeRecord(writer, record)));
          return;
        }
        await Promise.all(debugRecords.map((record) => writeRecord(writer, record)));
      }
    },
  };
}

function runPipeMode(command: string, options: RunOptions, env: NodeJS.ProcessEnv, context: RunContext): Promise<number> {
  const child = spawn(command, options.args, {
    env,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (chunk: Buffer) => {
    process.stdout.write(chunk);
    context.handleChunk(chunk);
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    process.stderr.write(chunk);
    context.handleChunk(chunk);
  });

  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      context.finish().then(() => resolve(code ?? 0)).catch(reject);
    });
  });
}

async function runPtyMode(command: string, options: RunOptions, env: NodeJS.ProcessEnv, context: RunContext): Promise<number> {
  const pty = await import('@lydell/node-pty').catch((error) => {
    throw new Error(`@lydell/node-pty 加载失败，无法启动交互式终端：${error instanceof Error ? error.message : String(error)}`);
  });
  let ptyProcess: ReturnType<typeof pty.spawn>;
  try {
    ptyProcess = pty.spawn(command, options.args, {
      name: process.env.TERM ?? 'xterm-256color',
      cols: process.stdout.columns ?? 80,
      rows: process.stdout.rows ?? 24,
      cwd: process.cwd(),
      env,
    });
  } catch (error) {
    throw new Error(`无法启动命令 "${options.command}"：${error instanceof Error ? error.message : String(error)}`);
  }
  const onData = (chunk: Buffer | string) => {
    process.stdout.write(chunk);
    context.handleChunk(chunk);
  };
  const onInput = (chunk: Buffer | string) => {
    ptyProcess.write(chunk.toString());
  };
  const onResize = () => {
    ptyProcess.resize(process.stdout.columns ?? 80, process.stdout.rows ?? 24);
  };

  ptyProcess.onData(onData);
  process.stdin.on('data', onInput);
  process.stdout.on('resize', onResize);
  process.stdin.setRawMode?.(true);
  process.stdin.resume();

  return new Promise((resolve, reject) => {
    ptyProcess.onExit(({ exitCode }) => {
      process.stdin.off('data', onInput);
      process.stdout.off('resize', onResize);
      process.stdin.setRawMode?.(false);
      context.finish().then(() => resolve(exitCode)).catch(reject);
    });
  });
}

export async function resolveExecutable(command: string, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  if (command.includes('/') || command.includes('\\')) {
    if (await isExecutable(command)) {
      return command;
    }
    throw new Error(`无法启动命令 "${command}"：路径不存在或不可执行。`);
  }

  const pathValue = env.PATH ?? '';
  for (const entry of pathValue.split(path.delimiter)) {
    if (!entry) {
      continue;
    }
    const candidate = path.join(entry, command);
    if (await isExecutable(candidate)) {
      return candidate;
    }
  }

  throw new Error(`无法启动命令 "${command}"：PATH 中未找到可执行文件。若 ${command} 是 shell alias/function，请改用真实可执行路径。`);
}

async function isExecutable(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function hasRawBodyTelemetry(): boolean {
  return Boolean(process.env.OTEL_LOG_RAW_API_BODIES) || process.env.CLAUDE_CODE_ENABLE_TELEMETRY !== '0';
}

function buildEnv(enableDebugLog: boolean, sessionId: string, outputRoot: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  env.CLAUDE_FETCH_SESSION_ID = sessionId;
  env.CLAUDE_FETCH_OUTPUT_DIR = outputRoot;
  env.CLAUDE_CODE_ENABLE_TELEMETRY = env.CLAUDE_CODE_ENABLE_TELEMETRY ?? '1';
  env.OTEL_LOGS_EXPORTER = env.OTEL_LOGS_EXPORTER ?? 'console';
  env.OTEL_METRICS_EXPORTER = env.OTEL_METRICS_EXPORTER ?? 'none';
  env.OTEL_LOG_RAW_API_BODIES = env.OTEL_LOG_RAW_API_BODIES ?? `file:${path.join(outputRoot, 'otel-bodies')}`;
  env.OTEL_LOGS_EXPORT_INTERVAL = env.OTEL_LOGS_EXPORT_INTERVAL ?? '1000';
  if (enableDebugLog && !env.ANTHROPIC_LOG) {
    env.ANTHROPIC_LOG = 'debug';
  }
  return env;
}

async function writeRecord(writer: ArtifactWriter, record: CaptureRecord): Promise<void> {
  try {
    await writer.write(record);
  } catch (error) {
    process.stderr.write(`[claude-fetch] failed to write capture: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}
