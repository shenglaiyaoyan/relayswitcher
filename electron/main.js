'use strict';
const { app, BrowserWindow, ipcMain, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { createStore } = require('./lib/store');
const codex = require('./lib/codex');
const { extractTokenError } = require('./lib/oauth-errors');
const { findRivalProcesses } = require('./lib/rival-guard');
const { diffCatalogSlugs } = require('./lib/catalog-diff');
const { extractToFile, locateCodexBinary } = require('./lib/catalog-extract');
const { mergeCustomModels } = require('./lib/catalog-merge');
const { buildRelayCatalog } = require('./lib/relay-catalog');

const isDev = !!process.env.VITE_DEV;
const SMOKE = process.argv.includes('--smoke');

let win = null;
let store = null;

function resourcesDir() {
  // 打包后: process.resourcesPath/resources;开发: <project>/resources
  return app.isPackaged
    ? path.join(process.resourcesPath, 'resources')
    : path.join(app.getAppPath(), 'resources');
}

function codexHome() {
  const s = store.getSettings();
  return s.codexHome && s.codexHome.trim() ? s.codexHome : codex.defaultCodexHome();
}

function getState() {
  const status = codex.getStatus(codexHome());
  const relays = store.listRelays();
  // 状态里附带匹配:当前 base_url 对应哪个中转站、account_id 对应哪个账号
  const activeRelay = relays.find(r => r.baseUrl === status.baseUrl) || null;
  const accounts = store.listAccounts();
  const activeAccount = accounts.find(a => a.accountId && a.accountId === status.accountId) || null;
  // token 剩余寿命(从 auth.json 的 JWT exp 解出)
  try {
    const authText = codex.readText(require('path').join(codexHome(), 'auth.json'));
    if (authText) {
      const auth = JSON.parse(authText);
      const expOf = (jwt) => {
        try {
          const p = String(jwt || '').split('.')[1];
          if (!p) return null;
          const claims = JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
          return claims.exp ? claims.exp * 1000 : null;
        } catch { return null; }
      };
      status.tokenLife = {
        idTokenMs: expOf(auth.tokens && auth.tokens.id_token) ,
        accessTokenMs: expOf(auth.tokens && auth.tokens.access_token)
      };
    }
  } catch { /* 解不出就不显示 */ }
  return {
    accounts, relays,
    settings: store.getSettings(),
    status: { ...status, activeRelay, activeAccount },
    catalogBundled: fs.existsSync(path.join(resourcesDir(), 'model-catalog.json')),
    catalogCounts: { official: catalogOfficialCount() }
  };
}

/* ---------------- 中转站连通性测试 ---------------- */
async function testRelay(id) {
  const relay = store.getRelay(id);
  const url = relay.baseUrl.replace(/\/+$/, '') + '/models';
  const t0 = Date.now();
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (relay.apiKey) headers['Authorization'] = 'Bearer ' + relay.apiKey;
    const resp = await net.fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    const ms = Date.now() - t0;
    if (!resp.ok) {
      const result = { ok: false, ms, error: 'HTTP ' + resp.status, at: new Date().toISOString() };
      store.setRelayTest(id, result);
      return result;
    }
    const j = await resp.json();
    const models = (j.data || []).map(m => m.id).filter(Boolean).sort();
    const result = { ok: true, ms, count: models.length, models: models.slice(0, 200), at: new Date().toISOString() };
    store.setRelayTest(id, result);
    return result;
  } catch (e) {
    const result = { ok: false, ms: Date.now() - t0, error: e.message, at: new Date().toISOString() };
    store.setRelayTest(id, result);
    return result;
  }
}

/* ---------------- 一键切换 ---------------- */
/** 官方目录源解析:内置快照 或 最新提取产物 */
function resolveOfficialCatalog() {
  const s = store.getSettings();
  let srcPath = path.join(resourcesDir(), 'model-catalog.json');
  if (s.catalogMode === 'extracted') {
    const dir = path.join(app.getPath('userData'), 'catalogs');
    let best = null;
    try {
      for (const f of fs.readdirSync(dir)) {
        if (/^extracted-[\w-]+\.json$/.test(f)) {
          const p = path.join(dir, f);
          const mt = fs.statSync(p).mtimeMs;
          if (!best || mt > best.mt) best = { p, mt };
        }
      }
    } catch { /* 目录不存在,回落内置 */ }
    if (best) srcPath = best.p; // 无提取产物时静默回落内置快照
  }
  return JSON.parse(fs.readFileSync(srcPath, 'utf8'));
}

/**
 * 目录源解析(v1.8.0:切换即切目录):
 *   official = 内置快照/最新本机提取 + 自定义模型合并
 *   relay    = 中转站实时模型清单自动生成目录(名字家族匹配官方模板) + 自定义模型合并
 */
function resolveCatalogContent(choice, relayModels) {
  const official = resolveOfficialCatalog();
  if (choice === 'relay') {
    return Buffer.from(JSON.stringify(mergeCustomModels(buildRelayCatalog(official, relayModels), store.listCustomModels())));
  }
  return Buffer.from(JSON.stringify(mergeCustomModels(official, store.listCustomModels())));
}

