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

test('mergeProviderBlock: 不变异输入 existing(纯函数契约)', () => {
  const existing = { model: 'other/m9', provider: { myrelay: { npm: 'old' }, keep: { npm: 'y' } } };
  const snapshot = JSON.parse(JSON.stringify(existing));
  const pd = { id: 'myrelay', npm: '@ai-sdk/openai-compatible', name: 'My Relay',
    options: { baseURL: 'https://api.example.com/v1' }, models: {} };
  const out = mergeProviderBlock(existing, pd);
  assert.deepEqual(existing, snapshot, '原始 existing 深比较未被修改');
  assert.equal(existing.provider.myrelay.npm, 'old', '原对象里的旧 provider 保持');
  assert.equal(out.provider.myrelay.npm, '@ai-sdk/openai-compatible', '输出里是新版');
  assert.equal(out.provider.keep.npm, 'y');
});

test('readOpenCodeConfig: 纯 JSON 含 https:// URL 不误报 _hasComments', () => {
  const home = mkHome();
  fs.writeFileSync(path.join(home, '.config/opencode/opencode.json'),
    JSON.stringify({ provider: { myrelay: { options: { baseURL: 'https://api.example.com/v1' } } } }));
  const cfg = readOpenCodeConfig(home);
  assert.equal(cfg._hasComments, undefined, 'URL 里的 // 不算注释');
});

test('readAuthFile: auth.json 损坏时抛异常而非返回空对象', () => {
  const home = mkHome();
  fs.writeFileSync(path.join(home, '.local/share/opencode/auth.json'), '{broken json');
  assert.throws(() => readAuthFile(home), /auth\.json 解析失败/);
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
