#!/usr/bin/env node
import { Command } from 'commander';
import { runClaude } from './claude-runner.js';
import { resolveOutputRoot } from './utils/paths.js';

const program = new Command();

type CliOptions = Record<string, string | boolean | undefined>;

program
  .name('claude-fetch')
  .description('Capture Claude Code Messages API debug artifacts locally')
  .version('0.1.0')
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .option('--output <dir>', '捕获文件输出目录')
  .option('--mode <mode>', '捕获模式：debug-log 或 proxy', 'debug-log')
  .option('--enable-debug-log', '若未设置 ANTHROPIC_LOG，则设置为 debug')
  .option('--redact <value>', '是否脱敏敏感字段', 'true')
  .option('--html <value>', '是否生成请求详情 HTML', 'true')
  .option('--index-html <value>', '是否生成总览 HTML', 'true')
  .option('--json <value>', '是否生成 JSON', 'true')
  .argument('[commandArgs...]')
  .action(async (commandArgs: string[], opts: CliOptions) => {
    await start(commandArgs, opts);
  });

program
  .command('start')
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .option('--output <dir>', '捕获文件输出目录')
  .option('--mode <mode>', '捕获模式：debug-log 或 proxy', 'debug-log')
  .option('--enable-debug-log', '若未设置 ANTHROPIC_LOG，则设置为 debug')
  .option('--redact <value>', '是否脱敏敏感字段', 'true')
  .option('--html <value>', '是否生成请求详情 HTML', 'true')
  .option('--index-html <value>', '是否生成总览 HTML', 'true')
  .option('--json <value>', '是否生成 JSON', 'true')
  .argument('[commandArgs...]')
  .action(async (commandArgs: string[], opts: CliOptions) => {
    await start(commandArgs, opts);
  });

async function start(commandArgs: string[], opts: CliOptions): Promise<void> {
  if (opts.mode === 'proxy') {
    console.error('[claude-fetch] proxy 模式尚未实现；默认 debug-log 模式不会改变原始请求路径。');
    process.exitCode = 2;
    return;
  }
  if (opts.mode && opts.mode !== 'debug-log') {
    console.error(`[claude-fetch] 不支持的 mode: ${opts.mode}`);
    process.exitCode = 2;
    return;
  }

  const separatorIndex = commandArgs.indexOf('--');
  const rawArgs = separatorIndex >= 0 ? commandArgs.slice(separatorIndex + 1) : commandArgs;
  const command = rawArgs[0] ?? 'claude';
  const args = rawArgs.slice(1);
  const outputRoot = resolveOutputRoot(typeof opts.output === 'string' ? opts.output : undefined);
  console.error(`[claude-fetch] output: ${outputRoot}`);

  const code = await runClaude({
    outputRoot,
    command,
    args,
    enableDebugLog: Boolean(opts.enableDebugLog),
    redact: parseBoolean(opts.redact, true),
    html: parseBoolean(opts.html, true),
    indexHtml: parseBoolean(opts.indexHtml, true),
    json: parseBoolean(opts.json, true),
  });
  process.exitCode = code;
}

program.parseAsync().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value !== 'string') {
    return fallback;
  }
  return !['false', '0', 'no'].includes(value.toLowerCase());
}
