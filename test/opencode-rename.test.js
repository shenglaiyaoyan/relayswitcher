'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { saveProviderToConfig, renameAuthEntry, PROVIDER_PACKAGES } = require('../electron/lib/opencode.js');

const ANTH = PROVIDER_PACKAGES.message;
const block = name => ({ package: ANTH, name, settings: { baseURL: 'https://p.example.com/v1', apiKey: 'k' }, whitelist: ['m1'],
  models: { m1: { name: 'M1', modelID: 'm1', capabilities: { tools: true } } } });
const pd = (id, over) => ({ id, package: ANTH, name: 'Palgu', settings: { baseURL: 'https://p.example.com/v1', apiKey: 'k' },
  models: [{ id: 'm1', name: 'M1', tool_call: true, efforts: [], effort: '', options: {} }], ...over });

test('改 Provider ID = 改名：写到新 ID、保留 RS 没管的字段、删掉旧块，默认模型跟着改，其它 Provider 不动', () => {
  const cfg = { model: 'palgu/m1', providers: { palgu: block('palgu'), other: block('other') } };
  const snapshot = JSON.parse(JSON.stringify(cfg));
  const out = saveProviderToConfig(cfg, pd('Palgu', { defaultModel: 'Palgu/m1' }), 'palgu');
  assert.deepEqual(Object.keys(out.providers).sort(), ['Palgu', 'other']);
  assert.deepEqual(out.providers.Palgu.whitelist, ['m1'], '旧块里 RS 没建模的字段要带过去');
  assert.equal(out.model, 'Palgu/m1');
  assert.deepEqual(out.providers.other, snapshot.providers.other);
  assert.deepEqual(cfg, snapshot, '不改传入的配置');
  const three = { providers: { a: block('a'), palgu: block('palgu'), z: block('z') } };
  assert.deepEqual(Object.keys(saveProviderToConfig(three, pd('Palgu'), 'palgu').providers), ['a', 'Palgu', 'z'], '改名后保持原来的位置');
});

test('改名时旧块是旧形态（provider/npm/options）也能迁走，不留旧块', () => {
  const cfg = { provider: { old: { npm: '@ai-sdk/anthropic', options: { baseURL: 'https://o.example.com/v1' }, models: {} } } };
  const out = saveProviderToConfig(cfg, pd('fresh'), 'old');
  assert.ok(out.providers.fresh);
  assert.equal(out.provider, undefined);
  assert.equal(out.providers.fresh.npm, undefined);
  assert.equal(out.providers.fresh.options, undefined);
});

test('新 ID 已被别的 Provider 占用：改名和新建都报错，不覆盖', () => {
  const cfg = { providers: { a: block('a'), b: block('b') } };
  assert.throws(() => saveProviderToConfig(cfg, pd('b'), 'a'), /「b」已存在/);
  assert.throws(() => saveProviderToConfig(cfg, pd('b'), ''), /「b」已存在/);
  assert.throws(() => saveProviderToConfig({ provider: { b: block('b') } }, pd('b'), ''), /「b」已存在/);
});

test('ID 没变就是普通保存', () => {
  const cfg = { providers: { a: block('a') } };
  const out = saveProviderToConfig(cfg, pd('a', { name: 'A2' }), 'a');
  assert.equal(out.providers.a.name, 'A2');
  assert.equal(Object.keys(out.providers).length, 1);
  assert.ok(saveProviderToConfig({}, pd('new'), '').providers.new, '新建不存在的 ID 正常写入');
});

test('auth.json 里以旧 ID 存的 Key 跟着改名，新 ID 已有条目时不覆盖', () => {
  assert.deepEqual(renameAuthEntry({ palgu: { type: 'api', key: 'x' }, z: 1 }, 'palgu', 'Palgu'),
    { auth: { Palgu: { type: 'api', key: 'x' }, z: 1 }, changed: true });
  const keep = { palgu: { key: 'old' }, Palgu: { key: 'new' } };
  assert.deepEqual(renameAuthEntry(keep, 'palgu', 'Palgu'), { auth: keep, changed: false });
  const none = { z: 1 };
  assert.deepEqual(renameAuthEntry(none, 'palgu', 'Palgu'), { auth: none, changed: false });
});

test('接线：编辑器保存时带上原 ID，主进程按改名保存并同步 RS 记录和 auth.json', () => {
  const main = fs.readFileSync(path.join(__dirname, '../electron/main.js'), 'utf8');
  const save = main.slice(main.indexOf("ipcMain.handle('rs:oc:save'"), main.indexOf("ipcMain.handle('rs:oc:remove'"));
  assert.match(save, /oc\.saveProviderToConfig\(cfg, \{/);
  assert.match(save, /p\.originalId/);
  assert.match(save, /store\.deleteOpenCodeProvider\(p\.originalId\)/);
  assert.match(save, /oc\.renameAuthEntry\(/);
  const page = fs.readFileSync(path.join(__dirname, '../src/pages/OpenCode.jsx'), 'utf8');
  assert.match(page, /originalId: base\.id \|\| ''/);
});
