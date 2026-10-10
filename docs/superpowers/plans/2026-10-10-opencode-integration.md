# OpenCode 集成 + 导航重构 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RS 新增 OpenCode provider 管理页(方案 A→2),导航重构为 ChatGPT / OpenCode / 中转站 / 备份 / 设置 五项,设置按归属拆分。

**Architecture:** 纯函数层(electron/lib/opencode.js)负责读写 opencode.json/auth.json/合并/备份,IPC 层桥接 store 与渲染层,前端三个页面(OpenCode 新建 + Dashboard 改名 ChatGPT + Settings 拆分)走 superdesign 已定稿的设计系统。

**Tech Stack:** Electron 33 + React 18 + Vite 5,零新依赖。

**Spec:** `docs/superpowers/specs/2026-10-10-opencode-integration-design.md`

## Global Constraints

- 协议三选一:message(`@ai-sdk/anthropic`) / chat(`@ai-sdk/openai-compatible`) / responses(`@ai-sdk/openai`)
- opencode 配置路径:`~/.config/opencode/opencode.json`;auth 路径:`~/.local/share/opencode/auth.json`
- 所有模型参数用户可选可写,RS 只做预填(有目录元数据就预填,没有就空着)
- 外科合并:只动 RS 注入的 provider 块与顶层 `model` 键,用户手写的其他配置原样保留
- 写前备份 opencode.json + auth.json;写回标准 JSON,原文件含注释时提前警告
- 无热重载,写入后提示重启 opencode

---

### Task 1: opencode.js 纯函数 — JSONC 解析 + 配置读写 + 外科合并 + 备份

**Files:**
- Create: `electron/lib/opencode.js`
- Test: `test/opencode.test.js`

**Interfaces:**
- Produces: `readOpenCodeConfig(home)`, `writeOpenCodeConfig(home, config)`, `readAuthFile(home)`, `writeAuthFile(home, auth)`, `mergeProviderBlock(existing, providerData)`, `removeProviderBlock(existing, providerId)`, `backupOpenCode(home)`, `PROTOCOL_ADAPTERS`

- [ ] **Step 1: Write failing tests for JSONC parsing + merge**

