'use strict';
/* Test: 官方目录跟进策略 — 6 系补入/校准、5.6 系替换隐藏、terra 退役(2026-09-23 用户指令) */
const { test } = require('node:test');
const assert = require('node:assert');
const { applyCatalogPatch } = require('../electron/lib/catalog-patch.js');

const BASE = {
  generation: 'test', models: [
    { slug: 'gpt-6-astra', display_name: 'GPT-6-Astra', context_window: 272000, max_context_window: 872000, default_reasoning_level: 'low', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'xhigh' }] },
    { slug: 'gpt-5.6-sol', display_name: 'GPT-5.6-Sol', context_window: 272000, max_context_window: 872000, default_reasoning_level: 'low', supported_reasoning_levels: [{ effort: 'low' }] },
    { slug: 'gpt-5.6-terra', display_name: 'GPT-5.6-Terra', context_window: 272000, max_context_window: 872000, default_reasoning_level: 'medium', supported_reasoning_levels: [{ effort: 'low' }] },
    { slug: 'gpt-5.6-luna', display_name: 'GPT-5.6-Luna', context_window: 272000, max_context_window: 872000, default_reasoning_level: 'medium', supported_reasoning_levels: [{ effort: 'low' }] },
    { slug: 'gpt-5.5', display_name: 'GPT-5.5', context_window: 272000, max_context_window: 272000, default_reasoning_level: 'medium', supported_reasoning_levels: [{ effort: 'low' }] }
  ]
};

