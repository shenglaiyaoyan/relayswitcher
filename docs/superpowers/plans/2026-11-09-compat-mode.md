# 兼容模式（本机改写代理）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ChatGPT 页加手动「兼容模式」开关：开启并切换后，Codex 经 RS 本机代理访问中转站，代理把缺 `call_id` 的工具结果改成普通用户消息，修复 Sub2API 系中转的 call_id 报错。

**Architecture:** 三个独立模块：`compat-rewrite.js`（纯函数改写）、`compat-proxy.js`（127.0.0.1 HTTP 代理，上游 fetch 可注入）、`compat-manager.js`（按 Codex 配置决定代理是否运行、换端口、状态汇总）。`codex.applySwitch` 新增 `baseUrlOverride`；`main.js` 只做接线（切换、回滚、启动同步、退出确认、状态）。界面改 Dashboard 和 Settings。

**Tech Stack:** Electron 33（main 进程 `net.fetch`）、Node `http`/`zlib`、`fzstd`（zstd 解码）、React 18、`node:test`。

规格：`docs/superpowers/specs/2026-11-09-compat-mode-design.md`。全部命令在 `D:\project\playground\relayswitcher` 下执行。

---

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `electron/lib/compat-rewrite.js` | 新建 | 改写请求体里缺 `call_id` 的工具结果 |
| `electron/lib/compat-proxy.js` | 新建 | 本机代理：读请求、解压、改写、转发、流式回写 |
| `electron/lib/compat-manager.js` | 新建 | 代理生命周期与状态 |
| `electron/lib/codex.js` | 修改 | `applySwitch` 支持 `baseUrlOverride` |
| `electron/lib/store.js` | 修改 | 新增三个设置默认值 |
| `electron/main.js` | 修改 | 接线、退出确认、smoke 场景 F |
| `src/pages/Dashboard.jsx` | 修改 | 开关行、待生效提示、状态行、演示数据 |
| `src/pages/Settings.jsx` | 修改 | 端口输入 |
| `src/styles.css` | 修改（CRLF，用 edit 工具） | `.cg-compat`、`.cg-go-hint.pending` |
| `test/compat-rewrite.test.js` 等 | 新建 | 单测 |

---

### Task 1: 改写规则

**Files:**
- Create: `electron/lib/compat-rewrite.js`
- Test: `test/compat-rewrite.test.js`

- [ ] **Step 1: 写失败测试**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { rewriteOrphanToolOutputs } = require('../electron/lib/compat-rewrite');

test('缺 call_id 的工具结果改成 user 消息，其余条目原样，不改原对象', () => {
  const call = { type: 'function_call', call_id: 'call_1', name: 'shell', arguments: '{}' };
  const paired = { type: 'function_call_output', call_id: 'call_1', output: 'ok' };
  const body = { model: 'm', stream: true, input: [
    { type: 'function_call_output', id: 'fco_1', name: 'codex_apps_open_page', namespace: 'agent', output: '{"page_id":null}',
      internal_chat_message_metadata_passthrough: {} },
    { type: 'custom_tool_call_output', call_id: '  ', output: [{ type: 'input_text', text: 'a' }, { type: 'input_image', image_url: 'data:x' }, { type: 'other', v: 1 }] },
    { type: 'function_call_output', call_id: null, output: null },
    call, paired
  ] };
  const r = rewriteOrphanToolOutputs(body);
  assert.equal(r.count, 3);
  assert.deepEqual(r.body.input[0], { type: 'message', role: 'user', content: [{ type: 'input_text', text: '[codex_apps_open_page]\n{"page_id":null}' }] });
  assert.deepEqual(r.body.input[1], { type: 'message', role: 'user', content: [
    { type: 'input_text', text: 'a' }, { type: 'input_image', image_url: 'data:x' }, { type: 'input_text', text: '{"type":"other","v":1}' }] });
  assert.deepEqual(r.body.input[2], { type: 'message', role: 'user', content: [{ type: 'input_text', text: '' }] });
  assert.equal(r.body.input[3], call);
  assert.equal(r.body.input[4], paired);
  assert.equal(r.body.model, 'm');
  assert.equal(body.input[0].type, 'function_call_output');
});

test('有名字但没有文本时单独补一条名字；无需改写时返回原对象', () => {
  const r = rewriteOrphanToolOutputs({ input: [{ type: 'function_call_output', name: 'x', output: [{ type: 'input_image', image_url: 'u' }] }] });
  assert.deepEqual(r.body.input[0].content, [{ type: 'input_text', text: '[x]' }, { type: 'input_image', image_url: 'u' }]);
  const clean = { input: [{ type: 'message', role: 'user', content: [] }] };
  const same = rewriteOrphanToolOutputs(clean);
  assert.equal(same.count, 0);
  assert.equal(same.body, clean);
  assert.equal(rewriteOrphanToolOutputs({ input: 'text' }).count, 0);
  assert.equal(rewriteOrphanToolOutputs(null).count, 0);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/compat-rewrite.test.js`
Expected: FAIL，`Cannot find module '../electron/lib/compat-rewrite'`

- [ ] **Step 3: 实现**

```js
'use strict';
/**
 * 兼容模式改写规则(2026-11-09):Codex 桌面版 0.167 的 Page 功能每轮插入缺 call_id 的
 * function_call_output(codex_apps_open_page 等),Sub2API 系中转在请求里没有工具调用时整单拒绝。
 * 把这类条目改成普通 user 消息,其余条目原样。
 */
const TOOL_OUTPUT_TYPES = new Set(['function_call_output', 'custom_tool_call_output']);

function isOrphanToolOutput(item) {
  return !!item && typeof item === 'object' && TOOL_OUTPUT_TYPES.has(item.type)
    && !(typeof item.call_id === 'string' && item.call_id.trim());
}

function toParts(output) {
  if (typeof output === 'string') return [{ type: 'input_text', text: output }];
  if (Array.isArray(output)) {
    return output.map(part => {
      if (part && ['input_text', 'output_text', 'text'].includes(part.type) && typeof part.text === 'string') {
        return { type: 'input_text', text: part.text };
      }
      if (part && (part.type === 'input_image' || part.type === 'input_file')) return part;
      return { type: 'input_text', text: typeof part === 'string' ? part : JSON.stringify(part) };
    });
  }
  if (output == null) return [];
  return [{ type: 'input_text', text: JSON.stringify(output) }];
}

function toUserMessage(item) {
  const parts = toParts(item.output);
  if (item.name) {
    const label = `[${item.name}]`;
    const first = parts.findIndex(p => p.type === 'input_text');
    if (first >= 0) parts[first] = { type: 'input_text', text: label + '\n' + parts[first].text };
    else parts.unshift({ type: 'input_text', text: label });
  }
  if (!parts.length) parts.push({ type: 'input_text', text: '' });
  return { type: 'message', role: 'user', content: parts };
}

/** 返回 { body, count }:count 为 0 时 body 就是传入的原对象 */
function rewriteOrphanToolOutputs(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.input)) return { body, count: 0 };
  let count = 0;
  const input = body.input.map(item => {
    if (!isOrphanToolOutput(item)) return item;
    count++;
    return toUserMessage(item);
  });
  return count ? { body: { ...body, input }, count } : { body, count: 0 };
}

