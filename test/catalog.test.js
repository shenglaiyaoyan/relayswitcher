'use strict';
/* Test: 内置模型目录 schema 合规。
   内置快照来自旧版官方 exe(自带 base_instructions);2026-09-23 起新版官方内嵌目录
   已不再含该字段(客户端按需获取),该字段现为可选,不再强制校验。 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const CATALOG = path.join(__dirname, '..', 'resources', 'model-catalog.json');

test('catalog 条目结构合规(models 非空、slug 必有且唯一)', () => {
  const d = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  assert.ok(Array.isArray(d.models) && d.models.length > 0, 'models 数组应为非空');
  const slugs = d.models.map(m => m.slug);
  assert.ok(slugs.every(Boolean), '所有条目必须有 slug');
  assert.equal(new Set(slugs).size, slugs.length, 'slug 不得重复');
});

test('catalog 含切换默认模板 gpt-6-astra 且关键元数据完整', () => {
  const d = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  const astra = d.models.find(m => m.slug === 'gpt-6-astra');
  assert.ok(astra, '缺 gpt-6-astra 条目');
  for (const key of ['context_window', 'max_context_window', 'supported_reasoning_levels', 'service_tiers']) {
    assert.ok(astra[key] != null, `gpt-6-astra 缺关键字段 ${key}`);
  }
});