```javascript
'use strict';
/* Test: opencode.js — JSONC 解析/合并/摘除/auth/备份/协议映射 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  PROTOCOL_ADAPTERS, readOpenCodeConfig, writeOpenCodeConfig,
  readAuthFile, writeAuthFile,
  mergeProviderBlock, removeProviderBlock, backupOpenCode
} = require('../electron/lib/opencode.js');

const OC_HOME = path.join(os.homedir(), '.config', 'opencode');
const OC_DATA = path.join(os.homedir(), '.local', 'share', 'opencode');

function mkHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-oc-'));
  fs.mkdirSync(path.join(home, '.config', 'opencode'), { recursive: true });
  fs.mkdirSync(path.join(home, '.local', 'share', 'opencode'), { recursive: true });
  return home;
}

test('PROTOCOL_ADAPTERS: message→anthropic, chat→openai-compatible, responses→openai', () => {
  assert.equal(PROTOCOL_ADAPTERS.message, '@ai-sdk/anthropic');
  assert.equal(PROTOCOL_ADAPTERS.chat, '@ai-sdk/openai-compatible');
  assert.equal(PROTOCOL_ADAPTERS.responses, '@ai-sdk/openai');
});

test('readOpenCodeConfig: 纯 JSON 正常解析', () => {
  const home = mkHome();
  fs.writeFileSync(path.join(home, '.config/opencode/opencode.json'),
    JSON.stringify({ model: 'test/m1', provider: { test: { npm: '@ai-sdk/openai-compatible' } } }));
  const cfg = readOpenCodeConfig(home);
  assert.equal(cfg.model, 'test/m1');
  assert.ok(cfg.provider.test);
});

test('readOpenCodeConfig: JSONC 含注释正常解析(容忍//)', () => {
  const home = mkHome();
  fs.writeFileSync(path.join(home, '.config/opencode/opencode.json'),
    '{\n  // my comment\n  "model": "test/m1"\n}');
  const cfg = readOpenCodeConfig(home);
  assert.equal(cfg.model, 'test/m1');
});

test('readOpenCodeConfig: 文件不存在返回空对象', () => {
  const home = mkHome();
  const cfg = readOpenCodeConfig(home);
  assert.deepEqual(cfg, {});
});

test('readOpenCodeConfig: 检测到注释返回 _hasComments=true(写回时警告)', () => {
  const home = mkHome();
  fs.writeFileSync(path.join(home, '.config/opencode/opencode.json'), '{ // c\n "a": 1 }');
  const cfg = readOpenCodeConfig(home);
  assert.equal(cfg._hasComments, true);
});

test('mergeProviderBlock: 注入新 provider 到空配置', () => {
  const existing = {};
  const pd = { id: 'myrelay', npm: '@ai-sdk/openai-compatible', name: 'My Relay',
    options: { baseURL: 'https://api.example.com/v1' },
    models: { 'gpt-6-sol': { name: 'GPT-6-Sol', limit: { context: 272000, output: 128000 } } } };
  const out = mergeProviderBlock(existing, pd);
  assert.ok(out.provider.myrelay);
  assert.equal(out.provider.myrelay.npm, '@ai-sdk/openai-compatible');
  assert.equal(out.provider.myrelay.models['gpt-6-sol'].limit.context, 272000);
});

test('mergeProviderBlock: 已有 provider 同 id 覆盖,其他 provider 保留', () => {
  const existing = { provider: { myrelay: { npm: 'old' }, other: { npm: '@ai-sdk/anthropic' } } };
  const pd = { id: 'myrelay', npm: '@ai-sdk/openai-compatible', name: 'My Relay',
    options: { baseURL: 'https://new.example.com/v1' }, models: {} };
  const out = mergeProviderBlock(existing, pd);
  assert.equal(out.provider.myrelay.npm, '@ai-sdk/openai-compatible');
  assert.equal(out.provider.myrelay.options.baseURL, 'https://new.example.com/v1');
  assert.equal(out.provider.other.npm, '@ai-sdk/anthropic');
});

test('mergeProviderBlock: 顶层 model 键同步写入', () => {
  const existing = { provider: { myrelay: { npm: 'x' } } };
  const pd = { id: 'myrelay', npm: 'x', name: 'x', options: {}, models: {}, defaultModel: 'myrelay/gpt-6-sol' };
  const out = mergeProviderBlock(existing, pd);
  assert.equal(out.model, 'myrelay/gpt-6-sol');
});

test('removeProviderBlock: 摘除指定 provider,其余保留', () => {
  const existing = { model: 'myrelay/m1', provider: { myrelay: { npm: 'x' }, keep: { npm: 'y' } } };
  const out = removeProviderBlock(existing, 'myrelay');
  assert.ok(!out.provider.myrelay);
  assert.ok(out.provider.keep);
  assert.ok(!out.model, '顶层 model 被清除(指向已摘除的 provider)');
});

test('readAuthFile/writeAuthFile: 读写合并 auth.json', () => {
  const home = mkHome();
  const auth = readAuthFile(home);
  assert.deepEqual(auth, {});
  auth.myrelay = { type: 'api', key: 'sk-test-123' };
  writeAuthFile(home, auth);
  const reread = readAuthFile(home);
  assert.equal(reread.myrelay.key, 'sk-test-123');
});

test('writeAuthFile: 保留已有条目', () => {
  const home = mkHome();
  const auth = readAuthFile(home);
  auth.existing = { type: 'api', key: 'sk-old' };
  writeAuthFile(home, auth);
  const updated = readAuthFile(home);
  updated.newone = { type: 'api', key: 'sk-new' };
  writeAuthFile(home, updated);
  const final = readAuthFile(home);
  assert.equal(final.existing.key, 'sk-old');
  assert.equal(final.newone.key, 'sk-new');
});

test('backupOpenCode: 备份 opencode.json + auth.json 存在时生成快照目录', () => {
  const home = mkHome();
  fs.writeFileSync(path.join(home, '.config/opencode/opencode.json'), '{"model":"x"}');
  fs.writeFileSync(path.join(home, '.local/share/opencode/auth.json'), '{"k":{"type":"api","key":"v"}}');
  const bdir = backupOpenCode(home);
  assert.ok(bdir, '返回备份目录名');
  assert.ok(fs.existsSync(path.join(home, '.config/opencode/relayswitcher-backups', bdir, 'opencode.json')));
  assert.ok(fs.existsSync(path.join(home, '.config/opencode/relayswitcher-backups', bdir, 'auth.json')));
});

test('writeOpenCodeConfig: 写回标准 JSON(2空格缩进+LF)', () => {
  const home = mkHome();
  const cfg = { model: 'test/m1', provider: { test: { npm: 'x' } } };
  writeOpenCodeConfig(home, cfg);
  const raw = fs.readFileSync(path.join(home, '.config/opencode/opencode.json'), 'utf8');
  assert.ok(!raw.includes('//'), '不含注释');
  assert.ok(raw.includes('\n'), 'LF 换行');
  assert.deepEqual(JSON.parse(raw), cfg);
});
```