module.exports = { rewriteOrphanToolOutputs, isOrphanToolOutput };
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/compat-rewrite.test.js`
Expected: `# pass 2`、`# fail 0`

- [ ] **Step 5: 提交**

```bash
git add electron/lib/compat-rewrite.js test/compat-rewrite.test.js
git commit -m "feat(compat): 缺 call_id 的工具结果改写规则"
```

---

### Task 2: 本机代理

**Files:**
- Create: `electron/lib/compat-proxy.js`
- Modify: `package.json`、`package-lock.json`（`npm install fzstd@0.1.1`）
- Test: `test/compat-proxy.test.js`

- [ ] **Step 1: 安装依赖**

Run: `npm.cmd install fzstd@0.1.1 --save`
Expected: `package.json` dependencies 出现 `"fzstd": "^0.1.1"`；随后 `node --test test/package-integrity.test.js` 通过。

- [ ] **Step 2: 写失败测试**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const zlib = require('zlib');
const { createCompatProxy } = require('../electron/lib/compat-proxy');

const listen = server => new Promise(r => server.listen(0, '127.0.0.1', () => r(server.address().port)));
const ORPHAN = { type: 'function_call_output', id: 'fco_1', name: 'codex_apps_open_page', namespace: 'agent', output: '{"page_id":null}' };
const USER = { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] };
const sse = (_req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end('data: {"type":"response.completed"}\n\n'); };

async function setup(t, upstreamHandler) {
  const seen = [];
  const upstream = http.createServer((req, res) => {
    const parts = [];
    req.on('data', c => parts.push(c));
    req.on('end', () => {
      const body = Buffer.concat(parts);
      seen.push({ method: req.method, url: req.url, headers: req.headers, body });
      upstreamHandler(req, res, body);
    });
  });
  const upPort = await listen(upstream);
  let target = `http://127.0.0.1:${upPort}/v1`;
  const proxy = createCompatProxy({ port: 0, resolveTarget: () => target, fetchImpl: fetch });
  await proxy.start();
  t.after(async () => { await proxy.stop(); upstream.closeAllConnections(); upstream.close(); });
  return { seen, proxy, base: `http://127.0.0.1:${proxy.port}`, setTarget: v => { target = v; } };
}

test('缺 call_id 的工具结果改成 user 消息后再转发，Authorization 原样，统计改写条数', async t => {
  const { seen, proxy, base } = await setup(t, sse);
  const r = await fetch(base + '/responses', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer sk-1' },
    body: JSON.stringify({ model: 'm', input: [ORPHAN, USER] }) });
  assert.equal(r.status, 200);
  assert.match(await r.text(), /response\.completed/);
  assert.equal(seen[0].url, '/v1/responses');
  assert.equal(seen[0].headers.authorization, 'Bearer sk-1');
  const sent = JSON.parse(seen[0].body);
  assert.deepEqual(sent.input[0], { type: 'message', role: 'user', content: [{ type: 'input_text', text: '[codex_apps_open_page]\n{"page_id":null}' }] });
  assert.deepEqual(sent.input[1], USER);
  assert.equal(proxy.stats.rewritten, 1);
});