function catalogOfficialCount() {
  try { return resolveOfficialCatalog().models.length; } catch { return 0; }
}

/** 拉取中转站 /v1/models 模型清单(中转目录的原料)。失败抛真实原因,由调用方呈现 */
async function fetchRelayModels(relay, timeoutMs = 15000) {
  const t0 = Date.now();
  const headers = {};
  if (relay.apiKey) headers['Authorization'] = 'Bearer ' + relay.apiKey;
  const resp = await net.fetch(relay.baseUrl.replace(/\/+$/, '') + '/models', { headers, signal: AbortSignal.timeout(timeoutMs) });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const j = await resp.json();
  return { ids: (j.data || []).map(m => m.id).filter(Boolean), ms: Date.now() - t0 };
}

/** 中转站预检(US-04):轻量 /v1/models 探测,失败不阻塞切换 */
async function probeRelay(relay) {
  const t0 = Date.now();
  try {
    const headers = {};
    if (relay.apiKey) headers['Authorization'] = 'Bearer ' + relay.apiKey;
    const resp = await net.fetch(relay.baseUrl.replace(/\/+$/, '') + '/models',
      { headers, signal: AbortSignal.timeout(3000) });
    return { ok: resp.ok, ms: Date.now() - t0, status: resp.status };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: e.message };
  }
}

async function doSwitch(opts, event) {
  const s = store.getSettings();
  let account = store.getAccount(opts.accountId);
  const relay = store.getRelay(opts.relayId);
  const sendStep = (name, ok, detail) => {
    if (win && !win.isDestroyed()) win.webContents.send('rs:switch-step', { name, ok, detail });
  };

  // /models 只发一枪:选「中转目录」时预检结论从这次拉取派生 —— 同一瞬间双发经系统代理
  // (Clash)实测只有一路能活、另一路必挂(2026-09-22 直连/代理×单发/并发矩阵实证),
  // 旧实现 probe 抢活路、fetch 必死,目录永远回落官方
  const wantRelayCatalog = opts.catalogChoice === 'relay';
  let relayFetch = null;    // 成功产物 { ids, ms }
  let relayFetchErr = null; // 失败真实原因
  const modelsTask = wantRelayCatalog
    ? fetchRelayModels(relay).then(r => { relayFetch = r; }, e => { relayFetchErr = e; })
    : null;

  const [rivals, refreshed] = await Promise.all([
    detectRivalTools(),
    account.tokens.refresh_token
      ? refreshAccount(opts.accountId).catch(() => null)
      : Promise.resolve(null),
    modelsTask || Promise.resolve()
  ]);

  // 拉取挂了自动串行补一枪(无竞争);官方目录模式才独立轻探
  let probe;
  if (wantRelayCatalog) {
    if (relayFetchErr) {
      await fetchRelayModels(relay, 10000).then(r => { relayFetch = r; relayFetchErr = null; }, () => {});
    }
    probe = relayFetch
      ? { ok: true, ms: relayFetch.ms, status: 200 }
      : { ok: false, error: relayFetchErr ? relayFetchErr.message : '未知原因' };
  } else {
    probe = await probeRelay(relay);
  }
  if (rivals.running) {
    sendStep('竞品工具检测', false,
      `检测到 ${rivals.tools.map(t => t.name).join(' / ')} 正在运行 — 此类工具会在运行时回写 Codex 配置,可能覆盖切换结果,建议先退出(已继续切换,可回滚)`);
  } else {
    sendStep('竞品工具检测', true, '未发现 CockpitTools / cc-switch / CLIProxyAPI');
  }
  if (probe.ok) {
    sendStep('中转站预检', true, `连通正常(${probe.ms}ms,HTTP ${probe.status})`);
  } else {
    sendStep('中转站预检', false, (probe.error || 'HTTP ' + probe.status) + ' — 流量将无法到达,请检查中转站状态(已继续切换,可回滚)');
  }
  if (refreshed) {
    if (refreshed.ok) {
      sendStep('token 预刷新', true, `已换新:access_token 约 ${refreshed.expiresInDays} 天,id_token 重获 1 小时新鲜期`);
      account = store.getAccount(opts.accountId); // 取刷新后的新 tokens
    } else {
      sendStep('token 预刷新', false, (refreshed.error || '未知原因') + ' — 继续使用现有 token(若 id_token 已超 1 小时,Codex 可能要求重新登录)');
    }
  }

  // 目录生成(v1.8.0:切换即切目录)— 官方实时 / 中转清单自动生成
  let catalogChoice = wantRelayCatalog ? 'relay' : 'official';
  const relayModels = relayFetch ? relayFetch.ids : null;
  if (catalogChoice === 'relay' && (!relayModels || relayModels.length === 0)) {
    const why = relayFetchErr ? relayFetchErr.message : (relayModels ? '返回清单为空' : '未知原因');
    sendStep('目录生成', false, `中转站模型清单拉取失败(${why})— 回落官方目录(切换继续,可回滚)`);
    catalogChoice = 'official';
  }
  let catalogContent;
  try {
    catalogContent = resolveCatalogContent(catalogChoice, relayModels);
  } catch (e) {
    sendStep('目录生成', false, e.message);
    return { ok: false, error: '目录生成失败: ' + e.message };
  }
  if (catalogChoice === 'relay') sendStep('目录生成', true, `中转目录:${relayModels.length} 个模型(名字家族匹配官方模板,继承档位/Fast)`);
  else sendStep('目录生成', true, '官方目录(内置快照 / 最新本机提取)');

  // 目录决定 model 落点:当前模型在新目录里存在则保留(不动 Codex 客户端里的选择),
  // 不存在才落到新目录第一个条目
  const catObj = JSON.parse(catalogContent.toString('utf8'));
  const slugs = new Set(catObj.models.map(m => m.slug));
  const cur = codex.getStatus(codexHome());
  const model = cur.model && slugs.has(cur.model) ? cur.model : catObj.models[0].slug;

  return codex.applySwitch({
    home: codexHome(),
    account, relay,
    model,
    contextWindow: opts.contextWindow != null ? opts.contextWindow : s.contextWindow,
    fastMode: s.fastMode,
    providerId: s.providerId,
    catalogEnabled: s.catalogEnabled,
    catalogContent,
    catalogFileName: s.catalogFileName,
    pruneLocalProviders: !!s.pruneLocalProviders,
    onStep: (name, ok, detail) => sendStep(name, ok, detail)
  });
}