- [ ] **Step 2: Run test — expect FAIL (module not found)**

Run: `node --test test/opencode.test.js`
Expected: FAIL — Cannot find module `../electron/lib/opencode.js`

- [ ] **Step 3: Implement electron/lib/opencode.js**

```javascript
'use strict';
/**
 * opencode.js — OpenCode 配置管理(纯函数核心)。
 * 职责:读写 ~/.config/opencode/opencode.json(JSONC 容错)与
 * ~/.local/share/opencode/auth.json;外科手术式合并/摘除 provider 块;
 * 写前备份。路径可通过传入 home 覆盖(测试用)。
 */
const fs = require('fs');
const path = require('path');

const PROTOCOL_ADAPTERS = {
  message: '@ai-sdk/anthropic',
  chat: '@ai-sdk/openai-compatible',
  responses: '@ai-sdk/openai'
};

function configPath(home) { return path.join(home || '', '.config', 'opencode', 'opencode.json'); }
function authPath(home) { return path.join(home || '', '.local', 'share', 'opencode', 'auth.json'); }
function backupDir(home) { return path.join(home || '', '.config', 'opencode', 'relayswitcher-backups'); }

/** JSONC → JSON(剥掉 // 与 /* 注释;不处理嵌套在字符串内的伪注释——够用) */
function stripJsonComments(text) {
  let out = '', inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (inStr) {
      out += c;
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n'; continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++; continue;
    }
    out += c;
  }
  return out;
}

function readOpenCodeConfig(home) {
  const p = configPath(home);
  let raw;
  try { raw = fs.readFileSync(p, 'utf8'); } catch { return {}; }
  const hasComments = /\/\/|\/\*/.test(raw);
  try {
    const cfg = JSON.parse(stripJsonComments(raw));
    if (hasComments) cfg._hasComments = true;
    return cfg;
  } catch (e) {
    throw new Error('opencode.json 解析失败: ' + e.message);
  }
}

function writeOpenCodeConfig(home, cfg) {
  const clean = { ...cfg };
  delete clean._hasComments;
  const p = configPath(home);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(clean, null, 2) + '\n');
}

function readAuthFile(home) {
  try { return JSON.parse(fs.readFileSync(authPath(home), 'utf8')); } catch { return {}; }
}

function writeAuthFile(home, auth) {
  const p = authPath(home);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(auth, null, 2) + '\n');
}

function mergeProviderBlock(existing, pd) {
  const out = { ...existing };
  if (!out.provider) out.provider = {};
  out.provider[pd.id] = {
    npm: pd.npm,
    name: pd.name,
    options: pd.options || {},
    ...(pd.models && Object.keys(pd.models).length ? { models: pd.models } : {})
  };
  if (pd.defaultModel) out.model = pd.defaultModel;
  return out;
}

function removeProviderBlock(existing, providerId) {
  const out = { ...existing };
  if (out.provider) {
    const { [providerId]: removed, ...rest } = out.provider;
    out.provider = rest;
  }
  if (out.model && out.model.startsWith(providerId + '/')) delete out.model;
  return out;
}

function backupOpenCode(home) {
  const cfg = configPath(home);
  const auth = authPath(home);
  const bdirRoot = backupDir(home);
  const ts = new Date();
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
  const bdir = path.join(bdirRoot, stamp + '_opencode');
  fs.mkdirSync(bdir, { recursive: true });
  let copied = 0;
  for (const [src, name] of [[cfg, 'opencode.json'], [auth, 'auth.json']]) {
    try { fs.copyFileSync(src, path.join(bdir, name)); copied++; } catch { /* 不存在则跳过 */ }
  }
  if (copied === 0) { fs.rmdirSync(bdir); return null; }
  return path.basename(bdir);
}

module.exports = {
  PROTOCOL_ADAPTERS, configPath, authPath,
  readOpenCodeConfig, writeOpenCodeConfig,
  readAuthFile, writeAuthFile,
  mergeProviderBlock, removeProviderBlock,
  backupOpenCode, stripJsonComments
};
```

