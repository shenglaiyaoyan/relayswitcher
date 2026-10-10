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

