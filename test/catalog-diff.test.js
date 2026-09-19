'use strict';
/* Test: 目录版本对比 — 内置快照 vs 本机提取的 slug 差异 */
const { test } = require('node:test');
const assert = require('node:assert');
const { diffCatalogSlugs } = require('../electron/lib/catalog-diff.js');

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
