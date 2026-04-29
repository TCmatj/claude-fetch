# claude-fetch

`claude-fetch` 用于在本地捕获 Claude Code 的 Messages API 请求与响应，并生成 JSON、HTML、manifest 和日志文件，方便调试、审计和查看完整 prompt / response 内容。

核心原则：**不代理请求、不改写路由、不覆盖认证环境变量**。原来 Claude Code 走官方 API、自定义网关、Bedrock、Vertex 或兼容 endpoint，仍按原路径发送。

English documentation: [README.en.md](README.en.md)

## 功能特性

- 基于 Claude Code 官方 OTEL raw body 文件捕获完整 request / response body。
- 保持原始请求路由不变，不修改认证配置。
- 写盘前递归脱敏敏感字段。
- 生成本地可浏览报告：`index.html` + 单请求详情页。
- 支持 debug log fallback，用于 OTEL raw body 不可用时兜底。
- 使用 `prompt.id` 配对并发请求与响应。

## 安装

发布后全局安装：

```bash
npm install -g @matijun/claude-fetch
```

本地开发安装：

```bash
git clone <repo-url>
cd claude-fetch
npm install
npm run build
npm link
```

安装后命令为：

```bash
claude-fetch
```

## 快速开始

通过 `claude-fetch` 启动 Claude Code：

```bash
claude-fetch
```

等价于：

```bash
node dist/src/cli.js start -- claude
```

发送一句 prompt，并指定输出目录：

```bash
claude-fetch --output ./tmp-real-captures -- claude -p "hello"
```

打开总览页：

```bash
open ./tmp-real-captures/index.html
```

默认输出目录：

```text
./claude-fetch-output/
```

## 使用方式

```bash
claude-fetch [options] -- <claude-command> [claude-args...]
```

`claude-command` 默认是 `claude`，所以以下命令等价：

```bash
claude-fetch
claude-fetch -- claude
claude-fetch start -- claude
```

常用示例：

```bash
claude-fetch --output ./captures
claude-fetch --output ./captures -- claude -p "hello"
claude-fetch --enable-debug-log -- claude -p "hello"
claude-fetch --json true --html true --index-html true -- claude
```

## CLI 参数

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `--output <dir>` | `./claude-fetch-output` | 捕获文件输出目录。 |
| `--enable-debug-log` | `false` | 当环境中未设置 `ANTHROPIC_LOG` 时，设置为 `debug`，作为 fallback。 |
| `--redact <value>` | `true` | 写入文件前脱敏敏感字段。支持 `false`、`0`、`no`。 |
| `--html <value>` | `true` | 生成单请求 HTML 详情页。 |
| `--index-html <value>` | `true` | 生成总览页 `index.html`。 |
| `--json <value>` | `true` | 生成单请求 JSON 记录。 |
| `--mode <mode>` | `debug-log` | 捕获模式。`proxy` 为保留模式，尚未实现。 |

## 输出文件

```text
<output>/
  index.html
  manifest.json
  captures/
    <yyyy-mm-dd>/
      <capture-id>.json
      <capture-id>.html
  logs/
    claude-fetch.log
  otel-bodies/
    ...
```

文件说明：

- `index.html`：总览页，展示请求列表、筛选器和 iframe 预览。
- `manifest.json`：所有捕获请求的摘要信息。
- `captures/<date>/*.json`：单次请求的完整结构化记录。
- `captures/<date>/*.html`：单次请求详情页。
- `logs/claude-fetch.log`：JSONL 运行日志。
- `otel-bodies/`：Claude Code 官方 raw body 中间文件。

## 实现原理

`claude-fetch` 不做网络代理，不转发请求，也不改写请求地址。它只负责启动 `claude` 子进程，并开启 Claude Code 官方 telemetry/raw body 输出。

### 1. 启动 Claude Code 子进程

`claude-fetch` 使用 `child_process.spawn` 启动 `claude`，默认继承当前 shell 环境变量。

程序不会设置或覆盖以下路由 / 认证变量：