test('没有需要改写的记录时转发原始字节和原压缩头', async t => {
  const { seen, proxy, base } = await setup(t, sse);
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify({ model: 'm', input: [USER, { type: 'function_call_output', call_id: 'call_1', output: 'ok' }] })));
  await (await fetch(base + '/responses', { method: 'POST', headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' }, body: gz })).text();
  assert.equal(seen[0].headers['content-encoding'], 'gzip');
  assert.ok(seen[0].body.equals(gz));
  assert.equal(proxy.stats.rewritten, 0);
});

test('gzip 与 zstd 压缩的请求体先解压再改写，转发未压缩 JSON', async t => {
  const { seen, base } = await setup(t, sse);
  const raw = Buffer.from(JSON.stringify({ model: 'm', input: [ORPHAN, USER] }));
  for (const [enc, data] of [['gzip', zlib.gzipSync(raw)], ['zstd', zlib.zstdCompressSync(raw)]]) {
    await (await fetch(base + '/responses', { method: 'POST', headers: { 'content-type': 'application/json', 'content-encoding': enc }, body: data })).text();
  }
  assert.equal(seen.length, 2);
  for (const req of seen) {
    assert.equal(req.headers['content-encoding'], undefined);
    assert.equal(JSON.parse(req.body).input[0].type, 'message');
  }
});

test('SSE 分块透传：上游写出第一块时客户端就能读到', async t => {
  let release;
  const gate = new Promise(r => { release = r; });
  const { base } = await setup(t, async (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: first\n\n');
    await gate;
    res.end('data: second\n\n');
  });
  const r = await fetch(base + '/responses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: [USER] }) });
  const reader = r.body.getReader();
  assert.match(Buffer.from((await reader.read()).value).toString(), /first/);
  release();
  let rest = '';
  for (;;) { const { value, done } = await reader.read(); if (done) break; rest += Buffer.from(value).toString(); }
  assert.match(rest, /second/);
});

test('GET 带查询串透传；上游不可达 502；目标中转站不存在 503', async t => {
  const { seen, base, setTarget } = await setup(t, (_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"data":[]}'); });
  const models = await fetch(base + '/models?client_version=1');
  assert.equal(models.status, 200);
  assert.equal(seen[0].url, '/v1/models?client_version=1');
  const dead = http.createServer();
  const deadPort = await listen(dead);
  await new Promise(r => dead.close(r));
  setTarget(`http://127.0.0.1:${deadPort}/v1`);
  const bad = await fetch(base + '/responses', { method: 'POST', body: '{}' });
  assert.equal(bad.status, 502);
  assert.match((await bad.json()).error.message, /兼容代理连不上中转站/);
  setTarget(null);
  const missing = await fetch(base + '/responses', { method: 'POST', body: '{}' });
  assert.equal(missing.status, 503);
  assert.equal((await missing.json()).error.type, 'relay_missing');
});
```

- [ ] **Step 3: 运行确认失败**

Run: `node --test test/compat-proxy.test.js`
Expected: FAIL，`Cannot find module '../electron/lib/compat-proxy'`

- [ ] **Step 4: 实现**

```js
'use strict';
/** 兼容模式本机代理:只监听 127.0.0.1,原样转发到中转站,仅改写缺 call_id 的工具结果。 */
const http = require('http');
const zlib = require('zlib');
const { rewriteOrphanToolOutputs } = require('./compat-rewrite');

// accept-encoding 交给上游 fetch 自己协商:它会解压响应,原样转发会让上游回不支持的编码
const STRIP_REQUEST = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'keep-alive',
  'upgrade', 'te', 'trailer', 'expect', 'accept-encoding']);
// fetch 已解压响应正文,content-encoding/content-length 不再成立
const STRIP_RESPONSE = new Set(['connection', 'content-length', 'transfer-encoding', 'keep-alive', 'upgrade',
  'te', 'trailer', 'content-encoding']);
const REWRITE_PATH = /^\/responses(?:\/compact)?$/;

function decodeBody(buf, encoding) {
  switch (encoding) {
    case '': case 'identity': return buf;
    case 'gzip': case 'x-gzip': return zlib.gunzipSync(buf);
    case 'deflate': try { return zlib.inflateSync(buf); } catch { return zlib.inflateRawSync(buf); }
    case 'br': return zlib.brotliDecompressSync(buf);
    // Electron 33 自带 Node 20,zlib 不支持 zstd
    case 'zstd': return Buffer.from(require('fzstd').decompress(new Uint8Array(buf)));
    default: throw new Error('不支持的请求压缩格式 ' + encoding);
  }
}

function sendError(res, status, message, type) {
  if (res.headersSent) { res.destroy(); return; }
  const body = JSON.stringify({ error: { message, type } });
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

function createCompatProxy({ port, resolveTarget, fetchImpl, stats = { requests: 0, rewritten: 0, lastError: '' }, onRewrite }) {
  let server = null;

  async function handle(req, res) {
    stats.requests++;
    const target = resolveTarget();
    if (!target) return sendError(res, 503, 'RelaySwitcher 兼容代理找不到目标中转站，请在 ChatGPT 页重新切换', 'relay_missing');

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    let body = Buffer.concat(chunks);
    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (!STRIP_REQUEST.has(key) && !key.startsWith('proxy-')) headers[key] = value;
    }

    if (req.method === 'POST' && REWRITE_PATH.test(req.url.split('?')[0]) && body.length) {
      try {
        const encoding = String(req.headers['content-encoding'] || '').trim().toLowerCase();
        const result = rewriteOrphanToolOutputs(JSON.parse(decodeBody(body, encoding).toString('utf8')));
        if (result.count) {
          body = Buffer.from(JSON.stringify(result.body), 'utf8');
          delete headers['content-encoding'];
          stats.rewritten += result.count;
          if (onRewrite) onRewrite(result.count);
        }
      } catch (e) {
        stats.lastError = '请求体无法解析，已原样转发：' + e.message;
      }
    }

    const controller = new AbortController();
    res.on('close', () => { if (!res.writableFinished) controller.abort(); });
    let upstream;
    try {
      upstream = await fetchImpl(target.replace(/\/+$/, '') + req.url, {
        method: req.method, headers,
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
        signal: controller.signal
      });
    } catch (e) {
      if (controller.signal.aborted) return;
      stats.lastError = e.message;
      return sendError(res, 502, 'RelaySwitcher 兼容代理连不上中转站：' + e.message, 'relay_unreachable');
    }

    const outHeaders = {};
    upstream.headers.forEach((value, key) => { if (!STRIP_RESPONSE.has(key)) outHeaders[key] = value; });
    res.writeHead(upstream.status, outHeaders);
    res.flushHeaders();
    if (!upstream.body) return res.end();
    const reader = upstream.body.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    } catch (e) {
      if (!controller.signal.aborted) stats.lastError = e.message;
      res.destroy();
    }
  }

  return {
    stats,
    get port() { return server && server.address() ? server.address().port : port; },
    start() {
      return new Promise((resolve, reject) => {
        const s = http.createServer((req, res) => {
          handle(req, res).catch(e => {
            stats.lastError = e.message;
            sendError(res, 500, 'RelaySwitcher 兼容代理内部错误：' + e.message, 'proxy_error');
          });
        });
        s.once('error', reject);
        s.listen(port, '127.0.0.1', () => { s.removeListener('error', reject); server = s; resolve(); });
      });
    },
    stop() {
      return new Promise(resolve => {
        if (!server) return resolve();
        const s = server;
        server = null;
        s.close(() => resolve());
        s.closeAllConnections();
      });
    }
  };
}

module.exports = { createCompatProxy, decodeBody };
```

- [ ] **Step 5: 运行确认通过**

Run: `node --test test/compat-proxy.test.js`
Expected: `# pass 5`、`# fail 0`

- [ ] **Step 6: 提交**

```bash
git add electron/lib/compat-proxy.js test/compat-proxy.test.js package.json package-lock.json
git commit -m "feat(compat): 本机改写代理，支持 gzip/br/zstd 请求体与 SSE 透传"
```

---

### Task 3: 代理生命周期

**Files:**
- Create: `electron/lib/compat-manager.js`
- Test: `test/compat-manager.test.js`

- [ ] **Step 1: 写失败测试**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCompatManager, compatBaseUrl, compatPortFromBaseUrl, DEFAULT_COMPAT_PORT } = require('../electron/lib/compat-manager');