- [ ] **Step 4: Run tests — expect ALL PASS**

Run: `node --test test/opencode.test.js`
Expected: 13 pass, 0 fail

- [ ] **Step 5: Run full suite to verify no regression**

Run: `node --test test/*.test.js && node lint-imports.js`
Expected: 65+13=78 pass, 0 fail

- [ ] **Step 6: Commit**

```bash
git add electron/lib/opencode.js test/opencode.test.js
git commit -m "feat: opencode.js 纯函数 — JSONC 解析/合并/摘除/auth/备份/协议映射(13 例单测)"
```

---

### Task 2: store 数据模型 + IPC handler

**Files:**
- Modify: `electron/lib/store.js`(加 opencodeProviders 数组)
- Modify: `electron/main.js`(加 rs:oc:* 系列 handler)
- Modify: `electron/preload.js`(桥接新 IPC)
- Test: `test/opencode.test.js`(追加 store 集成测试)

**Interfaces:**
- Consumes: Task 1 的全部函数
- Produces: IPC `rs:oc:list` / `rs:oc:save` / `rs:oc:remove` / `rs:oc:readConfig` / `rs:oc:fetchModels`

- [ ] **Step 1: store.js 加 opencodeProviders 字段**

在 `createStore` 的 data 初始化中加:

```javascript
opencodeProviders: [],
```

在返回对象中加:

```javascript
listOpenCodeProviders() { return data.opencodeProviders || []; },
saveOpenCodeProvider(p) {
  if (!p.id) throw new Error('provider id 必填');
  const i = (data.opencodeProviders || []).findIndex(x => x.id === p.id);
  if (i >= 0) data.opencodeProviders[i] = p;
  else (data.opencodeProviders = data.opencodeProviders || []).push(p);
  save();
},
deleteOpenCodeProvider(id) {
  data.opencodeProviders = (data.opencodeProviders || []).filter(x => x.id !== id);
  save();
},
```

- [ ] **Step 2: main.js 加 IPC handler**

在现有 IPC 注册区(`ipcMain.handle` 集中区)加:

```javascript
const oc = require('./lib/opencode');

ipcMain.handle('rs:oc:list', () => store.listOpenCodeProviders());
ipcMain.handle('rs:oc:save', (_e, p) => {
  try {
    oc.backupOpenCode(); // 写前备份(真实 home)
    const cfg = oc.readOpenCodeConfig();
    const auth = oc.readAuthFile();
    const merged = oc.mergeProviderBlock(cfg, {
      id: p.id,
      npm: oc.PROTOCOL_ADAPTERS[p.protocol] || oc.PROTOCOL_ADAPTERS.chat,
      name: p.name || p.id,
      options: { baseURL: p.baseUrl },
      models: Object.fromEntries((p.models || []).map(m => [m.id, {
        name: m.name || m.id,
        ...(m.limit && m.limit.context ? { limit: m.limit } : {}),
        ...(m.reasoning ? { reasoning: true } : {}),
        ...(m.options && Object.keys(m.options).length ? { options: m.options } : {})
      }])),
      defaultModel: p.defaultModel || null
    });
    oc.writeOpenCodeConfig(undefined, merged);
    if (p.apiKey) {
      auth[p.id] = { type: 'api', key: p.apiKey };
      oc.writeAuthFile(undefined, auth);
    }
    store.saveOpenCodeProvider(p);
    return { ok: true, hasComments: !!cfg._hasComments };
  } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('rs:oc:remove', (_e, id) => {
  try {
    oc.backupOpenCode();
    const cfg = oc.readOpenCodeConfig();
    const auth = oc.readAuthFile();
    const updated = oc.removeProviderBlock(cfg, id);
    oc.writeOpenCodeConfig(undefined, updated);
    if (auth[id]) { delete auth[id]; oc.writeAuthFile(undefined, auth); }
    store.deleteOpenCodeProvider(id);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('rs:oc:readConfig', () => {
  try { return { ok: true, config: oc.readOpenCodeConfig() }; } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('rs:oc:fetchModels', (_e, relayId) => {
  const relay = store.getRelay(relayId);
  if (!relay) return { ok: false, error: '中转站不存在' };
  // 复用现有 fetchRelayModels 逻辑
  return fetchRelayModels(relay).then(r => ({ ok: true, models: r.ids }))
    .catch(e => ({ ok: false, error: e.message }));
});
```

- [ ] **Step 3: preload.js 桥接**

```javascript
ocList: () => ipcRenderer.invoke('rs:oc:list'),
ocSave: (p) => ipcRenderer.invoke('rs:oc:save', p),
ocRemove: (id) => ipcRenderer.invoke('rs:oc:remove', id),
ocReadConfig: () => ipcRenderer.invoke('rs:oc:readConfig'),
ocFetchModels: (relayId) => ipcRenderer.invoke('rs:oc:fetchModels', relayId),
```

- [ ] **Step 4: Run lint + full test**

Run: `node lint-imports.js && node --test test/*.test.js`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add electron/lib/store.js electron/main.js electron/preload.js
git commit -m "feat: opencode store + IPC(rs:oc:save/remove/list/readConfig/fetchModels)"
```

---

### Task 3: 导航重构 — App.jsx 五项 + Dashboard 改名 ChatGPT + Settings 拆分

**Files:**
- Modify: `src/App.jsx`(NAV 数组 + 页面路由)
- Modify: `src/pages/Dashboard.jsx`(标题改 ChatGPT + 页头加图标按钮)
- Modify: `src/pages/Settings.jsx`(拆分:ChatGPT 设置视图 + 全局设置视图)
- Modify: `src/styles.css`(如需新增 .header-icon-btn 类)

**Interfaces:**
- Consumes: Task 2 的 preload IPC(`window.rs.ocList` 等)
- Produces: 路由 `page` 状态新增 `opencode` 值;`subView` 状态(main/accounts/settings)

- [ ] **Step 1: App.jsx NAV 改五项 + 新路由**

```javascript
const NAV = [
  { key: 'dash', ico: 'dash', label: 'ChatGPT' },
  { key: 'opencode', ico: 'bolt', label: 'OpenCode' },
  { key: 'relays', ico: 'relay', label: '中转站' },
  { key: 'backups', ico: 'backup', label: '备份' },
  { key: 'settings', ico: 'settings', label: '设置' }
];
const VALID_PAGES = ['dash', 'opencode', 'accounts', 'relays', 'backups', 'settings'];
```

页面渲染区:

```javascript
{page === 'dash' && <Dashboard state={state} refresh={refresh} toast={showToast} goto={setPage} />}
{page === 'opencode' && <OpenCode state={state} refresh={refresh} toast={showToast} goto={setPage} />}
{page === 'accounts' && <Accounts state={state} refresh={refresh} toast={showToast} />}
{page === 'relays' && <Relays state={state} refresh={refresh} toast={showToast} />}
{page === 'backups' && <Backups state={state} refresh={refresh} toast={showToast} goto={setPage} />}
{page === 'settings' && <Settings state={state} refresh={refresh} toast={showToast} />}
```

- [ ] **Step 2: Dashboard.jsx 页头加图标按钮 + 标题改 ChatGPT**

找到页头区域(如有标题/头部),加:

```javascript
// ChatGPT 页头右侧:👤账号 + ⚙设置(设计稿:24px 图标按钮,悬停变亮)
<div className="row" style={{ gap: 8 }}>
  <button className="header-icon-btn" title="账号" onClick={() => goto('accounts')}>
    <Icon name="account" size={16} />
  </button>
  <button className="header-icon-btn" title="ChatGPT 设置" onClick={() => goto('chatgpt-settings')}>
    <Icon name="settings" size={16} />
  </button>