```text
ANTHROPIC_BASE_URL
ANTHROPIC_API_KEY
ANTHROPIC_AUTH_TOKEN
AWS_*
GOOGLE_*
```

因此已有 Claude Code 路由保持不变：

- 原来走 Anthropic 官方 API，仍走官方 API。
- 原来走自定义网关，仍走自定义网关。
- 原来走 Bedrock，仍走 Bedrock。
- 原来走 Vertex，仍走 Vertex。

### 2. 开启 OTEL raw body 捕获

运行时只设置捕获相关 telemetry 环境变量：

```text
CLAUDE_CODE_ENABLE_TELEMETRY=1
OTEL_LOGS_EXPORTER=console
OTEL_METRICS_EXPORTER=none
OTEL_LOG_RAW_API_BODIES=file:<output>/otel-bodies
OTEL_LOGS_EXPORT_INTERVAL=1000
```

Claude Code 会输出类似事件：

```text
claude_code.api_request_body
claude_code.api_request
claude_code.api_response_body
```

`api_request_body` 和 `api_response_body` 事件中包含 `body_ref`，指向原始 JSON body 文件。`claude-fetch` 读取这些文件，恢复完整请求体和响应体。

### 3. 使用 `prompt.id` 配对事件

一次 API 调用会产生多条 telemetry 事件，它们拥有相同 `prompt.id`。`claude-fetch` 会把这些事件合并为一条 `CaptureRecord`。

合并内容：

- request body：来自 `api_request_body.body_ref`
- response body：来自 `api_response_body.body_ref`
- model、token、duration：来自 `api_request`
- OTEL 元信息：保存到 request / response 的 `otel.*` headers 中

完整记录会标记为：

```json
{
  "completeness": "complete",
  "truncated": false
}
```

部分 fallback 记录会标记为：

```json
{
  "completeness": "partial",
  "truncated": true
}
```

### 4. Debug fallback

启用 debug fallback：

```bash
claude-fetch --enable-debug-log -- claude -p "hello"
```

如果当前环境没有设置 `ANTHROPIC_LOG`，程序会设置：

```text
ANTHROPIC_LOG=debug
```

debug log 可能把深层对象折叠为 `[Object ...]`，因此只作为兜底来源。只要 OTEL raw body 捕获到了完整记录，就优先使用完整记录。

## 安全与脱敏

写入任何 artifact 前，程序会递归脱敏敏感字段：

```text
x-api-key
authorization
proxy-authorization
cookie
set-cookie
```

HTML 页面只使用本地内联资源，不加载远程脚本。捕获内容会进行 HTML escape，并通过安全 JSON script 注入，避免本地 XSS。

输出文件仍可能包含 prompt、模型响应、请求元信息和未命中脱敏规则的业务数据。请把捕获目录视为敏感数据处理。

## 开发

安装依赖：

```bash
npm install
```

开发模式运行：

```bash
npm run dev -- -- claude -p "hello"
```

构建：

```bash
npm run build
```

类型检查：

```bash
npm run typecheck
```

运行测试：

```bash
npm test
```

完整验证：

```bash
npm run typecheck
npm test
npm run build
```

## 项目结构

```text
src/
  cli.ts                         CLI 入口
  claude-runner.ts               子进程启动与生命周期管理
  collectors/                    stdout / stderr 行收集
  parsers/                       debug 与 OTEL 解析器
  writers/                       JSON、HTML、manifest、log 写入器
  utils/                         path、HTML、脱敏等工具
test/
  fixtures/                      模拟 Claude Code 输出
  e2e.test.ts                    端到端 artifact 测试
```

## 发布

包名使用 scoped package，避免和 npm 全局包名冲突：

```json
{
  "name": "@matijun/claude-fetch",
  "bin": {
    "claude-fetch": "./dist/src/cli.js"
  }
}
```

发布公开 scoped 包：

```bash
npm publish --access public
```

安装发布包：

```bash
npm install -g @matijun/claude-fetch
claude-fetch
```

## 清理输出

删除输出目录即可：

```bash
rm -rf ./claude-fetch-output
rm -rf ./tmp-real-captures
```
