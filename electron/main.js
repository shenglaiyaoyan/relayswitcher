'use strict';
const { app, BrowserWindow, ipcMain, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { createStore } = require('./lib/store');
const codex = require('./lib/codex');

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
  return {
    accounts, relays,
    settings: store.getSettings(),
    status: { ...status, activeRelay, activeAccount },
    catalogBundled: fs.existsSync(path.join(resourcesDir(), 'model-catalog.json'))
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
async function doSwitch(opts, event) {
  const s = store.getSettings();
  const account = store.getAccount(opts.accountId);
  const relay = store.getRelay(opts.relayId);
  return codex.applySwitch({
    home: codexHome(),
    account, relay,
    model: opts.model || 'gpt-6-astra',
    contextWindow: opts.contextWindow != null ? opts.contextWindow : s.contextWindow,
    fastMode: opts.fastMode != null ? opts.fastMode : s.fastMode,
    providerId: s.providerId,
    catalogEnabled: s.catalogEnabled,
    catalogSourcePath: path.join(resourcesDir(), 'model-catalog.json'),
    catalogFileName: s.catalogFileName,
    pruneLocalProviders: !!s.pruneLocalProviders,
    onStep: (name, ok, detail) => {
      if (win && !win.isDestroyed()) win.webContents.send('rs:switch-step', { name, ok, detail });
    }
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
    const err = j.error || ('HTTP ' + resp.status);
    const hint = err === 'invalid_grant' ? 'refresh_token 已失效(多为渠道共享池被他人刷新轮换),需重新获取账号'
      : resp.status >= 500 ? 'OpenAI 服务端错误,稍后再试' : '请检查网络(需能访问 auth.openai.com)';
    return { ok: false, error: err + ' — ' + hint };
  }
  const newTokens = {
    id_token: j.id_token || t.id_token,
    access_token: j.access_token || t.access_token,
    refresh_token: j.refresh_token || t.refresh_token, // 轮换后必须存新的
    account_id: t.account_id
  };
  const account = store.updateTokens(id, newTokens);
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
  // Codex 检测
  ipcMain.handle('rs:detectCodex', () => detectCodexRunning());
  // 自动更新(仅手动触发;检测走 GitHub API,下载由 UI 用浏览器完成)
  ipcMain.handle('rs:checkUpdate', () => checkForUpdates());
  ipcMain.handle('rs:getVersion', () => app.getVersion());
  ipcMain.handle('rs:listBackups', () => codex.listBackups(codexHome()));
  ipcMain.handle('rs:restoreBackup', (_e, id) => ({ restored: codex.restoreBackup(codexHome(), id) }));
  ipcMain.handle('rs:saveSettings', (_e, s) => { store.saveSettings(s); return getState(); });
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

  fs.rmSync(home, { recursive: true, force: true });
  console.log(`\nSMOKE RESULT: ${pass} passed, ${fail} failed`);
  app.exit(fail ? 1 : 0);
}

/* ---------------- App 生命周期 ---------------- */
app.whenReady().then(() => {
  store = createStore(app.getPath('userData'));
  store.load();
  registerIpc();
  // 自动更新仅手动触发(设置页),不在启动时静默检测 — 避免无网环境报错

  if (SMOKE) { smoke().catch(e => { console.error('SMOKE CRASH:', e); app.exit(1); }); return; }

  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'resources', 'icon.ico')
    : path.join(app.getAppPath(), 'build', 'icon.ico');

  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 1080, minHeight: 720,
    backgroundColor: '#0a0a0a',
    title: 'RelaySwitcher',
    autoHideMenuBar: true,
    frame: false,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false
    }
  });
  if (isDev) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

app.on('window-all-closed', () => app.quit());
