import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Manifest } from '../model/capture-record.js';
import { escapeHtml, safeJsonScript } from '../utils/html.js';

export async function writeIndexHtml(outputRoot: string, manifest: Manifest): Promise<string> {
  const filePath = path.join(outputRoot, 'index.html');
  await writeFile(filePath, renderIndexHtml(manifest), 'utf8');
  return filePath;
}

function renderIndexHtml(manifest: Manifest): string {
  const total = manifest.items.length;
  const success = manifest.items.filter((item) => item.status && item.status >= 200 && item.status < 400).length;
  const failed = manifest.items.filter((item) => item.status && item.status >= 400).length;
  const avg = total ? Math.round(manifest.items.reduce((sum, item) => sum + (item.durationMs ?? 0), 0) / total) : 0;
  const latest = manifest.items.at(-1)?.htmlPath ?? '';
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>claude-fetch</title>
<style>
:root{--bg:#f1f5f9;--side:#cbd5e1;--panel:#fff;--ink:#111827;--muted:#64748b;--line:#e2e8f0;--brand:#475569;--good:#047857;--bad:#b91c1c}*{box-sizing:border-box}body{margin:0;height:100vh;display:grid;grid-template-columns:430px 1fr;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.side{background:var(--side);color:var(--ink);display:flex;flex-direction:column;min-width:0;border-right:1px solid var(--line)}.head{padding:18px;border-bottom:1px solid var(--line)}.head h1{margin:0 0 12px;font-size:20px;color:#334155}.stats{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.stat{background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px}.stat b{display:block;font-size:20px}.stat span{color:var(--muted);font-size:12px}.filters{display:grid;grid-template-columns:1fr 120px;gap:8px;margin-top:12px}.filters input,.filters select{border:1px solid var(--line);border-radius:10px;padding:9px;background:#fff;color:var(--ink)}.list{overflow:auto;padding:10px}.item{border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:14px;padding:12px;margin-bottom:10px;cursor:pointer;box-shadow:0 4px 14px #0f172a0a}.item:hover,.item.active{border-color:#64748b;background:#e2e8f0}.row{display:flex;justify-content:space-between;gap:8px;margin-bottom:6px}.path{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#334155;word-break:break-all}.meta{color:var(--muted);font-size:12px}.badge{border-radius:999px;padding:2px 8px;font-size:12px;background:#e2e8f0;color:#334155}.badge.ok{background:#dcfce7;color:var(--good)}.badge.bad{background:#fee2e2;color:var(--bad)}.main{display:flex;flex-direction:column;min-width:0}.toolbar{height:52px;background:#fff;border-bottom:1px solid var(--line);display:flex;align-items:center;padding:0 16px}iframe{border:0;width:100%;height:calc(100vh - 52px);background:#fff}.empty{display:grid;place-items:center;height:100%;color:var(--muted)}@media(max-width:1000px){body{grid-template-columns:1fr}.main{display:none}}
</style>
</head>
<body>
<aside class="side">
  <div class="head"><h1>claude-fetch</h1><div class="stats">${stat('总请求', total)}${stat('成功', success)}${stat('失败', failed)}${stat('平均耗时', `${avg}ms`)}</div><div class="filters"><input id="q" placeholder="搜索 path / request-id / model"><select id="status"><option value="">全部状态</option><option value="2">2xx</option><option value="4">4xx</option><option value="5">5xx</option></select></div></div>
  <div class="list" id="list"></div>
</aside>
<main class="main"><div class="toolbar"><strong id="title">${escapeHtml(latest || '暂无请求')}</strong></div>${latest ? `<iframe id="frame" src="${escapeHtml(latest)}"></iframe>` : '<div class="empty">暂无捕获记录</div>'}</main>
<script id="manifest" type="application/json">${safeJsonScript(manifest)}</script>
<script>
const manifest=JSON.parse(document.getElementById('manifest').textContent);let selected=manifest.items.at(-1)?.id;
function cls(s){return s>=500?'bad':s>=400?'bad':'ok'}
function render(){const q=document.getElementById('q').value.toLowerCase();const st=document.getElementById('status').value;const list=document.getElementById('list');list.innerHTML='';manifest.items.slice().reverse().filter(i=>{const text=[i.path,i.requestId,i.model,i.htmlPath,i.jsonPath].join(' ').toLowerCase();const sm=!st||String(i.status||'').startsWith(st);return text.includes(q)&&sm}).forEach(i=>{const el=document.createElement('div');el.className='item '+(selected===i.id?'active':'');el.onclick=()=>select(i);const name=(i.htmlPath||i.jsonPath||i.id).split('/').at(-1);el.innerHTML='<div class="row"><b>'+esc(i.method+' '+(i.status||''))+'</b><span class="badge '+cls(i.status)+'">'+(i.durationMs||'-')+'ms</span></div><div class="path">'+esc(i.path)+'</div><div class="meta">'+esc(i.model||'unknown')+'</div><div class="meta">'+esc(name)+'</div>';list.appendChild(el)})}
function select(i){selected=i.id;document.getElementById('frame').src=i.htmlPath;document.getElementById('title').textContent=i.htmlPath;render()}
function esc(s){return String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')}
document.getElementById('q').addEventListener('input',render);document.getElementById('status').addEventListener('change',render);render();if(manifest.items.length)select(manifest.items.at(-1));
</script>
</body>
</html>`;
}

function stat(label: string, value: unknown): string {
  return `<div class="stat"><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></div>`;
}