</div>
```

> 注:`chatgpt-settings` 是子视图,通过 Dashboard 内部 state 或 hash 路由切换,不是独立页面。

- [ ] **Step 3: Settings.jsx 拆分**

Settings 组件接收 prop `mode`(全局=默认 / chatgpt / opencode),按 mode 渲染不同卡片集:

```javascript
// 全局设置页(侧边栏「设置」点进来):只装应用级
if (!mode || mode === 'global') {
  renderCards = [
    桌面集成卡(托盘+开机自启),
    AboutAndUpdate卡(版本+检查更新+更新状态三态)
  ];
}
// ChatGPT 设置视图(Dashboard ⚙ 点进来):装 ChatGPT 专属
if (mode === 'chatgpt') {
  renderCards = [
    Codex主目录卡,
    Provider标识卡,
    清理provider卡,
    模型目录卡(内置/提取+对比+自定义模型),
    切换默认值卡,
    工作原理卡
  ];
}
```

- [ ] **Step 4: styles.css 加 .header-icon-btn**

```css
.header-icon-btn {
  width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
  background: transparent; border: none; color: var(--txt-3); cursor: pointer;
  border-radius: 6px; transition: color .15s, background .15s;
}
.header-icon-btn:hover { color: var(--txt-1); background: rgba(255,255,255,0.04); }
```

- [ ] **Step 5: Build + lint + smoke**

Run: `npx vite build && node lint-imports.js && npm run smoke`
Expected: 全绿

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx src/pages/Dashboard.jsx src/pages/Settings.jsx src/styles.css
git commit -m "feat: 导航重构 — ChatGPT/OpenCode/中转站/备份/设置 五项 + Dashboard 改名 + Settings 拆分"
```

---

### Task 4: OpenCode 页面(Provider 管理 UI)

**Files:**
- Create: `src/pages/OpenCode.jsx`

**Interfaces:**
- Consumes: `window.rs.ocList` / `ocSave` / `ocRemove` / `ocFetchModels` / `ocReadConfig`
- Consumes: `window.rs.listRelays`(现有,拿中转站列表)

- [ ] **Step 1: 创建 OpenCode.jsx**

