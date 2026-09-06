'use strict';
/* Test: 内置模型目录 schema 合规 — 所有模型必须有 base_instructions
   背景:2026-09-06 另一台机器实测,catalog 缺该字段时 codex 启动直接报
   "missing field base_instructions" 打不开对话页(Codex 26.901.5003+ 必填)。 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const CATALOG = path.join(__dirname, '..', 'resources', 'model-catalog.json');

test('catalog 所有模型条目都含 base_instructions(非空字符串)', () => {
  const d = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  assert.ok(Array.isArray(d.models) && d.models.length > 0, 'models 数组应为非空');
  const bad = d.models.filter(m => typeof m.base_instructions !== 'string' || m.base_instructions.length === 0);
  assert.deepStrictEqual(bad.map(m => m.slug), [], '以下模型缺 base_instructions: ' + bad.map(m => m.slug).join(', '));
});

test('catalog 含切换默认模型 gpt-6-astra 且字段完整', () => {
  const d = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  const astra = d.models.find(m => m.slug === 'gpt-6-astra');
  assert.ok(astra, '缺 gpt-6-astra 条目');
  for (const key of ['base_instructions', 'context_window', 'max_context_window', 'supported_reasoning_levels', 'service_tiers']) {
    assert.ok(astra[key] != null, `gpt-6-astra 缺关键字段 ${key}`);
  }
});
