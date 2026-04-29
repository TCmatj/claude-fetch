import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CaptureRecord } from '../model/capture-record.js';
import { escapeHtml, safeJsonScript } from '../utils/html.js';
import { captureDatePath, captureFilePrefix } from '../utils/paths.js';

export async function writeRequestHtml(outputRoot: string, record: CaptureRecord): Promise<string> {
  const dir = path.join(outputRoot, 'captures', captureDatePath(new Date(record.startedAt)));
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const filePath = path.join(dir, `${captureFilePrefix(new Date(record.startedAt))}_${record.id}.html`);
  await writeFile(filePath, renderRequestHtml(record), 'utf8');
  return filePath;
}

function renderRequestHtml(record: CaptureRecord): string {
  const status = record.response?.status;
  const statusClass = status && status >= 500 ? 'bad' : status && status >= 400 ? 'warn' : 'ok';
  const model = extractModel(record.request.body);
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(record.id)}</title>
<style>
:root{color-scheme:light;--bg:#eef2f7;--panel:#fff;--ink:#111827;--muted:#6b7280;--line:#e5e7eb;--brand:#4338ca;--good:#047857;--warn:#b45309;--bad:#b91c1c;--code-bg:#f8fafc;--code-ink:#334155}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.top{position:sticky;top:0;z-index:5;background:#334155;color:#f8fafc;padding:14px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;box-shadow:0 8px 24px #0002}.top h1{font-size:16px;margin:0}.top a{color:#c7d2fe;text-decoration:none}.badgebag{display:flex;gap:8px;flex-wrap:wrap}.badge{border-radius:999px;padding:4px 10px;font-size:12px;background:#475569;color:#f8fafc}.badge.ok{background:var(--good)}.badge.warn{background:var(--warn)}.badge.bad{background:var(--bad)}.wrap{padding:20px;max-width:1800px;margin:0 auto}.cards{display:grid;grid-template-columns:repeat(5,minmax(160px,1fr));gap:12px;margin-bottom:16px}.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px;box-shadow:0 8px 24px #1118270d}.label{color:var(--muted);font-size:12px;margin-bottom:6px}.value{font-weight:700;word-break:break-all}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.panel{background:var(--panel);border:1px solid var(--line);border-radius:16px;overflow:hidden;box-shadow:0 8px 24px #1118270d}.panel h2{font-size:15px;margin:0;padding:14px 16px;background:#f8fafc;border-bottom:1px solid var(--line)}details{border-bottom:1px solid var(--line)}details:last-child{border-bottom:0}summary{cursor:pointer;padding:12px 16px;font-weight:700}.section{padding:0 16px 16px}.toolbar{display:flex;gap:8px;margin:0 0 10px}.toolbar input{flex:1;border:1px solid var(--line);border-radius:10px;padding:8px 10px}.toolbar button,.copy{border:1px solid var(--line);background:#fff;border-radius:10px;padding:7px 10px;cursor:pointer}.json{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.7;background:var(--code-bg);color:var(--code-ink);border:1px solid var(--line);border-radius:12px;padding:12px;overflow:visible}.plain{white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;margin:0}.node{white-space:nowrap}.toggle{color:#2563eb;cursor:pointer;display:inline-block;width:14px}.key{color:#0369a1}.str{color:#15803d}.num{color:#b45309}.bool{color:#be185d}.nil{color:#7c3aed}.meta{color:#64748b}.match{background:#fde68a;color:#111827;border-radius:3px}.raw{white-space:pre-wrap;background:var(--code-bg);color:var(--code-ink);border:1px solid var(--line);border-radius:12px;padding:12px;max-height:360px;overflow:auto}.err{color:#b91c1c}.tabs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 10px}.tab{border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 10px;cursor:pointer;font-size:12px}.tab.active{background:#4338ca;color:#fff;border-color:#4338ca}.hidden{display:none}.page-tabs{display:flex;gap:8px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid var(--line);background:#fff}.array-item{border:1px solid var(--line);border-radius:12px;background:#fff;margin:0 0 10px;overflow:hidden}.array-title{background:#f1f5f9;border-bottom:1px solid var(--line);padding:8px 10px;font-weight:700;color:#475569}.array-body{padding:10px}.cache-control{border-top:1px dashed #cbd5e1;background:#f8fafc;color:#475569;padding:8px 10px;font-size:11px}.cache-control b{color:#334155}.prompt-block{background:#f0fdf4;border-color:#bbf7d0}.prompt-block .array-body{background:#f0fdf4}.prompt-reminder{background:#fffbeb;border-color:#fde68a}.prompt-reminder .array-body{background:#fffbeb}@media(max-width:1100px){.cards,.grid{grid-template-columns:1fr}.top{align-items:flex-start;flex-direction:column}}
</style>
</head>
<body>
<header class="top"><div><h1>${escapeHtml(record.id)}</h1><div class="badgebag"><span class="badge">${escapeHtml(record.request.method)}</span><span class="badge ${statusClass}">${escapeHtml(status ?? 'NO_STATUS')}</span><span class="badge">${escapeHtml(model ?? 'unknown model')}</span><span class="badge">${escapeHtml(record.durationMs ? `${record.durationMs}ms` : 'unknown duration')}</span></div></div></header>
<main class="wrap">
<section class="cards">
${card('Session', record.sessionId)}${card('Path', record.request.path)}${card('Request ID', getHeader(record.response?.headers, 'request-id') ?? getHeader(record.response?.headers, 'x-request-id') ?? getHeader(record.response?.headers, 'x-oneapi-request-id') ?? '-')}${card('Completeness', record.completeness)}${card('Usage', `${record.usage.inputTokens} / ${record.usage.outputTokens}`)}
</section>
<section class="panel"><h2>请求 / 响应</h2><div class="page-tabs"><button class="tab active" data-page-tab="request" onclick="pageTab('request')">请求参数</button><button class="tab" data-page-tab="response" onclick="pageTab('response')">响应参数</button><button class="tab" data-page-tab="requestRaw" onclick="pageTab('requestRaw')">Request Raw</button><button class="tab" data-page-tab="responseRaw" onclick="pageTab('responseRaw')">Response Raw</button></div><div data-page="request">${jsonDetails('User Prompts', 'requestMessages')}${jsonDetails('System Prompt', 'requestSystem')}${jsonDetails('Tools', 'requestTools')}${jsonDetails('Model / Thinking / Output', 'requestModelParams')}</div><div data-page="response" class="hidden">${jsonDetails('Response Content', 'responseContent')}${jsonDetails('Usage', 'responseUsage')}${jsonDetails('Stop / Metadata', 'responseMeta')}</div><div data-page="requestRaw" class="hidden">${jsonDetails('Headers', 'requestHeaders')}${jsonDetails('Body', 'requestBody')}</div><div data-page="responseRaw" class="hidden">${jsonDetails('Headers', 'responseHeaders')}${jsonDetails('Body', 'responseBody')}${rawDetails('SSE Events', record.response?.sse?.raw ?? '')}${record.error ? rawDetails('Error', JSON.stringify(record.error, null, 2)) : ''}</div></section>
</main>
<script id="capture-data" type="application/json">${safeJsonScript(record)}</script>
<script>
const state={};
const data=JSON.parse(document.getElementById('capture-data').textContent);
const derived={
 request:{
  modelParams:{
   model:data.request?.body?.model,
   max_tokens:data.request?.body?.max_tokens,
   betas:data.request?.body?.betas,
   metadata:data.request?.body?.metadata,
   thinking:data.request?.body?.thinking,
   context_management:data.request?.body?.context_management,
   output_config:data.request?.body?.output_config,
   stream:data.request?.body?.stream
  }
 },
 response:{
  meta:{
   id:data.response?.body?.id,
   type:data.response?.body?.type,
   role:data.response?.body?.role,
   model:data.response?.body?.model,
   stop_reason:data.response?.body?.stop_reason,
   stop_sequence:data.response?.body?.stop_sequence
  }
 }
};
function byPath(path){const source=path.startsWith('derived.')?derived:data;const clean=path.startsWith('derived.')?path.slice('derived.'.length):path;return clean.replace(/\\[(\\d+)\\]/g,'.$1').split('.').filter(Boolean).reduce((v,k)=>v==null?undefined:v[k],source)}
function esc(s){return String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')}
function typeClass(v){return v===null?'nil':typeof v==='string'?'str':typeof v==='number'?'num':typeof v==='boolean'?'bool':'meta'}
function short(v){return String(v)}
function pathOf(root,path,key,isArray){return path+(isArray?'['+key+']':'.'+key)}
function renderJson(root,path,depth=0,query=''){
 const v=byPath(root);if(root==='request.body.messages')return renderPromptBlocks(v,query);if(root==='request.body.system'||root==='response.body.content')return renderContentBlocks(v,query);if(root==='request.body.tools')return renderToolTabs(v,query);if(Array.isArray(v))return renderArrayBlocks(v,query);return '<pre class="plain">'+hit(JSON.stringify(v,null,2),query.toLowerCase())+'</pre>'
}
function renderContentBlocks(value,query=''){
 const items=Array.isArray(value)?value:[value];return items.filter(item=>item!==undefined&&item!==null).map(item=>{const text=typeof item==='string'?item:item?.text??JSON.stringify(item,null,2);return renderBlock('array-item',text,cacheControlOf(item),query)}).join('')
}
function renderPromptBlocks(messages,query=''){
 const blocks=[];(Array.isArray(messages)?messages:[]).forEach(message=>{const content=Array.isArray(message?.content)?message.content:[message?.content];content.filter(Boolean).forEach(item=>blocks.push(item))});return blocks.map(item=>{const text=typeof item==='string'?item:item?.text??JSON.stringify(item,null,2);const cls=String(text).trimStart().startsWith('<system-reminder>')?'array-item prompt-reminder':'array-item prompt-block';return renderBlock(cls,text,cacheControlOf(item),query)}).join('')
}
function renderBlock(cls,text,cacheControl,query){return '<div class="'+cls+'"><div class="array-body"><pre class="plain">'+hit(text,query.toLowerCase())+'</pre></div>'+renderCacheControl(cacheControl,query)+'</div>'}
function cacheControlOf(item){return item&&typeof item==='object'&&!Array.isArray(item)?item.cache_control:undefined}
function renderCacheControl(cacheControl,query){return cacheControl===undefined?'':'<div class="cache-control"><b>cache_control:</b><pre class="plain">'+hit(JSON.stringify(cacheControl,null,2),query.toLowerCase())+'</pre></div>'}
function renderArrayBlocks(items,query=''){
 return items.map((item,i)=>'<div class="array-item"><div class="array-title">#'+(i+1)+'</div><div class="array-body"><pre class="plain">'+hit(JSON.stringify(item,null,2),query.toLowerCase())+'</pre></div></div>').join('')
}
function renderToolTabs(v,query=''){
 const tools=Array.isArray(v)?v:[];if(!tools.length)return '<pre class="plain">'+hit(JSON.stringify(v,null,2),query.toLowerCase())+'</pre>';const active=state['tools:active']??0;const tabs=tools.map((tool,i)=>'<button class="tab '+(active===i?'active':'')+'" onclick="toolTab('+i+')">'+esc(tool?.name??('tool '+(i+1)))+'</button>').join('');return '<div class="tabs">'+tabs+'</div><pre class="plain">'+hit(JSON.stringify(tools[active],null,2),query.toLowerCase())+'</pre>'
}
function toolTab(i){state['tools:active']=i;refreshAll()}
function renderValue(v,root,path,depth,query){
 const id=root+':'+path;const q=query.toLowerCase();
 if(Array.isArray(v)||v&&typeof v==='object'){
  const entries=Array.isArray(v)?v.map((x,i)=>[i,x]):Object.entries(v);const open=state[id]??true;const limit=state[id+':limit']??50;
  const body=entries.slice(0,limit).map(([k,val])=>{const childPath=pathOf(root,path,k,Array.isArray(v));return '<div style="margin-left:18px">'+(Array.isArray(v)?'<span class="meta">'+k+'</span>':'<span class="key" title="'+esc(childPath)+'">'+hit(k,q)+'</span>')+': '+renderValue(val,root,childPath,depth+1,query)+'</div>'}).join('');
  const more=entries.length>limit?'<button class="copy" onclick="more(&quot;'+esc(id)+'&quot;)">展开更多 '+(entries.length-limit)+'</button>':'';
  return '<span class="toggle" onclick="flip(&quot;'+esc(id)+'&quot;)">'+(open?'▾':'▸')+'</span><span class="meta">'+(Array.isArray(v)?'Array':'Object')+'('+entries.length+')</span>'+(!open?'':'<div>'+body+more+'</div>');
 }
 return '<span class="'+typeClass(v)+'" title="'+esc(path)+'">'+hit(JSON.stringify(v),q)+'</span>'
}
function hit(s,q){const e=esc(short(s));if(!q)return e;return e.toLowerCase().includes(q)?'<span class="match">'+e+'</span>':e}
function flip(id){state[id]=!(state[id]??true);refreshAll()}
function more(id){state[id+':limit']=(state[id+':limit']??50)+50;refreshAll()}
function pageTab(name){document.querySelectorAll('[data-page]').forEach(el=>el.classList.toggle('hidden',el.dataset.page!==name));document.querySelectorAll('[data-page-tab]').forEach(el=>el.classList.toggle('active',el.dataset.pageTab===name))}
function refreshAll(){document.querySelectorAll('[data-json-root]').forEach(el=>{el.innerHTML=renderJson(el.dataset.jsonRoot,el.dataset.jsonRoot,0,'')})}
function copyPath(root){navigator.clipboard?.writeText(JSON.stringify(byPath(root),null,2))}refreshAll();
</script>
</body>
</html>`;
}

function card(label: string, value: unknown): string {
  return `<div class="card"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`;
}

function jsonDetails(title: string, id: string): string {
  const root = rootForJsonBlock(id);
  return `<details open><summary>${escapeHtml(title)}</summary><div class="section"><div class="json" data-json-root="${root}"></div></div></details>`;
}

function rootForJsonBlock(id: string): string {
  const roots: Record<string, string> = {
    requestHeaders: 'request.headers',
    requestBody: 'request.body',
    requestMessages: 'request.body.messages',
    requestSystem: 'request.body.system',
    requestTools: 'request.body.tools',
    requestModelParams: 'derived.request.modelParams',
    responseHeaders: 'response.headers',
    responseBody: 'response.body',
    responseContent: 'response.body.content',
    responseUsage: 'response.body.usage',
    responseMeta: 'derived.response.meta',
  };
  return roots[id] ?? 'request.body';
}

function rawDetails(title: string, value: string): string {
  if (!value) {
    return '';
  }
  return `<details><summary>${escapeHtml(title)}</summary><div class="section"><pre class="raw">${escapeHtml(value)}</pre></div></details>`;
}

function extractModel(body: unknown): string | undefined {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return undefined;
  }
  const model = (body as { model?: unknown }).model;
  return typeof model === 'string' ? model : undefined;
}

function getHeader(headers: Record<string, unknown> | undefined, name: string): string | undefined {
  if (!headers) {
    return undefined;
  }
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return typeof entry?.[1] === 'string' ? entry[1] : undefined;
}