/* ---------------- 自动更新 (纯 API 检测,无 npm 依赖,仅手动触发) ---------------- */
const autoUpdate = require('./lib/auto-update');

async function checkForUpdates() {
  const result = await autoUpdate.checkUpdate(app.getVersion());
  if (win && !win.isDestroyed()) {
    win.webContents.send('rs:update-event', result.found
      ? { ev: 'available', info: { version: result.version, url: result.url } }
      : { ev: 'uptodate', info: { version: result.version, message: result.message || result.error } });
  }
  return result;
}

/* ---------------- 账号 token 刷新(OAuth2 refresh grant,走系统代理) ---------------- */
async function refreshAccount(id) {
  const acct = store.getAccount(id);
  const t = acct.tokens;
  if (!t.refresh_token) return { ok: false, error: '该账号没有 refresh_token,无法刷新(渠道只发了 access_token 的话,到期即失效)' };
  // client_id 从 id_token 的 aud 取(与 Codex 客户端一致)
  let clientId = 'app_EMoamEEZ73f0CkXaXp7hrann';
  try {
    const p = String(t.id_token || '').split('.')[1];
    if (p) {
      const claims = JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
      if (Array.isArray(claims.aud) && claims.aud[0]) clientId = claims.aud[0];
      else if (typeof claims.aud === 'string') clientId = claims.aud;
    }
  } catch { /* 解不出来就用默认 */ }
  let resp, text, j = {};
  try {
    resp = await net.fetch('https://auth.openai.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, grant_type: 'refresh_token', refresh_token: t.refresh_token }),
      signal: AbortSignal.timeout(20000)
    });
    text = await resp.text();
    try { j = JSON.parse(text); } catch { /* 保留空 */ }
  } catch (e) {
    return { ok: false, error: '网络错误: ' + e.message + ' — 刷新需要能访问 auth.openai.com(挂代理即可,应用走系统代理)' };
  }
  if (!resp.ok) {
    return { ok: false, error: extractTokenError(j, resp.status) };
  }
  const newTokens = {
    id_token: j.id_token || t.id_token,
    access_token: j.access_token || t.access_token,
    refresh_token: j.refresh_token || t.refresh_token, // 轮换后必须存新的
    account_id: t.account_id
  };
  const account = store.updateTokens(id, newTokens, { earliestRefreshAt: j.earliest_refresh_at || null });
  return { ok: true, expiresInDays: Math.round(((j.expires_in || 0) / 86400) * 10) / 10, account,
    rotated: !!j.refresh_token && j.refresh_token !== t.refresh_token };
}

/* Codex 客户端进程检测 */
async function detectCodexRunning() {
  return new Promise((resolve) => {
    const { execFile } = require('child_process');
    execFile('tasklist', ['/FI', 'IMAGENAME eq codex.exe', '/FO', 'CSV', '/NH'], { windowsHide: true }, (err, stdout) => {
      if (err) return resolve({ running: false, pids: [] });
      const pids = [];
      for (const line of String(stdout).split('\n')) {
        const m = line.match(/^"codex\.exe","(\d+)"/i);
        if (m) pids.push(m[1]);
      }
      resolve({ running: pids.length > 0, pids });
    });
  });
}

/* 竞品工具检测(FEAT-002): CockpitTools / cc-switch / CLIProxyAPI 会回写 Codex 配置 */
async function detectRivalTools() {
  return new Promise((resolve) => {
    const { execFile } = require('child_process');
    execFile('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true }, (err, stdout) => {
      if (err) return resolve({ running: false, tools: [] });
      const tools = findRivalProcesses(stdout);
      resolve({ running: tools.length > 0, tools });
    });
  });
}

