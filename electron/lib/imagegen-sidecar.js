'use strict';
/**
 * imagegen-sidecar.js — 图像生成 sidecar(US-07)
 * 透明代理:拦截 /v1/responses 请求,往 tools 数组注入 image_generation 工具定义,
 * 其余路径原样转发;响应流(SSE)原样 pipe 回客户端。
 *
 * 机制依据:docs/2026-09-09-image-generation-support.md
 * - codex 客户端消费但不构造 image_generation 工具(二进制 0 次出现)
 * - 中转站对 responses 的工具透传实测 200 可画图
 * - 唯一缺位 = 请求层注入者(本模块)
 */
const http = require('http');

const IMAGE_GEN_TOOL = { type: 'image_generation' };
/** spark 系模型是轻量快速型,不支持画图,跳过注入(参照 CockpitTools should_inject) */
const SPARK_RE = /-spark$/i;

/**
 * 纯函数:给定请求体,返回注入后的请求体(或原样返回)。
 * 导出供单测使用。
 */
function injectImageGenTool(bodyObj) {
  if (!bodyObj || typeof bodyObj !== 'object') return bodyObj;
  const model = String(bodyObj.model || '');
  if (SPARK_RE.test(model)) return bodyObj; // spark 系跳过
  const tools = Array.isArray(bodyObj.tools) ? bodyObj.tools : [];
  if (tools.some(t => t && t.type === 'image_generation')) return bodyObj; // 已有,不重复
  return { ...bodyObj, tools: [...tools, IMAGE_GEN_TOOL] };
}

/**
 * 判断是否需要处理该请求(POST + /responses 路径)
 */
function isResponsesRequest(method, pathname) {
  return method === 'POST' && /\/responses\/?$/.test(pathname);
}

/**
 * 启动 sidecar。
 * @param {object} opts { port, targetBaseUrl, onLog(name, ok, detail) }
 * @returns {Promise<http.Server>} 已监听的 server 实例
 */
function startSidecar(opts) {
  const { port, targetBaseUrl } = opts;
  const target = new URL(targetBaseUrl.replace(/\/+$/, '') + '/');

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const bodyBuf = Buffer.concat(chunks);
      let outBuf = bodyBuf;

      // 只对 responses POST 做 tools 注入,其余原样
      if (isResponsesRequest(req.method, req.url)) {
        try {
          const parsed = JSON.parse(bodyBuf.toString('utf8'));
          const injected = injectImageGenTool(parsed);
          if (injected !== parsed) {
            outBuf = Buffer.from(JSON.stringify(injected));
            opts.onLog && opts.onLog('工具注入', true, `${parsed.model} → tools+image_generation`);
          }
        } catch { /* body 不是 JSON,原样转发 */ }
      }

      // 构造转发请求(原样透传 headers + 方法 + 改写后的 body)
      const fwdPath = target.pathname.replace(/\/+$/, '') + req.url.replace(/^\//, '');
      const fwdOpts = {
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        path: fwdPath,
        method: req.method,
        headers: { ...req.headers, host: target.host }
      };
      delete fwdOpts.headers['connection'];
      delete fwdOpts.headers['transfer-encoding']; // 我们已知完整 body,用 content-length

      const lib = target.protocol === 'https:' ? require('https') : http;
      const fwd = lib.request(fwdOpts, (upstream) => {
        // 响应原样透传(SSE 流 pipe,不缓冲)
        res.writeHead(upstream.statusCode, upstream.headers);
        upstream.pipe(res);
      });
      fwd.on('error', (e) => {
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
        }
        res.end(JSON.stringify({ error: { message: 'sidecar upstream error: ' + e.message } }));
      });
      if (outBuf.length > 0) {
        fwd.setHeader('Content-Length', outBuf.length);
        fwd.write(outBuf);
      }
      fwd.end();
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject); // EADDRINUSE 等
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve(server);
    });
  });
}

function stopSidecar(server) {
  return new Promise((resolve) => {
    if (!server || !server.listening) return resolve();
    server.close(() => resolve());
    // 强制断开保持的连接(SSE 长连接可能挂着)
    server.closeAllConnections && server.closeAllConnections();
    setTimeout(resolve, 500); // 兜底
  });
}

module.exports = { injectImageGenTool, isResponsesRequest, startSidecar, stopSidecar, IMAGE_GEN_TOOL };
