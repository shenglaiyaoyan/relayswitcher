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