/* 一键止停 Codex(US-07): 强杀进程树后复查,以复查结果为准 */
async function stopCodexRunning() {
  const { execFile } = require('child_process');
  await new Promise((res) => execFile('taskkill', ['/IM', 'codex.exe', '/F', '/T'], { windowsHide: true }, () => res()));
  const d = await detectCodexRunning();
  return { ok: !d.running, running: d.running };
}

/* ---------------- IPC ---------------- */
function registerIpc() {
  ipcMain.on('rs:win', (_e, cmd) => {
    if (!win || win.isDestroyed()) return;
    if (cmd === 'minimize') win.minimize();
    else if (cmd === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
    else if (cmd === 'close') win.close();
  });
  ipcMain.handle('rs:getState', () => getState());
  ipcMain.handle('rs:importAccount', (_e, json, label) => store.addAccount(json, label));
  ipcMain.handle('rs:deleteAccount', (_e, id) => { store.deleteAccount(id); return getState(); });
  ipcMain.handle('rs:refreshAccount', (_e, id) => refreshAccount(id));
  ipcMain.handle('rs:saveRelay', (_e, relay) => { store.saveRelay(relay); return getState(); });
  ipcMain.handle('rs:deleteRelay', (_e, id) => { store.deleteRelay(id); return getState(); });
  ipcMain.handle('rs:testRelay', (_e, id) => testRelay(id));
  ipcMain.handle('rs:switch', (_e, opts) => doSwitch(opts));
  // Codex 检测 + 一键止停(US-07) + 竞品工具检测(FEAT-002)
  ipcMain.handle('rs:detectCodex', () => detectCodexRunning());
  ipcMain.handle('rs:stopCodex', () => stopCodexRunning());
  ipcMain.handle('rs:detectRivals', () => detectRivalTools());
  // 自动更新(检测走 GitHub API;下载安装走 electron-updater,失败降级浏览器下载)
  ipcMain.handle('rs:checkUpdate', () => checkForUpdates());
  ipcMain.handle('rs:installUpdate', () => autoUpdate.downloadAndInstallUpdate());
  ipcMain.handle('rs:getVersion', () => app.getVersion());
  // ---- 目录管理(US-01/02)与批量导入(US-03) ----
  ipcMain.handle('rs:extractCatalog', async () => {
    try {
      const r = extractToFile(path.join(app.getPath('userData'), 'catalogs'));
      store.saveSettings({ catalogMode: 'extracted' });
      return { ok: true, report: r.report, binPath: r.binPath, outPath: r.outPath };
    } catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('rs:getCatalogInfo', () => {
    const s = store.getSettings();
    const info = { mode: s.catalogMode, customModels: store.listCustomModels(), builtinCount: 0, extracted: null };
    try { info.builtinCount = JSON.parse(fs.readFileSync(path.join(resourcesDir(), 'model-catalog.json'), 'utf8')).models.length; } catch { /* */ }
    const dir = path.join(app.getPath('userData'), 'catalogs');
    let best = null;
    try {
      for (const f of fs.readdirSync(dir)) {
        if (/^extracted-[\w-]+\.json$/.test(f)) {
          const p = path.join(dir, f);
          const mt = fs.statSync(p).mtimeMs;
          if (!best || mt > best.mt) best = { p, mt };
        }
      }
    } catch { /* */ }
    if (best) {
      try {
        const c = JSON.parse(fs.readFileSync(best.p, 'utf8'));
        info.extracted = { file: path.basename(best.p), modelCount: c.models.length, time: new Date(best.mtime).toISOString() };
        try {
          const builtinSlugs = JSON.parse(fs.readFileSync(path.join(resourcesDir(), 'model-catalog.json'), 'utf8')).models.map(m => m.slug);
          info.catalogDiff = diffCatalogSlugs(builtinSlugs, c.models.map(m => m.slug));
        } catch { /* 对比失败不展示 */ }
      } catch { info.extracted = { file: path.basename(best.p), error: '解析失败' }; }
    }
    try {
      const src = best && s.catalogMode === 'extracted' ? best.p : path.join(resourcesDir(), 'model-catalog.json');
      const c = JSON.parse(fs.readFileSync(src, 'utf8'));
      info.modelSlugs = c.models.map(m => m.slug);
    } catch { info.modelSlugs = []; }
    return info;
  });
  ipcMain.handle('rs:setCatalogMode', (_e, mode) => {
    if (mode !== 'builtin' && mode !== 'extracted') throw new Error('mode 必须是 builtin/extracted');
    return store.saveSettings({ catalogMode: mode });
  });
  ipcMain.handle('rs:saveCustomModel', (_e, cm) => { store.saveCustomModel(cm); return store.listCustomModels(); });
  ipcMain.handle('rs:deleteCustomModel', (_e, id) => { store.deleteCustomModel(id); return store.listCustomModels(); });
  ipcMain.handle('rs:importAccountsBatch', (_e, texts) => store.importAccountsBatch(texts));
  // ---- 从本机 Codex 一键导入(US-06 冷启动:库里空,但 ~/.codex 已配好) ----
  ipcMain.handle('rs:importRelaysFromCodex', () => {
    const text = codex.readText(path.join(codexHome(), 'config.toml'));
    const r = codex.extractRelayCandidates(text);
    if (!r.ok) return r;
    const existing = new Set(store.listRelays().map(x => x.baseUrl));
    let imported = 0;
    const names = [];
    for (const c of r.relays) {
      if (existing.has(c.baseUrl)) continue;
      store.saveRelay({ name: c.name, baseUrl: c.baseUrl, apiKey: c.apiKey }); // key 入库走 safeStorage 加密
      existing.add(c.baseUrl);
      imported++;
      names.push(c.name + (c.isCurrent ? '(当前)' : ''));
    }
    return { ok: true, imported, skipped: r.relays.length - imported, names };
  });
  ipcMain.handle('rs:importAccountFromCodex', () => {
    const authText = codex.readText(path.join(codexHome(), 'auth.json'));
    if (!authText) return { ok: false, error: '本机 auth.json 不存在' };
    let auth;
    try { auth = JSON.parse(authText); } catch { return { ok: false, error: 'auth.json 解析失败' }; }
    const t = auth.tokens;
    if (!t || !t.access_token) return { ok: false, error: '本机登录态不是 OAuth tokens 模式(可能是 API-key 模式),无法导入为账号' };
    if (t.account_id && store.listAccounts().some(a => a.accountId === t.account_id)) {
      return { ok: true, skipped: true, message: '本机登录账号已在库中' };
    }
    const a = store.addAccount(JSON.stringify({ tokens: t }));
    return { ok: true, account: a };
  });
  ipcMain.handle('rs:listBackups', () => codex.listBackups(codexHome()));
  ipcMain.handle('rs:restoreBackup', (_e, id) => ({ restored: codex.restoreBackup(codexHome(), id) }));
  ipcMain.handle('rs:saveSettings', (_e, s) => { store.saveSettings(s); applyOpenAtLogin(); return getState(); });
}

/* ---------------- 冒烟自检(无窗口): 临时 CODEX_HOME 全流程演练 ---------------- */
async function smoke() {
  const os = require('os');
  const TOML = require('@iarna/toml');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-smoke-'));
  const P = (f) => path.join(home, f);

  let pass = 0, fail = 0;
  const check = (name, cond) => { cond ? pass++ : fail++; console.log((cond ? '  ✓ ' : '  ✗ ') + name); };
  const strip = (s) => s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;

  // 种子:CRLF + BOM + auth 额外字段 + 合法本地网关 provider(普适化场景)
  const CRLF = '\r\n';
  fs.writeFileSync(P('config.toml'), Buffer.concat([
    Buffer.from([0xEF, 0xBB, 0xBF]),
    Buffer.from([
      'approval_policy = "never"',
      'model_reasoning_effort = "xhigh"',
      'model_provider = "my_local_gateway"',
      'model = "gpt-5.5"',
      '',
      '[mcp_servers.memory]',
      'command = "npx"',
      '',
      '[mcp_servers.dead_runtime]',
      'command = \'C:\\nonexistent_runtime_dir\\node_repl.exe\'',
      '',
      '[model_providers.my_local_gateway]',
      'name = "Local sub2api"',
      'base_url = "http://127.0.0.1:3000/v1"',
      'wire_api = "responses"',
      'requires_openai_auth = true',
      '',
      '[model_providers.cockpit_sidecar]',
      'name = "Old Sidecar"',
      'base_url = "http://localhost:62309/v1"',
      'experimental_bearer_token = "agt_old"',
      ''
    ].join(CRLF), 'utf8')
  ]));
  fs.writeFileSync(P('auth.json'), JSON.stringify({
    OPENAI_API_KEY: 'sk-old-keep-me',
    custom_field: 'should-survive',
    tokens: { id_token: 'old', access_token: 'old-at', refresh_token: 'old-rt', account_id: 'old-aid' },
    last_refresh: '2020-01-01T00:00:00Z'
  }, null, 2));

  const fakeTokens = { id_token: 'x.y.' + Buffer.from(JSON.stringify({ email: 'smoke@test.dev', chatgpt_plan_type: 'free' })).toString('base64url'),
    access_token: 'acc', refresh_token: 'ref', account_id: 'acc-smoke-1' };
  const switchOpts = (over) => ({
    home,
    account: { tokens: fakeTokens },
    relay: { name: 'SmokeRelay', baseUrl: 'https://relay.example.com/v1', apiKey: 'sk-smoke' },
    model: 'gpt-6-astra', contextWindow: 872000, fastMode: true,
    providerId: 'codex_local_access',
    catalogEnabled: true,
    catalogSourcePath: path.join(resourcesDir(), 'model-catalog.json'),
    catalogFileName: 'relayswitcher-model-catalog.json',
    pruneLocalProviders: false,
    ...over
  });

  const origCfgBytes = fs.readFileSync(P('config.toml'));

  // ---- 场景 A:非法 providerId → 写前校验失败,文件必须分毫未动 ----
  const bad = codex.applySwitch(switchOpts({ providerId: 'bad]name' }));
  check('非法输入被拒绝', bad.ok === false);
  check('校验失败时 config.toml 字节级未动(原子性)', fs.readFileSync(P('config.toml')).equals(origCfgBytes));
  check('校验失败时 auth.json 未动', JSON.parse(fs.readFileSync(P('auth.json'), 'utf8')).tokens.access_token === 'old-at');

  // ---- 场景 B:正常切换(默认不清理本地 provider) ----
  const r = codex.applySwitch(switchOpts());
  check('切换流程成功', r.ok);
  check('账号变更预警触发(account_id 变化时明示会话空间切换)', r.ok && r.log.some(l => l.name === '账号变更'));
  check('失效路径体检警告触发(死路径 MCP 提前亮出)', r.ok && r.log.some(l => l.name === '失效路径警告' && String(l.detail).includes('dead_runtime')));

  const cfg = TOML.parse(strip(fs.readFileSync(P('config.toml'), 'utf8')));
  check('model = gpt-6-astra', cfg.model === 'gpt-6-astra');
  check('model_provider 指向新 provider', cfg.model_provider === 'codex_local_access');
  check('base_url 指向中转站', cfg.model_providers['codex_local_access'].base_url === 'https://relay.example.com/v1');
  check('experimental_bearer_token 写入', cfg.model_providers['codex_local_access'].experimental_bearer_token === 'sk-smoke');
  check('requires_openai_auth = true', cfg.model_providers['codex_local_access'].requires_openai_auth === true);
  check('service_tier = priority', cfg.service_tier === 'priority');
  check('model_context_window = 872000', cfg.model_context_window === 872000);
  check('model_catalog_json 已设置', cfg.model_catalog_json === 'relayswitcher-model-catalog.json');
  check('【关键】合法本地网关区块默认保留', !!cfg.model_providers['my_local_gateway'] && cfg.model_providers['my_local_gateway'].base_url === 'http://127.0.0.1:3000/v1');
  check('其它配置保留(mcp_servers)', !!cfg.mcp_servers && !!cfg.mcp_servers.memory);
  check('顶层原键保留(approval_policy)', cfg.approval_policy === 'never');

  const cfgRaw = fs.readFileSync(P('config.toml'), 'utf8');
  check('【关键】CRLF 换行符保持', (cfgRaw.match(/\r\n/g) || []).length >= 8 && !/[^\r]\n/.test(cfgRaw));
  check('【关键】BOM 保留', fs.readFileSync(P('config.toml'))[0] === 0xEF);

  const auth = JSON.parse(fs.readFileSync(P('auth.json'), 'utf8'));
  check('auth.json 写入 OAuth tokens', auth.tokens.account_id === 'acc-smoke-1');
  check('OPENAI_API_KEY 移除(与 tokens 语义冲突)', auth.OPENAI_API_KEY === undefined);
  check('【关键】auth.json 自定义字段保留', auth.custom_field === 'should-survive');

  check('模型目录已部署', fs.existsSync(P('relayswitcher-model-catalog.json')));
  const cat = JSON.parse(fs.readFileSync(P('relayswitcher-model-catalog.json'), 'utf8'));
  check('目录含 gpt-6-astra', cat.models.some(m => m.slug === 'gpt-6-astra'));

  // ---- 场景 C:显式开启清理(用户明确要求才删) ----
  const home2 = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-smoke2-'));
  fs.copyFileSync(P('config.toml'), path.join(home2, 'config.toml'));
  fs.writeFileSync(path.join(home2, 'auth.json'), '{"tokens":{"access_token":"a"}}');
  const r2 = codex.applySwitch(switchOpts({ home: home2, pruneLocalProviders: true }));
  let cfg2b = null;
  try { cfg2b = TOML.parse(strip(fs.readFileSync(path.join(home2, 'config.toml'), 'utf8'))); } catch { /* 留 null → 断言红 */ }
  check('显式 prune 时本地区块被清理', r2.ok && !!cfg2b && !cfg2b.model_providers['my_local_gateway'] && !cfg2b.model_providers['cockpit_sidecar']);
  fs.rmSync(home2, { recursive: true, force: true });

  // ---- 场景 D:备份与回滚 ----
  const bks = codex.listBackups(home);
  check('切换前自动备份', bks.length >= 1 && bks[0].reason === 'switch');
  check('备份含旧配置', bks[0].files.includes('config.toml') && bks[0].files.includes('auth.json'));
  check('备份保留了 CRLF 原文', fs.readFileSync(path.join(home, 'relayswitcher-backups', bks[bks.length - 1].id, 'config.toml')).includes('\r\n'));

  codex.restoreBackup(home, bks[bks.length - 1].id);
  const cfg2 = TOML.parse(strip(fs.readFileSync(P('config.toml'), 'utf8')));
  const auth2 = JSON.parse(fs.readFileSync(P('auth.json'), 'utf8'));
  check('回滚后恢复旧 model', cfg2.model === 'gpt-5.5');
  check('回滚后恢复旧 provider', cfg2.model_providers['my_local_gateway'].base_url === 'http://127.0.0.1:3000/v1');
  check('回滚后恢复旧 auth(含额外字段)', auth2.OPENAI_API_KEY === 'sk-old-keep-me' && auth2.tokens.access_token === 'old-at');
  check('回滚后 BOM 仍在', fs.readFileSync(P('config.toml'))[0] === 0xEF);
  check('回滚前也做了快照', codex.listBackups(home).some(b => b.reason === 'pre-restore'));

  const st = codex.getStatus(home);
  check('状态读取正常', st.tomlOk && st.baseUrl === 'http://127.0.0.1:3000/v1');

  // ---- 场景 E:目录预检边界 —— 2026-09-23 官方内嵌目录已不含 base_instructions,
  //      官方原生形态必须可部署;预检只拦结构性损坏(缺 slug),坏目录绝不写入 ----
  const nativeCat = P('native-catalog.json');
  fs.writeFileSync(nativeCat, JSON.stringify({ models: [{ slug: 'gpt-native', display_name: 'GPT Native' }] }));
  const rNative = codex.applySwitch(switchOpts({ catalogSourcePath: nativeCat, model: 'gpt-native' }));
  check('官方原生目录(无 base_instructions)可正常部署', rNative.ok === true);
  const badCat = P('bad-catalog.json');
  fs.writeFileSync(badCat, JSON.stringify({ models: [{ display_name: 'no-slug' }] }));
  const rBad = codex.applySwitch(switchOpts({ catalogSourcePath: badCat }));
  check('缺 slug 的坏目录被预检拒绝', rBad.ok === false && /预检/.test(rBad.error || ''));
  const cfgAfterBad = TOML.parse(strip(fs.readFileSync(P('config.toml'), 'utf8')));
  check('坏目录切换未污染现有配置(仍为原生目录部署的 gpt-native)', cfgAfterBad.model === 'gpt-native');
  const catStill = JSON.parse(fs.readFileSync(P('relayswitcher-model-catalog.json'), 'utf8'));
  check('已部署目录未被坏文件覆盖(仍为原生形态,不含 base_instructions)', catStill.models[0].slug === 'gpt-native' && catStill.models.every(m => !('base_instructions' in m)));
  fs.rmSync(home, { recursive: true, force: true });
  console.log(`\nSMOKE RESULT: ${pass} passed, ${fail} failed`);
  app.exit(fail ? 1 : 0);
}

/* ---------------- 托盘常驻(US-08): 关窗最小化 + 开机自启 ---------------- */
let tray = null;

function showMainWin() {
  if (win && !win.isDestroyed()) { win.show(); win.focus(); }
}

function createTray(iconPath) {
  try {
    const { Tray, Menu, nativeImage } = require('electron');
    const img = nativeImage.createFromPath(iconPath);
    tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
    tray.setToolTip('RelaySwitcher — Codex 账号 × 中转站切换器');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '显示主窗口', click: showMainWin },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() }
    ]));
    tray.on('click', showMainWin);
  } catch (e) { console.error('[tray] 创建失败(不阻塞):', e.message); tray = null; }
}