test('本机地址与端口互转', () => {
  assert.equal(DEFAULT_COMPAT_PORT, 18767);
  assert.equal(compatBaseUrl(18767), 'http://127.0.0.1:18767');
  assert.equal(compatPortFromBaseUrl('http://127.0.0.1:18767/'), 18767);
  assert.equal(compatPortFromBaseUrl('http://127.0.0.1:3000/v1'), null);
  assert.equal(compatPortFromBaseUrl('https://relay.example.com/v1'), null);
  assert.equal(compatPortFromBaseUrl(null), null);
});

test('按配置决定是否运行；换端口先起新再停旧；起新失败保留旧；不接管用户自己的本机网关', async () => {
  const events = [];
  const busy = new Set([19002]);
  const createProxy = ({ port }) => ({
    port,
    async start() {
      if (busy.has(port)) { const e = new Error('listen EADDRINUSE'); e.code = 'EADDRINUSE'; throw e; }
      events.push('start ' + port);
    },
    async stop() { events.push('stop ' + port); }
  });
  let settings = { compatMode: true, compatRelayId: 'r1' };
  const relays = { r1: { id: 'r1', baseUrl: 'https://relay.example.com/v1' } };
  const getRelay = id => { if (!relays[id]) throw new Error('中转站不存在'); return relays[id]; };
  const mgr = createCompatManager({ getSettings: () => settings, getRelay, createProxy });
  const local = port => ({ baseUrl: compatBaseUrl(port) });

  await mgr.sync(local(19001));
  assert.deepEqual(events, ['start 19001']);
  assert.deepEqual(mgr.info(local(19001)), { active: true, port: 19001, running: true, relayId: 'r1', requests: 0, rewritten: 0, error: '' });

  const failed = await mgr.ensure(19002);
  assert.equal(failed.ok, false);
  assert.match(failed.error, /19002 被占用/);
  assert.equal(mgr.isServing(), true);
  assert.deepEqual(events, ['start 19001']);

  assert.deepEqual(await mgr.ensure(19003), { ok: true, port: 19003 });
  assert.deepEqual(events, ['start 19001', 'start 19003', 'stop 19001']);
  assert.equal(mgr.info(local(19003)).error, '');

  await mgr.sync({ baseUrl: 'https://relay.example.com/v1' });
  assert.deepEqual(events.slice(-1), ['stop 19003']);
  assert.equal(mgr.isServing(), false);
  assert.equal(mgr.info({ baseUrl: 'https://relay.example.com/v1' }).active, false);

  settings = { compatMode: false, compatRelayId: 'r1' };
  await mgr.sync(local(19001));
  assert.equal(mgr.isServing(), false);

  settings = { compatMode: true, compatRelayId: 'gone' };
  assert.equal(mgr.info(local(19001)).active, false);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/compat-manager.test.js`
Expected: FAIL，`Cannot find module '../electron/lib/compat-manager'`

- [ ] **Step 3: 实现**

```js
'use strict';
/** 兼容代理生命周期:只看 Codex 配置是否指向本机代理地址,决定在哪个端口运行。 */
const { createCompatProxy } = require('./compat-proxy');

const DEFAULT_COMPAT_PORT = 18767;
const LOCAL_BASE = /^http:\/\/127\.0\.0\.1:(\d{1,5})\/?$/;
const compatBaseUrl = port => `http://127.0.0.1:${port}`;
const compatPortFromBaseUrl = url => {
  const m = LOCAL_BASE.exec(String(url || '').trim());
  return m ? Number(m[1]) : null;
};

function createCompatManager({ getSettings, getRelay, fetchImpl, onRewrite, createProxy = createCompatProxy }) {
  const stats = { requests: 0, rewritten: 0, lastError: '' };
  let proxy = null;
  let startError = '';

  const targetRelay = () => {
    const id = getSettings().compatRelayId;
    if (!id) return null;
    try { return getRelay(id) || null; } catch { return null; }
  };
  const resolveTarget = () => { const r = targetRelay(); return r ? r.baseUrl : null; };

  // 配置指向本机代理地址、开启了兼容模式、目标中转站仍存在,三者都满足才运行
  function desiredPort(status) {
    const port = compatPortFromBaseUrl(status && status.baseUrl);
    return port && getSettings().compatMode && targetRelay() ? port : null;
  }

  async function ensure(port) {
    if (proxy && proxy.port === port) return { ok: true, port };
    const next = createProxy({ port, resolveTarget, fetchImpl, stats, onRewrite });
    try {
      await next.start();
    } catch (e) {
      startError = e.code === 'EADDRINUSE' ? `兼容代理端口 ${port} 被占用，可在设置里改端口` : `兼容代理启动失败：${e.message}`;
      return { ok: false, error: startError };
    }
    const old = proxy;
    proxy = next;
    startError = '';
    if (old) await old.stop();
    return { ok: true, port: next.port };
  }

  async function stop() {
    const old = proxy;
    proxy = null;
    if (old) await old.stop();
  }

  async function sync(status) {
    const port = desiredPort(status);
    if (port) return ensure(port);
    await stop();
    return { ok: true, port: null };
  }

  function info(status) {
    const port = desiredPort(status);
    const relay = port ? targetRelay() : null;
    return {
      active: !!port, port, running: !!(port && proxy && proxy.port === port), relayId: relay ? relay.id : '',
      requests: stats.requests, rewritten: stats.rewritten, error: startError || stats.lastError
    };
  }

  return { ensure, stop, sync, info, isServing: () => !!proxy };
}

module.exports = { createCompatManager, compatBaseUrl, compatPortFromBaseUrl, DEFAULT_COMPAT_PORT };
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/compat-manager.test.js`
Expected: `# pass 2`、`# fail 0`

- [ ] **Step 5: 提交**

```bash
git add electron/lib/compat-manager.js test/compat-manager.test.js
git commit -m "feat(compat): 代理生命周期，换端口先起新再停旧"
```

---

### Task 4: 切换写入本机地址

**Files:**
- Modify: `electron/lib/codex.js`（`applySwitch` 内 3 处）
- Test: `test/compat-switch.test.js`

- [ ] **Step 1: 写失败测试**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const TOML = require('@iarna/toml');
const codex = require('../electron/lib/codex');

const switchIn = (home, over) => codex.applySwitch({
  home, account: { tokens: { id_token: 'a.b.c', access_token: 'at', refresh_token: 'rt', account_id: 'acc-1' } },
  relay: { name: 'Relay', baseUrl: 'https://relay.example.com/v1', apiKey: 'sk-relay' },
  model: 'gpt-6-astra', providerId: 'codex_local_access', catalogEnabled: false, ...over
});
const providerOf = home => TOML.parse(fs.readFileSync(path.join(home, 'config.toml'), 'utf8')).model_providers.codex_local_access;

test('兼容模式：provider 写本机代理地址，Key 仍是中转站 Key，写后复查按实际地址比对；关闭后写回中转地址', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-compat-'));
  try {
    const on = switchIn(home, { baseUrlOverride: 'http://127.0.0.1:18767' });
    assert.equal(on.ok, true, on.error);
    assert.equal(providerOf(home).base_url, 'http://127.0.0.1:18767');
    assert.equal(providerOf(home).experimental_bearer_token, 'sk-relay');
    assert.equal(on.log.find(l => l.name === '流量指向中转站').detail, '经本机兼容代理 http://127.0.0.1:18767 → https://relay.example.com/v1');
    const off = switchIn(home, {});
    assert.equal(off.ok, true, off.error);
    assert.equal(providerOf(home).base_url, 'https://relay.example.com/v1');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/compat-switch.test.js`
Expected: FAIL，`base_url` 实际为 `https://relay.example.com/v1`

- [ ] **Step 3: 实现**（`electron/lib/codex.js`）

在 `applySwitch` 的 `try {` 之前（`const authPath = ...` 之后）加：

```js
  const providerBaseUrl = opts.baseUrlOverride || opts.relay.baseUrl;
```

把

```js
    const r = patchProviderBlock(text, opts.providerId, {
      name: opts.relay.name, baseUrl: opts.relay.baseUrl, apiKey: opts.relay.apiKey
```

改为

```js
    const r = patchProviderBlock(text, opts.providerId, {
      name: opts.relay.name, baseUrl: providerBaseUrl, apiKey: opts.relay.apiKey
```

把

```js
    step('流量指向中转站', true, opts.relay.baseUrl);
```

改为

```js
    step('流量指向中转站', true, opts.baseUrlOverride
      ? `经本机兼容代理 ${opts.baseUrlOverride} → ${opts.relay.baseUrl}` : opts.relay.baseUrl);
```

把

```js
    if (cfgObj.model_provider !== opts.providerId || !prov || prov.base_url !== opts.relay.baseUrl) {
```

改为

```js
    if (cfgObj.model_provider !== opts.providerId || !prov || prov.base_url !== providerBaseUrl) {
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/compat-switch.test.js test/patchProviderBlock.test.js`
Expected: `# fail 0`

- [ ] **Step 5: 提交**

```bash
git add electron/lib/codex.js test/compat-switch.test.js
git commit -m "feat(compat): 切换支持写入本机代理地址"
```

---

### Task 5: 主进程接线、退出确认、smoke

**Files:**
- Modify: `electron/lib/store.js:15-26`
- Modify: `electron/main.js`
- Test: `test/compat-wiring.test.js`

- [ ] **Step 1: 写失败测试**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('主进程接线：切换带本机地址、切换/回滚/启动后同步代理、托盘退出先确认、设置默认值', () => {
  const main = read('electron/main.js');
  assert.match(main, /createCompatManager\(\{/);
  assert.match(main, /baseUrlOverride: opts\.compat \? compatBaseUrl\(compatPort\) : null/);
  assert.match(main, /compatMode: !!opts\.compat/);
  assert.ok((main.match(/compat\.sync\(codex\.getStatus\(codexHome\(\)\)\)/g) || []).length >= 3, '切换、回滚、启动三处同步');
  assert.match(main, /label: '退出', click: \(\) => requestQuit\(\)/);
  assert.match(main, /兼容模式正在使用/);
  const store = read('electron/lib/store.js');
  assert.match(store, /compatMode: false/);
  assert.match(store, /compatPort: 18767/);
  assert.match(store, /compatRelayId: ''/);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/compat-wiring.test.js`
Expected: FAIL

- [ ] **Step 3: store 默认值**（`electron/lib/store.js`）

把

```js
    closeToTray: true,
    openAtLogin: false
  }, customModels: []};
```

改为

```js
    closeToTray: true,
    openAtLogin: false,
    compatMode: false,
    compatPort: 18767,
    compatRelayId: ''
  }, customModels: []};
```

- [ ] **Step 4: main.js 引入与模块级状态**

第 2 行改为：

```js
const { app, BrowserWindow, ipcMain, net, dialog } = require('electron');
```

在 `const oc = require('./lib/opencode');` 之后加：

```js
const { createCompatManager, compatBaseUrl, DEFAULT_COMPAT_PORT } = require('./lib/compat-manager');
```

把

```js
let win = null;
let store = null;
```

改为

```js
let win = null;
let store = null;
let compat = null;

function notifyStateChanged() {
  if (win && !win.isDestroyed()) win.webContents.send('rs:state-changed');
}
// 兼容代理每改写一次都会触发,合并成每 1.5 秒最多刷新一次状态
let notifyTimer = null;
function notifyStateChangedSoon() {
  if (notifyTimer) return;
  notifyTimer = setTimeout(() => { notifyTimer = null; notifyStateChanged(); }, 1500);
  notifyTimer.unref?.();
}
```

删除 `app.whenReady` 里原来的局部定义（其后的调用改用模块级函数）：

```js
  const notifyStateChanged = () => {
    if (win && !win.isDestroyed()) win.webContents.send('rs:state-changed');
  };
```

- [ ] **Step 5: getState 带兼容状态**

把

```js
  const activeRelay = relays.find(r => r.baseUrl === status.baseUrl) || null;
```

改为

```js
  const compatInfo = compat ? compat.info(status) : { active: false };
  // 兼容模式下 base_url 是本机地址,按 compatRelayId 找回真实中转站
  const activeRelay = relays.find(r => r.baseUrl === status.baseUrl)
    || (compatInfo.relayId ? relays.find(r => r.id === compatInfo.relayId) : null) || null;
```

把

```js
    status: { ...status, activeRelay, activeAccount },
```

改为

```js
    status: { ...status, activeRelay, activeAccount, compat: compatInfo,
      relayBaseUrl: compatInfo.active && activeRelay ? activeRelay.baseUrl : status.baseUrl },
```

- [ ] **Step 6: doSwitch 接入兼容模式**

把 `doSwitch` 末尾

```js
  return codex.applySwitch({
    home: codexHome(),
    account, relay,
```

到函数结束改为：

```js
  const compatPort = Number(s.compatPort) || DEFAULT_COMPAT_PORT;
  if (opts.compat) {
    const ens = await compat.ensure(compatPort);
    if (!ens.ok) {
      sendStep('兼容代理', false, ens.error);
      return { ok: false, error: ens.error };
    }
    sendStep('兼容代理', true, `127.0.0.1:${compatPort} → ${relay.baseUrl}`);
  }

  const result = codex.applySwitch({
    home: codexHome(),
    account, relay,
    model,
    contextWindow: opts.contextWindow != null ? opts.contextWindow : s.contextWindow,
    providerId: s.providerId,
    catalogEnabled: s.catalogEnabled,
    catalogContent,
    catalogFileName: s.catalogFileName,
    pruneLocalProviders: !!s.pruneLocalProviders,
    baseUrlOverride: opts.compat ? compatBaseUrl(compatPort) : null,
    onStep: (name, ok, detail) => sendStep(name, ok, detail)
  });
  if (result.ok) store.saveSettings({ compatMode: !!opts.compat, compatRelayId: opts.compat ? relay.id : s.compatRelayId });
  await compat.sync(codex.getStatus(codexHome()));
  return result;
}
```

- [ ] **Step 7: 回滚后同步**

把

```js
  ipcMain.handle('rs:restoreBackup', (_e, id) => ({ restored: codex.restoreBackup(codexHome(), id) }));
```

改为

```js
  ipcMain.handle('rs:restoreBackup', async (_e, id) => {
    const restored = codex.restoreBackup(codexHome(), id);
    await compat.sync(codex.getStatus(codexHome()));
    return { restored };
  });
```

- [ ] **Step 8: 退出确认**

在 `function createTray(iconPath) {` 之前加：

```js
/** 兼容代理在运行时,退出会让 Codex 连不上中转站,先确认 */
function requestQuit() {
  if (compat && compat.isServing()) {
    const options = {
      type: 'warning', buttons: ['取消', '仍要退出'], defaultId: 0, cancelId: 0, title: 'RelaySwitcher',
      message: '兼容模式正在使用', detail: '退出后 Codex 将连不上中转站，直到再次打开 RelaySwitcher。'
    };
    const choice = win && !win.isDestroyed() ? dialog.showMessageBoxSync(win, options) : dialog.showMessageBoxSync(options);
    if (choice !== 1) return false;
  }
  app.quit();
  return true;
}
```

托盘菜单里把 `{ label: '退出', click: () => app.quit() }` 改为 `{ label: '退出', click: () => requestQuit() }`。

把

```js
  win.on('close', (e) => {
    if (!app.quitting && store.getSettings().closeToTray !== false) { e.preventDefault(); win.hide(); }
  });
```

改为

```js
  win.on('close', (e) => {
    if (app.quitting) return;
    if (store.getSettings().closeToTray !== false) { e.preventDefault(); win.hide(); return; }
    if (compat && compat.isServing()) { e.preventDefault(); requestQuit(); }
  });
```

- [ ] **Step 9: 创建管理器与启动同步**

在 `app.whenReady` 里 `store.load();` 之后加：

```js
  compat = createCompatManager({
    getSettings: () => store.getSettings(),
    getRelay: id => store.getRelay(id),
    fetchImpl: (url, init) => net.fetch(url, init),
    onRewrite: () => notifyStateChangedSoon()
  });
```

在 `// ---- 自动化(US-06):一切用户不该手点的都后台静默做 ----` 这一行之前加：

```js
  // 兼容模式:上次退出时 Codex 仍指向本机代理,启动即恢复监听
  compat.sync(codex.getStatus(codexHome())).catch(e => console.error('[compat] 启动同步失败:', e.message));
```

- [ ] **Step 10: smoke 场景 F**

在 `smoke()` 里 `fs.rmSync(home, { recursive: true, force: true });` 之前加：

```js
  // ---- 场景 F:兼容模式 —— 本机代理改写缺 call_id 的页面记录,经 Electron net.fetch 转发到本地假中转 ----
  const http = require('http');
  let relaySeen = null;
  const fakeRelay = http.createServer((req, res) => {
    const parts = [];
    req.on('data', c => parts.push(c));
    req.on('end', () => {
      relaySeen = { url: req.url, auth: req.headers.authorization, json: JSON.parse(Buffer.concat(parts).toString('utf8') || '{}') };
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end('data: {"type":"response.completed"}\n\n');
    });
  });
  await new Promise(r => fakeRelay.listen(0, '127.0.0.1', r));
  const smokeCompat = createCompatManager({
    getSettings: () => ({ compatMode: true, compatRelayId: 'smoke-relay' }),
    getRelay: () => ({ id: 'smoke-relay', baseUrl: `http://127.0.0.1:${fakeRelay.address().port}/v1` }),
    fetchImpl: (url, init) => net.fetch(url, init)
  });
  const ens = await smokeCompat.ensure(0);
  check('兼容代理启动', ens.ok && ens.port > 0);
  const rCompat = codex.applySwitch(switchOpts({ baseUrlOverride: compatBaseUrl(ens.port) }));
  const cfgCompat = TOML.parse(strip(fs.readFileSync(P('config.toml'), 'utf8')));
  check('兼容模式切换成功,base_url 指向本机代理', rCompat.ok && cfgCompat.model_providers['codex_local_access'].base_url === compatBaseUrl(ens.port));
  const viaProxy = await net.fetch(compatBaseUrl(ens.port) + '/responses', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer sk-smoke' },
    body: JSON.stringify({ model: 'gpt-6-astra', input: [
      { type: 'function_call_output', id: 'fco_1', name: 'codex_apps_open_page', namespace: 'agent', output: '{"page_id":null}' },
      { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] }] })
  });
  const sseText = await viaProxy.text();
  check('代理把响应流原样带回', viaProxy.status === 200 && sseText.includes('response.completed'));
  check('中转收到改写后的请求(缺 call_id 的记录变成 user 消息)', !!relaySeen && relaySeen.url === '/v1/responses'
    && relaySeen.json.input[0].type === 'message' && relaySeen.json.input[0].role === 'user');
  check('Authorization 原样转发', !!relaySeen && relaySeen.auth === 'Bearer sk-smoke');
  await smokeCompat.stop();
  fakeRelay.close();
```

- [ ] **Step 11: 运行确认通过**

Run: `node --test test/*.test.js`
Expected: `# fail 0`

Run: `npx vite build; .\node_modules\electron\dist\electron.exe . --smoke 2>&1 | Select-String 'SMOKE RESULT|✗'`
Expected: `SMOKE RESULT: 44 passed, 0 failed`（原 39 + 场景 F 5 条），没有 `✗` 行

- [ ] **Step 12: 提交**

```bash
git add electron/main.js electron/lib/store.js test/compat-wiring.test.js
git commit -m "feat(compat): 主进程接线、启动恢复代理、退出确认与 smoke 场景"
```

---

### Task 6: ChatGPT 页界面

**Files:**
- Modify: `src/pages/Dashboard.jsx`
- Modify: `src/styles.css`（CRLF，用 edit 工具）
- Test: `test/chatgpt-ui.test.js`

- [ ] **Step 1: 写失败测试**（追加到 `test/chatgpt-ui.test.js` 末尾）

```js
test('ChatGPT 页兼容模式：开关随切换提交、改动待生效提示、状态行显示代理运行情况', () => {
  const page = read('pages/Dashboard.jsx');
  assert.match(page, /<span className="cg-flabel">兼容模式<\/span>/);
  assert.match(page, /<Toggle on=\{compat\} onChange=\{setCompat\} disabled=\{switching\} \/>/);
  assert.match(page, /doSwitch\(\{ accountId, relayId, catalogChoice, contextWindow: Number\(ctx\) \|\| null, compat \}\)/);
  assert.match(page, /兼容模式改动需重新切换才生效/);
  assert.match(page, /关闭 · 直连中转/);
  assert.match(page, /已改写 \{cx\.rewritten\} 条/);
  assert.match(page, /status\.relayBaseUrl/);
  const css = read('styles.css');
  assert.match(css, /\.cg-compat\s*\{/);
  assert.match(css, /\.cg-go-hint\.pending\s*\{/);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/chatgpt-ui.test.js`
Expected: FAIL（新测试）

- [ ] **Step 3: Dashboard 实现**

import 行改为：

```js
import { Icon, Select, Spinner, Modal, Confirm, Toggle, fmtK, planLabel } from '../components/ui.jsx';
```

演示数据：把 `settings: { contextWindow: 372000 },` 改为 `settings: { contextWindow: 372000, compatMode: true },`；在 `DEMO_STATE.status.activeRelay = DEMO_STATE.relays[0];` 之后加：

```js
DEMO_STATE.status.compat = { active: true, port: 18767, running: true, relayId: 'r1', requests: 41, rewritten: 6, error: '' };
DEMO_STATE.status.relayBaseUrl = DEMO_STATE.relays[0].baseUrl;
```

状态：在 `const [ctx, setCtx] = useState(872000);` 之后加：

```js
  const [compat, setCompat] = useState(false);
```

把

```js
  useEffect(() => {
    setCtx(status.contextWindow || settings.contextWindow || 872000);
  }, []); // eslint-disable-line
```

改为

```js
  useEffect(() => {
    setCtx(status.contextWindow || settings.contextWindow || 872000);
    setCompat(status.compat ? !!status.compat.active : !!settings.compatMode);
  }, []); // eslint-disable-line
```

演示：在 `setDemoState(DEMO_STATE); setBackups(DEMO_BACKUPS); setAccountId('a1'); setRelayId('r1'); setCtx(372000);` 之后加一行：

```js
        setCompat(!h.includes('compatpending'));
```

提交切换：把 `const r = await window.rs.doSwitch({ accountId, relayId, catalogChoice, contextWindow: Number(ctx) || null });` 改为

```js
      const r = await window.rs.doSwitch({ accountId, relayId, catalogChoice, contextWindow: Number(ctx) || null, compat });
```

派生值：在 `const wired = !!(status.activeAccount && status.activeRelay);` 之后加：

```js
  const cx = status.compat || { active: false };
  const compatPending = wired && compat !== !!cx.active;
```

开关行：在上下文窗口的 `</label>` 与 `</div>`（关闭 `cg-ctx`）之后、关闭 `cg-form` 的 `</div>` 之前插入：

```jsx
              <span className="cg-flabel">兼容模式</span>
              <div className="cg-compat">
                <Toggle on={compat} onChange={setCompat} disabled={switching} />
                <b>修复桌面版 call_id 报错</b>
                <small>经本机代理把桌面版的页面记录改成普通消息再转给中转站。开启后 RelaySwitcher 需保持运行。</small>
              </div>
```

提示：把 `<p className="cg-go-hint">自动备份当前配置，完成后可回滚</p>` 改为

```jsx
            {compatPending
              ? <p className="cg-go-hint pending">兼容模式改动需重新切换才生效</p>
              : <p className="cg-go-hint">自动备份当前配置，完成后可回滚</p>}
```

状态：把中转站行的 `<span className="mono cg-muted cg-ellipsis" title={status.baseUrl}>{status.baseUrl || '—'}</span>` 改为

```jsx
                <span className="mono cg-muted cg-ellipsis" title={status.relayBaseUrl}>{status.relayBaseUrl || '—'}</span>
```

在中转站 `</StatusRow>` 之后、延迟行之前插入：

```jsx
            <StatusRow label="兼容模式">
              {cx.active
                ? <><span className={'cg-dot' + (cx.running ? ' ok' : ' bad')} /><span>{cx.running ? '运行中' : '未运行'}</span>
                  <span className="mono cg-muted">127.0.0.1:{cx.port}</span>
                  {cx.running ? <span className="cg-tag">已改写 {cx.rewritten} 条</span>
                    : cx.error ? <span className="cg-warn cg-ellipsis" title={cx.error}>{cx.error}</span> : null}</>
                : <span className="cg-muted">关闭 · 直连中转</span>}
            </StatusRow>
```

- [ ] **Step 4: 样式**（`src/styles.css`，在 `.cg-go-hint { ... }` 一行之后）

```css
.cg-go-hint.pending { color: var(--accent-strong); }
.cg-compat { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 4px 12px; min-height: 36px; }
.cg-compat b { font-size: 12.5px; font-weight: 500; color: var(--txt-1); }
.cg-compat small { grid-column: 2; color: var(--txt-3); font-size: 11.5px; line-height: 1.5; }
```

- [ ] **Step 5: 运行确认通过**

Run: `node --test test/*.test.js; node lint-imports.js; npx vite build`
Expected: `# fail 0`、`LINT_IMPORTS: ALL_CLEAN`、`built in`

- [ ] **Step 6: 提交**

```bash
git add src/pages/Dashboard.jsx src/styles.css test/chatgpt-ui.test.js
git commit -m "feat(compat): ChatGPT 页兼容模式开关与状态行"
```

---

### Task 7: 设置页端口

**Files:**
- Modify: `src/pages/Settings.jsx`
- Test: `test/chatgpt-ui.test.js`

- [ ] **Step 1: 写失败测试**（追加）

```js
test('设置 · ChatGPT：兼容代理端口可改，保存前校验范围', () => {
  const s = read('pages/Settings.jsx');
  assert.match(s, /兼容代理端口/);
  assert.match(s, /改端口后需重新切换才生效/);
  assert.match(s, /compatPort: port/);
  assert.match(s, /port < 1024 \|\| port > 65535/);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/chatgpt-ui.test.js`
Expected: FAIL

- [ ] **Step 3: 实现**

在「Provider 标识」卡片（`<input type="text" value={form.providerId} ... />` 所在的 `</div>`）之后、`</>}` 之前插入：

```jsx
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="klabel"><Icon name="relay" size={12} /> 兼容代理端口 <small>兼容模式下 Codex 连接 127.0.0.1 的这个端口</small></div>
        <input type="text" inputMode="numeric" className="mono" value={form.compatPort ?? ''}
               onChange={e => setForm({ ...form, compatPort: e.target.value.replace(/[^\d]/g, '') })} />
        <div className="muted" style={{ marginTop: 7 }}>改端口后需重新切换才生效</div>
      </div>
```

`save` 改为在 `setSaving(true);` 之前校验，并随设置一起保存：

```js
  const save = async () => {
    const port = Number(form.compatPort) || 18767;
    if (port < 1024 || port > 65535) { toast('兼容代理端口需在 1024–65535 之间', 'bad'); return; }
    setSaving(true);
```

并在 `contextWindow: Number(form.contextWindow) || 872000` 后加 `, compatPort: port`：

```js
        contextWindow: Number(form.contextWindow) || 872000, compatPort: port
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/*.test.js; node lint-imports.js; npx vite build`
Expected: `# fail 0`、`LINT_IMPORTS: ALL_CLEAN`、`built in`

- [ ] **Step 5: 提交**

```bash
git add src/pages/Settings.jsx test/chatgpt-ui.test.js
git commit -m "feat(compat): 设置页兼容代理端口"
```

---

### Task 8: 真实环境验证（不提交代码）

- [ ] **Step 1: 确认真实 Codex 的请求体编码**

用隔离 `CODEX_HOME`（假 ChatGPT 风格 auth.json，JWT `exp` 设到 2100 年，避免 Codex 刷新；不复制真实 token），`base_url` 指向本机抓包服务（只记录方法、路径、`content-encoding`、正文前 8 字节，回 400 结束）。运行 `codex.exe exec --skip-git-repo-check "Reply OK"`，记录 `/responses` 的 `content-encoding`。完成后删除临时目录。
Expected: 得到 `identity`/`zstd`/`gzip` 中的一种，且属于代理已支持的编码。

- [ ] **Step 2: 真实中转对照**

脚本在 Node 里用 `createCompatProxy({ port: 0, resolveTarget: () => <config 里的 base_url>, fetchImpl: fetch })`，用 `C:\Windows\Temp\opencode\probe-orphan.cjs` 同样的请求体（两条页面记录 + user 消息），分别直连和经代理各发一次。
Expected: 直连 400（call_id 报错），经代理 200 且收到 `response.created`。

- [ ] **Step 3: 隔离截图**

按项目惯例（独立 USERPROFILE/APPDATA、`--user-data-dir`、`RS_CAPTURE_DIR`、`RS_CAPTURE_PAGES`）截：`dash-demo-filled`、`dash-demo-filled-compatpending`、`settings-chatgpt`、`settings-chatgpt-bottom`。逐张查看：开关行不挤压、状态行一行显示完、待生效提示为金色、端口卡片可见。

---

### Task 9: 发布 v1.18.0

- [ ] **Step 1:** 用 edit 工具把 `package.json` 和 `package-lock.json`（两处，`replaceAll`）的版本改为 `1.18.0`，`node --test test/package-integrity.test.js` 通过。
- [ ] **Step 2:** `CHANGELOG.md` 顶部加 v1.18.0 段：问题现象、开关位置、原理、需 RS 常驻、端口设置、实测结果。
- [ ] **Step 3:** 只提交相关文件：`git add CHANGELOG.md package.json package-lock.json` 后 `git commit -m "release: v1.18.0 兼容模式"`。
- [ ] **Step 4:** `npm.cmd run dist *> C:\Windows\Temp\opencode\rs-v1180-build.log`（后台），完成后以 `-Encoding Unicode` 读日志，确认 `# fail 0`、`SMOKE RESULT: 44 passed, 0 failed`、`RELEASE_VERIFIED`。
- [ ] **Step 5:** 复制 `C:\Windows\Temp\opencode\release-v1173.ps1` 为 `release-v1180.ps1`，版本改 `1.18.0`、英文标题改 `compat mode`、说明文件改 `rs-v1180-release-notes.md`；执行后确认三项资产哈希一致，再 `gh release edit v1.18.0 --title 'v1.18.0 兼容模式'`，用 `gh api repos/shenglaiyaoyan/relayswitcher/releases/tags/v1.18.0 --jq .name` 确认。
