'use strict';
/* Test: 中转站模型目录自动生成 — 家族模板匹配/去重/排除/官方形态镜像 */
const { test } = require('node:test');
const assert = require('node:assert');
const { buildRelayCatalog, pickTemplate } = require('../electron/lib/relay-catalog.js');

const BASE = {
  generation: '2026-09-20', models: [
    { slug: 'gpt-6-astra', display_name: 'GPT-6 Astra', base_instructions: 'ASTRA-TEXT', context_window: 872000, supported_reasoning_levels: [{ effort: 'xhigh' }], service_tiers: [{ id: 'priority' }] },
    { slug: 'gpt-5.6-sol', display_name: 'Sol', base_instructions: 'SOL-TEXT', context_window: 372000, supported_reasoning_levels: [{ effort: 'high' }] },
    { slug: 'gpt-5.5', display_name: 'GPT-5.5', base_instructions: 'G55-TEXT', context_window: 272000, supported_reasoning_levels: [{ effort: 'high' }] }
  ]
};

test('gpt-6 家族命中 astra 模板(继承档位/Fast/提示词),slug 与显示名用中转站自己的', () => {
  const cat = buildRelayCatalog(BASE, ['gpt-6.5-nova']);
  assert.strictEqual(cat.models.length, 1);
  const m = cat.models[0];
  assert.strictEqual(m.slug, 'gpt-6.5-nova');
  assert.strictEqual(m.display_name, 'gpt-6.5-nova');
  assert.strictEqual(m.base_instructions, 'ASTRA-TEXT');
  assert.strictEqual(m.context_window, 872000);
  assert.ok(m.service_tiers.some(t => t.id === 'priority'), '应继承 astra 的 Fast 模式');
});

test('非官方家族(如 glm)回落默认满血模板,元数据完整', () => {
  const cat = buildRelayCatalog(BASE, ['glm-5.3-air']);
  assert.strictEqual(cat.models[0].base_instructions, 'ASTRA-TEXT', '默认模板应为 gpt-6-astra');
});

test('gpt-5.4 命中 5.5 模板;gpt-5.6 命中 sol 模板', () => {
  const cat = buildRelayCatalog(BASE, ['gpt-5.4-turbo', 'gpt-5.6-luna-x']);
  const bySlug = Object.fromEntries(cat.models.map(m => [m.slug, m]));
  assert.strictEqual(bySlug['gpt-5.4-turbo'].base_instructions, 'G55-TEXT');
  assert.strictEqual(bySlug['gpt-5.6-luna-x'].base_instructions, 'SOL-TEXT');
});

test('模板无 base_instructions 时派生条目同样不带(镜像官方 2026-09-23 形态)', () => {
  const NOBI = { generation: '2026-09-23', models: [
    { slug: 'gpt-6-astra', display_name: 'GPT-6 Astra', context_window: 872000, supported_reasoning_levels: [{ effort: 'xhigh' }], service_tiers: [{ id: 'priority' }] }
  ] };
  const cat = buildRelayCatalog(NOBI, ['gpt-6.5-nova']);
  assert.strictEqual(cat.models.length, 1);
  assert.ok(!('base_instructions' in cat.models[0]), '不得注入外来提示词');
  assert.strictEqual(cat.models[0].context_window, 872000, '其余元数据照常继承');
});

test('去重 + 非法 ID + 非对话类(embedding/whisper/tts)被排除', () => {
  const cat = buildRelayCatalog(BASE, ['glm-5.3', 'glm-5.3', '', 'bad slug!', 'text-embedding-3', 'whisper-1', 'tts-1-hd']);
  assert.deepStrictEqual(cat.models.map(m => m.slug), ['glm-5.3']);
});

test('空清单/全非法清单明确报错', () => {
  assert.throws(() => buildRelayCatalog(BASE, []), /清单为空/);
  assert.throws(() => buildRelayCatalog(BASE, null), /清单为空/);
  assert.throws(() => buildRelayCatalog(BASE, ['!!!', '']), /没有可用/);
});

test('pickTemplate 家族规则独立可测', () => {
  const avail = ['gpt-6-astra', 'gpt-5.6-sol', 'gpt-5.5'];
  assert.strictEqual(pickTemplate('gpt-6.1', avail), 'gpt-6-astra');
  assert.strictEqual(pickTemplate('gpt-5.5-codex', avail), 'gpt-5.5');
  assert.strictEqual(pickTemplate('claude-opus-4', avail), 'gpt-6-astra');
});