test('官方模式:补入 gpt-6-sol/luna/6.1-sol(官方参数),5.6 系并存,terra 退役', () => {
  const out = applyCatalogPatch(BASE, { addMissing: true });
  const bySlug = Object.fromEntries(out.models.map(m => [m.slug, m]));
  assert.ok(bySlug['gpt-6-sol'], '应补入 gpt-6-sol');
  assert.ok(bySlug['gpt-6-luna'], '应补入 gpt-6-luna');
  assert.ok(bySlug['gpt-6.1-sol'], '应补入 gpt-6.1-sol(exe 滞后桥接)');
  assert.equal(bySlug['gpt-6.1-sol'].context_window, 500000, '6.1-sol 默认上下文按 Codex 0.170.0 官方目录 500K');
  assert.equal(bySlug['gpt-6.1-sol'].description, 'Previous generation model for coding and everyday work.', '描述跟官方目录（6.2 已是最新）');
  assert.equal(bySlug['gpt-6-sol'].description, 'Legacy model for coding and everyday work.');
  assert.equal(bySlug['gpt-6.1-sol'].max_context_window, 872000, '6.1-sol 硬顶按客户端目录 872K(文档 4M 不可信)');
  assert.equal(bySlug['gpt-6.1-sol'].default_reasoning_level, 'low', '6.1-sol 原生默认 low(文档 high 不可信)');
  assert.deepEqual(bySlug['gpt-6.1-sol'].supported_reasoning_levels.map(r => r.effort), ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'], '6.1-sol 含 max+ultra(原生全梯)');
  const astraTiers = (bySlug['gpt-6-astra'].service_tiers || []).map(t => t.id);
  assert.ok(astraTiers.includes('ultrafast'), 'astra 补声明 Ultra Fast 档(选择器目录驱动)');
  const sol61Tiers = (bySlug['gpt-6.1-sol'].service_tiers || []).map(t => t.id);
  assert.ok(sol61Tiers.includes('priority') && sol61Tiers.includes('ultrafast'), '6.1-sol 声明 Fast + Ultra Fast');
  assert.equal(bySlug['gpt-6-sol'].context_window, 272000, '软限=压缩线=计费分档线 272K');
  assert.equal(bySlug['gpt-6-sol'].max_context_window, 872000, '硬顶按官方客户端目录 872K');
  assert.equal(bySlug['gpt-6-sol'].default_reasoning_level, 'medium', '官方默认档位 medium');
  assert.deepEqual(bySlug['gpt-6-sol'].supported_reasoning_levels.map(r => r.effort), ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'], 'sol 追加 ultra(客户端专属档,文档不列)');
  assert.deepEqual(bySlug['gpt-6-luna'].supported_reasoning_levels.map(r => r.effort), ['low', 'medium', 'high', 'xhigh', 'max'], 'luna 系历代无 ultra');
  assert.equal(bySlug['gpt-6-sol'].display_name, 'GPT-6-Sol');
  assert.ok(bySlug['gpt-5.6-sol'] && bySlug['gpt-5.6-luna'], '5.6-sol/luna 恢复显示(2026-09-24 用户指令)');
  assert.ok(!bySlug['gpt-5.6-terra'], 'terra 维持退役(用户指令)');
  assert.ok(bySlug['gpt-6-astra'] && bySlug['gpt-5.5'], '未涉及条目保持');
});

test('中转模式:未提供 6 系时不做加法,terra 仍退役,5.6 系保留可用', () => {
  const relayLike = { generation: 't', models: [
    BASE.models[1], // gpt-5.6-sol
    BASE.models[2], // gpt-5.6-terra
    { slug: 'glm-5.3', display_name: 'glm-5.3', context_window: 200000, default_reasoning_level: 'medium', supported_reasoning_levels: [{ effort: 'low' }] }
  ] };
  const out = applyCatalogPatch(relayLike, { addMissing: false });
  const slugs = out.models.map(m => m.slug);
  assert.deepEqual(slugs, ['gpt-5.6-sol', 'glm-5.3'], '不加 6 系、terra 退役、其余保留');
});

test('中转模式:提供了 gpt-6-sol 时与 5.6-sol 并存(不再隐藏)并校准参数', () => {
  const relayLike = { generation: 't', models: [
    BASE.models[0], // gpt-6-astra(模板来源)
    BASE.models[1], // gpt-5.6-sol
    { slug: 'gpt-6-sol', display_name: 'gpt-6-sol', context_window: 872000, max_context_window: 872000, default_reasoning_level: 'low', supported_reasoning_levels: [{ effort: 'low' }] }
  ] };
  const out = applyCatalogPatch(relayLike, { addMissing: false });
  const bySlug = Object.fromEntries(out.models.map(m => [m.slug, m]));
  assert.ok(bySlug['gpt-5.6-sol'], '5.6-sol 与 6-sol 并存(2026-09-24 起不再隐藏)');
  assert.equal(bySlug['gpt-6-sol'].context_window, 272000, '校准为官方软限');
  assert.equal(bySlug['gpt-6-sol'].max_context_window, 872000, '校准为官方硬顶');
  assert.equal(bySlug['gpt-6-sol'].default_reasoning_level, 'medium');
});

const SOL62 = { slug: 'gpt-6.2-sol', display_name: 'GPT-6.2-Sol', description: 'Fast, go-to model for coding and everyday work.',
  context_window: 500000, max_context_window: 872000, default_reasoning_level: 'low', priority: 1, minimal_client_version: '0.166.0',
  supported_reasoning_levels: [{ effort: 'low' }, { effort: 'ultra' }], model_messages: { instructions_template: 'SOL62' },
  service_tiers: [{ id: 'priority', name: 'Fast', description: '2x speed, increased usage' }], additional_speed_tiers: ['fast'] };
const ASTRA62 = { ...SOL62, slug: 'gpt-6.2-astra', display_name: 'GPT-6.2-Astra', context_window: 272000, priority: 2,
  description: 'Our most capable model for complex coding and professional work.', model_messages: { instructions_template: 'ASTRA62' } };

test('GPT-6.2 Sol / Astra：只补声明 Ultra Fast 档（官方文档 2026-11-17 两款都支持），其余保持原生', () => {
  for (const addMissing of [true, false]) {
    const out = applyCatalogPatch({ generation: 't', models: [BASE.models[0], SOL62, ASTRA62] }, { addMissing });
    const bySlug = Object.fromEntries(out.models.map(m => [m.slug, m]));
    for (const native of [SOL62, ASTRA62]) {
      const m = bySlug[native.slug];
      assert.deepEqual(m.service_tiers.map(t => t.id), ['priority', 'ultrafast'], native.slug);
      assert.deepEqual(m.additional_speed_tiers, ['fast', 'ultrafast'], native.slug);
      for (const k of ['display_name', 'description', 'context_window', 'max_context_window', 'default_reasoning_level',
        'priority', 'minimal_client_version', 'supported_reasoning_levels', 'model_messages']) {
        assert.deepEqual(m[k], native[k], `${native.slug}.${k} 保持原生`);
      }
    }
    assert.deepEqual(out.models.slice(0, 3).map(m => m.slug), ['gpt-6-astra', 'gpt-6.2-sol', 'gpt-6.2-astra'], '位置不变');
  }
});

test('目录里没有 GPT-6.2（旧版 codex.exe 提取的目录）：不补入、不报错', () => {
  const out = applyCatalogPatch(BASE, { addMissing: true });
  assert.ok(!out.models.some(m => /^gpt-6\.2-/.test(m.slug)), '6.2 只做校准，不凭空补入');
});

test('真实内置目录过补丁：6.2 两款带 Ultra Fast，6.1-sol 保持官方 500K', () => {
  const real = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '../resources/model-catalog.json'), 'utf8'));
  const out = applyCatalogPatch(real, { addMissing: true });
  const bySlug = Object.fromEntries(out.models.map(m => [m.slug, m]));
  assert.equal(out.models.length, 13, '14 个减去退役的 gpt-5.6-terra');
  for (const slug of ['gpt-6.2-sol', 'gpt-6.2-astra', 'gpt-6-astra', 'gpt-6.1-sol']) {
    assert.ok(bySlug[slug].service_tiers.some(t => t.id === 'ultrafast'), slug + ' 有 Ultra Fast');
  }
  assert.equal(bySlug['gpt-6.2-sol'].context_window, 500000);
  assert.equal(bySlug['gpt-6.2-astra'].context_window, 272000);
  assert.equal(bySlug['gpt-6.1-sol'].context_window, 500000);
  assert.equal(out.models[0].slug, 'gpt-6.2-sol');
  // 原生条目已存在 → 以它自己为底校准，不再抄 6-astra 的速度档、排序号和提示词
  const native = Object.fromEntries(real.models.map(m => [m.slug, m]));
  for (const slug of ['gpt-6-sol', 'gpt-6-luna']) {
    assert.deepEqual(bySlug[slug].service_tiers, native[slug].service_tiers, slug + ' 只有官方的 Fast（官方 Speed 文档：Ultrafast 不含 6-sol/6-luna）');
    assert.deepEqual(bySlug[slug].additional_speed_tiers, native[slug].additional_speed_tiers, slug);
  }
  for (const slug of ['gpt-6.1-sol', 'gpt-6-sol', 'gpt-6-luna']) {
    assert.equal(bySlug[slug].priority, native[slug].priority, slug + ' 排序号保持官方');
    assert.deepEqual(bySlug[slug].model_messages, native[slug].model_messages, slug + ' 提示词保持官方');
  }
});

test('内嵌快照追上后(原生条目已存在):该条目退化为参数校准,仍缺失的照常补入', () => {
  const caught = { generation: 't', models: [
    BASE.models[0],
    { slug: 'gpt-6-sol', display_name: 'GPT-6-Sol', context_window: 900000, max_context_window: 900000, default_reasoning_level: 'low', supported_reasoning_levels: [{ effort: 'low' }] }
  ] };
  const out = applyCatalogPatch(caught, { addMissing: true });
  const sol = out.models.find(m => m.slug === 'gpt-6-sol');
  assert.equal(sol.context_window, 272000, '按官方参数校准软限');
  assert.equal(sol.max_context_window, 872000, '按官方参数校准硬顶');
  assert.equal(out.models.filter(m => m.slug === 'gpt-6-sol').length, 1, '不重复添加');
  assert.ok(out.models.some(m => m.slug === 'gpt-6-luna'), '仍缺失的 luna 照常补入');
});
