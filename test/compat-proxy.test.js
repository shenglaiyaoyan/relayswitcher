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

test('去掉 Electron net.fetch 会拒绝的浏览器头（sec-fetch-*、origin、cookie2），Codex 自己的头原样保留', async t => {
  const upstream = http.createServer((req, res) => { req.resume(); req.on('end', () => sse(req, res)); });
  const upPort = await listen(upstream);
  let forwarded = null;
  const recordingFetch = (url, init) => { forwarded = init.headers; return fetch(url, init); };
  const proxy = createCompatProxy({ port: 0, resolveTarget: () => `http://127.0.0.1:${upPort}/v1`, fetchImpl: recordingFetch });
  await proxy.start();
  t.after(async () => { await proxy.stop(); upstream.closeAllConnections(); upstream.close(); });
  await (await fetch(`http://127.0.0.1:${proxy.port}/responses`, { method: 'POST', body: JSON.stringify({ input: [USER] }), headers: {
    'content-type': 'application/json', origin: 'http://localhost', cookie2: 'a', 'sec-fetch-dest': 'empty',
    'session-id': 's1', 'x-codex-turn-metadata': '{"turn":1}', originator: 'Codex Desktop' } })).text();
  for (const k of ['sec-fetch-mode', 'sec-fetch-dest', 'origin', 'cookie2']) assert.equal(forwarded[k], undefined, k);
  assert.equal(forwarded['session-id'], 's1');
  assert.equal(forwarded['x-codex-turn-metadata'], '{"turn":1}');
  assert.equal(forwarded.originator, 'Codex Desktop');
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
