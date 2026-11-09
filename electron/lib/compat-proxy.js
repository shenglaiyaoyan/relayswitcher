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