```javascript
'use strict';
import React, { useEffect, useState } from 'react';
import { Icon, Spinner, Toggle, Modal, Field } from '../components/ui.jsx';

const PROTOCOLS = [
  { value: 'message', label: 'Anthropic Messages', desc: '@ai-sdk/anthropic(/v1/messages)' },
  { value: 'chat', label: 'OpenAI Chat', desc: '@ai-sdk/openai-compatible(/v1/chat/completions)' },
  { value: 'responses', label: 'OpenAI Responses', desc: '@ai-sdk/openai(/v1/responses)' }
];

export default function OpenCode({ state, refresh, toast, goto }) {
  const [providers, setProviders] = useState([]);
  const [editing, setEditing] = useState(null); // null=关闭 {}=新建 {...}=编辑
  const [busy, setBusy] = useState(false);
  const [relayModels, setRelayModels] = useState(null); // /v1/models 拉取结果

  const load = async () => {
    try { setProviders(await window.rs.ocList()); } catch (e) { toast(e.message, 'bad'); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setBusy(true);
    try {
      const r = await window.rs.ocSave(editing);
      if (r.ok) {
        toast(`Provider「${editing.id}」已写入 ~/.config/opencode/opencode.json — 重启 opencode 生效`, 'ok');
        if (r.hasComments) toast('原配置文件含注释,写回后注释已丢失', 'warn');
        setEditing(null); await load();
      } else toast(r.error, 'bad');
    } finally { setBusy(false); }
  };

  const remove = async (id) => {
    const r = await window.rs.ocRemove(id);
    if (r.ok) { toast(`已移除 ${id}(备份已保留)`, 'ok'); await load(); }
    else toast(r.error, 'bad');
  };

  return (
    <div>
      {/* Provider 列表 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <div className="klabel"><Icon name="bolt" size={12} style={{ color: 'var(--gold)' }} /> OpenCode Providers</div>
          <button className="btn btn-sm btn-gold" onClick={() => setEditing({ id: '', name: '', protocol: 'chat', baseUrl: '', apiKey: '', models: [], defaultModel: '' })}>
            <Icon name="plus" size={11} /> 新建 Provider
          </button>
        </div>
        {providers.length === 0 && (
          <div className="muted" style={{ padding: '20px 0', textAlign: 'center' }}>
            尚无 provider — 从你的中转站库选一个站,RS 自动拉取模型清单并填入参数
          </div>
        )}
        {providers.map(p => (
          <div key={p.id} className="parse-preview" style={{ marginBottom: 8 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <b>{p.name || p.id}</b>
                <span className="badge" style={{ marginLeft: 8 }}>{p.protocol}</span>
                <span className="muted" style={{ marginLeft: 8, fontSize: 11 }}>{p.models.length} 模型</span>
                {p.defaultModel && <span className="muted" style={{ marginLeft: 8, fontSize: 11 }}>默认 {p.defaultModel}</span>}
              </div>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn btn-sm" onClick={() => setEditing(p)}>编辑</button>
                <button className="btn btn-sm" onClick={() => remove(p.id)}>移除</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 新建/编辑 Modal */}
      <Modal open={!!editing} width={720} onClose={() => setEditing(null)}
        footer={<>
          <button className="btn btn-sm" onClick={() => setEditing(null)}>取消</button>
          <button className="btn btn-sm btn-gold" disabled={busy} onClick={save}>
            {busy ? <><Spinner size={11} /> 写入中…</> : '写入 opencode.json'}
          </button>
        </>}>
        {editing && <ProviderForm data={editing} setData={setEditing}
          relays={state.relays || []} relayModels={relayModels}
          onFetchModels={async (relayId) => {
            setRelayModels(null);
            const r = await window.rs.ocFetchModels(relayId);
            if (r.ok) setRelayModels(r.models);
            else toast(r.error, 'warn');
          }} />}
      </Modal>
    </div>
  );
}

function ProviderForm({ data, setData, relays, relayModels, onFetchModels }) {
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label="中转站(选库或手写)">
        <select value={data.relayId || ''} onChange={e => {
          const r = relays.find(x => x.id === e.target.value);
          if (r) { set('relayId', r.id); set('baseUrl', r.baseUrl); set('name', r.name); set('id', r.name.toLowerCase().replace(/[^a-z0-9]/g, '-')); }
          else set('relayId', '');
        }}>
          <option value="">— 手写 —</option>
          {relays.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        {data.relayId && <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => onFetchModels(data.relayId)}>
          <Icon name="refresh" size={11} /> 拉 /v1/models
        </button>}
      </Field>
      <Field label="Base URL">
        <input type="text" value={data.baseUrl} onChange={e => set('baseUrl', e.target.value)} placeholder="https://api.example.com/v1" style={{ width: '100%' }} />
      </Field>
      <Field label="协议类型">
        <div className="row" style={{ gap: 8 }}>
          {PROTOCOLS.map(p => (
            <span key={p.value} className={'chip' + (data.protocol === p.value ? ' on' : '')}
              onClick={() => set('protocol', p.value)} title={p.desc}>{p.label}</span>
          ))}
        </div>
      </Field>
      <Field label="Provider ID">
        <input type="text" value={data.id} onChange={e => set('id', e.target.value)} placeholder="my-relay" style={{ width: 200 }} />
      </Field>
      <Field label="API Key(写入 auth.json,不进 opencode.json)">
        <input type="password" value={data.apiKey} onChange={e => set('apiKey', e.target.value)} style={{ width: '100%' }} />
      </Field>
      <ModelEntries data={data} setData={setData} relayModels={relayModels} />
      <Field label="默认模型">
        <select value={data.defaultModel} onChange={e => set('defaultModel', e.target.value)}>
          <option value="">— 不设默认 —</option>
          {data.models.map(m => <option key={m.id} value={`${data.id}/${m.id}`}>{data.id}/{m.id}</option>)}
        </select>
      </Field>
    </div>
  );
}

function ModelEntries({ data, setData, relayModels }) {
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));
  const toggleModel = (modelId) => {
    const exists = data.models.find(m => m.id === modelId);
    if (exists) set('models', data.models.filter(m => m.id !== modelId));
    else set('models', [...data.models, { id: modelId, name: modelId, limit: { context: 0, output: 0 }, reasoning: false, options: {} }]);
  };
  const updateModel = (modelId, field, value) => {
    set('models', data.models.map(m => m.id === modelId ? { ...m, [field]: value } : m));
  };
  return (
    <div>
      <div className="klabel">模型条目(勾选 / 手动添加)</div>
      {relayModels && (
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {relayModels.map(id => (
            <span key={id} className={'chip' + (data.models.find(m => m.id === id) ? ' on' : '')}
              onClick={() => toggleModel(id)}>{id}</span>
          ))}
        </div>
      )}
      {data.models.length === 0 && <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>从上面勾选,或在下方手动添加</div>}
      {data.models.map(m => (
        <div key={m.id} className="parse-preview" style={{ marginBottom: 8, padding: '8px 12px' }}>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <b style={{ fontSize: 12 }}>{m.id}</b>
            <input type="text" value={m.name} onChange={e => updateModel(m.id, 'name', e.target.value)}
              placeholder="显示名" style={{ width: 140, fontSize: 11 }} />
            <input type="number" value={m.limit.context} onChange={e => updateModel(m.id, 'limit', { ...m.limit, context: Number(e.target.value) })}
              placeholder="ctx" style={{ width: 90, fontSize: 11 }} />
            <input type="number" value={m.limit.output} onChange={e => updateModel(m.id, 'limit', { ...m.limit, output: Number(e.target.value) })}
              placeholder="out" style={{ width: 90, fontSize: 11 }} />
            <label className="muted" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={m.reasoning} onChange={e => updateModel(m.id, 'reasoning', e.target.checked)} /> 推理
            </label>
            <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => toggleModel(m.id)}>×</button>
          </div>
        </div>
      ))}
      <button className="btn btn-sm" onClick={() => set('models', [...data.models, { id: '', name: '', limit: { context: 0, output: 0 }, reasoning: false, options: {} }])}>
        <Icon name="plus" size={10} /> 手动添加模型
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Build + lint**

Run: `npx vite build && node lint-imports.js`
Expected: 无报错

- [ ] **Step 3: 冒烟(现有场景)+ 手动测试**

Run: `npm run smoke`
Expected: 39/39

- [ ] **Step 4: Commit**

```bash
git add src/pages/OpenCode.jsx
git commit -m "feat: OpenCode 页面 — Provider 管理 UI(列表+表单+模型勾选+协议三选一)"
```

---

### Task 5: 全量验证 + 版本号 + 发版

**Files:**
- Modify: `package.json` / `package-lock.json`(版本号 → 1.12.0)
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 全量测试 + lint + 冒烟**

Run: `node --test test/*.test.js && node lint-imports.js && npm run smoke`
Expected: 全绿(78+ 单测,39 冒烟)

- [ ] **Step 2: 版本号 1.12.0 + CHANGELOG**

- [ ] **Step 3: Commit + push + build + Release**

```bash
git add -A
git commit -m "feat(v1.12.0): OpenCode provider 管理 + 导航重构"
git push origin main
npm run dist
# 发 Release(走既有流程)
```
