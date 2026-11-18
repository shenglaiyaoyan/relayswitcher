'use strict';
/* Test: 目录版本对比 — 内置快照 vs 本机提取的 slug 差异 */
const { test } = require('node:test');
const assert = require('node:assert');
const { diffCatalogSlugs, pickOfficialSource } = require('../electron/lib/catalog-diff.js');

const OLD12 = ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6.1-terra', 'gpt-5.5'];
const NEW14 = ['gpt-6.2-sol', 'gpt-6.2-astra', ...OLD12];

test('目录源：选本机提取但内置快照更新（包含本机全部且多出新模型）→ 用内置快照', () => {
  assert.deepStrictEqual(pickOfficialSource('extracted', NEW14, OLD12), { source: 'builtin', builtinNewer: true });
});

test('目录源：本机提取有内置没有的新模型 / 两边一致 / 两边各有独有 → 照旧用本机提取', () => {
  assert.deepStrictEqual(pickOfficialSource('extracted', OLD12, NEW14), { source: 'extracted', builtinNewer: false });
  assert.deepStrictEqual(pickOfficialSource('extracted', NEW14, [...NEW14].reverse()), { source: 'extracted', builtinNewer: false });
  assert.deepStrictEqual(pickOfficialSource('extracted', [...OLD12, 'only-builtin'], [...OLD12, 'only-local']), { source: 'extracted', builtinNewer: false });
});

test('目录源：选内置快照、或还没提取过 → 用内置快照', () => {
  assert.deepStrictEqual(pickOfficialSource('builtin', OLD12, NEW14), { source: 'builtin', builtinNewer: false });
  assert.deepStrictEqual(pickOfficialSource('extracted', NEW14, null), { source: 'builtin', builtinNewer: false });
  assert.deepStrictEqual(pickOfficialSource(undefined, NEW14, OLD12), { source: 'builtin', builtinNewer: false });
});

test('接线：切换和设置页都按 pickOfficialSource 选目录，设置页提示内置快照更新', () => {
  const fs = require('fs');
  const path = require('path');
  const main = fs.readFileSync(path.join(__dirname, '../electron/main.js'), 'utf8');
  const resolve = main.slice(main.indexOf('function resolveOfficialCatalog'), main.indexOf('function resolveCatalogContent'));
  assert.match(resolve, /pickOfficialSource\(/);
  const info = main.slice(main.indexOf("ipcMain.handle('rs:getCatalogInfo'"), main.indexOf("ipcMain.handle('rs:setCatalogMode'"));
  assert.match(info, /pickOfficialSource\(/);
  assert.match(info, /info\.builtinNewer/);
  // 旧代码读 best.mtime（字段叫 mt）→ new Date(undefined).toISOString() 抛错 → 本机提取永远显示「解析失败/未提取」
  assert.doesNotMatch(info, /best\.mtime/);
  const settings = fs.readFileSync(path.join(__dirname, '../src/pages/Settings.jsx'), 'utf8');
  assert.match(settings, /catInfo\.builtinNewer/);
  assert.match(settings, /切换时自动用内置快照/);
  assert.doesNotMatch(settings, /官方出新模型后点这里即可同步/, '按钮提示不能再暗示点了就能拿到新模型');
});

test('提取目录新增官方模型 + 缺失快照模型双向列出', () => {
  const d = diffCatalogSlugs(['gpt-5.5', 'gpt-6-astra'], ['gpt-6-astra', 'gpt-6.5-nova']);
  assert.deepStrictEqual(d.added, ['gpt-6.5-nova']);
  assert.deepStrictEqual(d.removed, ['gpt-5.5']);
});

test('完全一致时双向为空', () => {
  const d = diffCatalogSlugs(['a', 'b'], ['b', 'a']);
  assert.deepStrictEqual(d.added, []);
  assert.deepStrictEqual(d.removed, []);
});

test('空输入不抛异常并视为空集', () => {
  const d = diffCatalogSlugs(null, ['x']);
  assert.deepStrictEqual(d.added, ['x']);
  assert.deepStrictEqual(d.removed, []);
  const d2 = diffCatalogSlugs(['x'], undefined);
  assert.deepStrictEqual(d2.removed, ['x']);
});