function applyOpenAtLogin() {
  // 开机自启仅打包版实际注册(开发模式注册的是 electron.exe,会污染启动项)
  try { app.setLoginItemSettings({ openAtLogin: !!(app.isPackaged && store && store.getSettings().openAtLogin) }); } catch { /* 系统不支持则忽略 */ }
}

/* ---------------- App 生命周期 ---------------- */
app.whenReady().then(() => {
  store = createStore(app.getPath('userData'));
  store.load();
  registerIpc();

  if (SMOKE) {
    // 打包前静态审计:全文件 import 检查(防 Spinner/catalogBundled 类崩溃)
    // 打包版跳过(lint-imports.js 不在 files 列表里,构建时已检查过)
    if (!app.isPackaged) {
      try {
        require('child_process').execSync('node lint-imports.js', { cwd: app.getAppPath(), stdio: 'pipe' });
        console.log('  ✓ import 审计通过');
      } catch (e) {
        console.error(String(e.stderr || e.message));
        console.error('SMOKE RESULT: import 审计失败,拒绝发布');
        app.exit(1);
        return;
      }
    }
    smoke().catch(e => { console.error('SMOKE CRASH:', e); app.exit(1); });
    return;
  }

  // ---- 自动化(US-06):一切用户不该手点的都后台静默做 ----
  const notifyStateChanged = () => {
    if (win && !win.isDestroyed()) win.webContents.send('rs:state-changed');
  };
  // token 自动保养(修正策略:只救快死的)— 启动 30s 首查 + 每 6 小时巡检,
  // 仅刷新 access_token 剩余 <24h 的账号。不做高频全量刷:每次成功刷新都会轮换
  // refresh_token(旧的作废),共享池账号会互相踢出且加速触发渠道风控;
  // 正在使用中的登录态由 Codex 客户端自行续期(OAuth 标准行为)。
  const autoTokenTick = async () => {
    let changed = false;
    const deadline = Date.now() + 24 * 3600 * 1000;
    for (const a of store.listAccounts()) {
      if (!a.hasRefreshToken) continue;
      if (!a.tokenExp || new Date(a.tokenExp).getTime() > deadline) continue; // 仍新鲜,不折腾
      if (a.earliestRefreshAt && Date.now() < new Date(a.earliestRefreshAt).getTime()) continue;
      const r = await refreshAccount(a.id).catch(() => null);
      if (r && r.ok) changed = true;
    }
    if (changed) notifyStateChanged();
  };
  setTimeout(autoTokenTick, 30 * 1000).unref?.();
  setInterval(autoTokenTick, 6 * 3600 * 1000).unref?.();
  // 启动 8s 静默检查更新(失败零打扰;发现新版时侧边栏已有提示)
  setTimeout(() => checkForUpdates().catch(() => {}), 8000).unref?.();

  // 官方目录自动跟进(v1.8.0):启动 15s 后检测 codex.exe 指纹(路径+大小+mtime),
  // 变了才后台重提取 — 官方出新模型/客户端升级,用户零操作,切换自动用最新目录
  const autoExtractIfStale = async () => {
    try {
      const binPath = locateCodexBinary();
      const st = fs.statSync(binPath);
      const fp = binPath + ':' + st.size + ':' + Math.floor(st.mtimeMs);
      const flag = path.join(app.getPath('userData'), 'catalogs', 'last-extract.json');
      let prev = null;
      try { prev = JSON.parse(fs.readFileSync(flag, 'utf8')).fingerprint; } catch { /* 首次 */ }
      if (prev === fp) return;
      const r = extractToFile(path.join(app.getPath('userData'), 'catalogs'));
      fs.mkdirSync(path.dirname(flag), { recursive: true });
      fs.writeFileSync(flag, JSON.stringify({ fingerprint: fp, at: new Date().toISOString() }));
      console.log('[auto-extract] 官方目录已同步:', r.report.modelCount, '模型,来源', r.binPath);
      notifyStateChanged();
    } catch (e) { console.error('[auto-extract] 同步失败(不影响使用):', e.message); }
  };
  setTimeout(() => autoExtractIfStale().catch(() => {}), 15000).unref?.();

  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'resources', 'icon.ico')
    : path.join(app.getAppPath(), 'build', 'icon.ico');

  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 1080, minHeight: 720,
    backgroundColor: '#0a0a0a',
    title: 'RelaySwitcher',
    autoHideMenuBar: true,
    frame: false,
    show: false, // 等渲染完成再显示,消除启动黑屏等待感
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false
    }
  });
  if (isDev) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  win.once('ready-to-show', () => win.show());
  // electron-updater 初始化(打包环境生效;事件转发与旧 {ev,info} 格式兼容)
  autoUpdate.initAutoUpdater(win);
  // 托盘常驻 + 关窗最小化 + 开机自启(US-08;默认关窗进托盘,托盘右键退出)
  applyOpenAtLogin();
  createTray(iconPath);
  win.on('close', (e) => {
    if (!app.quitting && store.getSettings().closeToTray !== false) { e.preventDefault(); win.hide(); }
  });
  // --capture 模式:完整 IPC 环境下自动截各页(设计管线用,如 #relays/#backups/#settings)
  if (process.argv.includes('--capture')) {
    win.webContents.once('did-finish-load', async () => {
      try {
        await new Promise(r => setTimeout(r, 1500));
        const outDir = path.join(app.getAppPath(), 'designs', 'captures');
        fs.mkdirSync(outDir, { recursive: true });
        for (const p of ['dash', 'dash-demo-warn', 'dash-demo-modal', 'relays', 'backups', 'settings']) {
          await win.webContents.executeJavaScript(`location.hash = '${p}'`);
          await new Promise(r => setTimeout(r, 900));
          const img = await win.webContents.capturePage();
          fs.writeFileSync(path.join(outDir, `page-${p}.png`), img.toPNG());
          console.log('captured:', p);
        }
      } catch (e) { console.error('capture failed:', e.message); }
      app.exit(0);
    });
  }
  // 渲染进程异常诊断:黑屏/崩溃时日志里留下原因,不再靠猜
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[renderer-gone]', details.reason, details.exitCode);
  });
  win.webContents.on('unresponsive', () => console.error('[renderer-unresponsive]'));
  // 渲染崩溃自愈(2026-09-20 Insider 26200 实测:GPU 子系统首启抽签式崩 143,
  // 重载一轮落到重启后的健康 GPU 进程即稳定)。与 v1.5.4 黑屏误判无关——那次是
  // JS 解构 bug,这次是原生层崩溃(无 JS 异常可言)。最多重试 2 次防循环。
  let crashRetries = 0;
  win.webContents.on('render-process-gone', (_e, details) => {
    if (details.reason !== 'crashed' || win.isDestroyed()) return;
    if (crashRetries >= 2) { console.error('[renderer-gone] 重试耗尽,保持日志观察'); return; }
    crashRetries++;
    console.error('[renderer-gone] 自动重载 ' + crashRetries + '/2');
    try { win.webContents.reload(); } catch { /* 窗口已毁则不折腾 */ }
  });
});

app.on('before-quit', () => { app.quitting = true; });
app.on('window-all-closed', () => app.quit());
