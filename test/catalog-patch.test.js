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

test('官方模式:补入 gpt-6-sol/luna(官方参数),隐藏被替代的 5.6 系与 terra,其余不动', () => {
  const out = applyCatalogPatch(BASE, { addMissing: true });
  const bySlug = Object.fromEntries(out.models.map(m => [m.slug, m]));
  assert.ok(bySlug['gpt-6-sol'], '应补入 gpt-6-sol');
  assert.ok(bySlug['gpt-6-luna'], '应补入 gpt-6-luna');
  assert.equal(bySlug['gpt-6-sol'].context_window, 272000, '软限=压缩线=计费分档线 272K');
  assert.equal(bySlug['gpt-6-sol'].max_context_window, 1050000, '硬顶 1.05M');
  assert.equal(bySlug['gpt-6-sol'].default_reasoning_level, 'medium', '官方默认档位 medium');
  assert.deepEqual(bySlug['gpt-6-sol'].supported_reasoning_levels.map(r => r.effort), ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'], 'sol 追加 ultra(客户端专属档,文档不列)');
  assert.deepEqual(bySlug['gpt-6-luna'].supported_reasoning_levels.map(r => r.effort), ['low', 'medium', 'high', 'xhigh', 'max'], 'luna 系历代无 ultra');
  assert.equal(bySlug['gpt-6-sol'].display_name, 'GPT-6-Sol');
  assert.ok(!bySlug['gpt-5.6-sol'] && !bySlug['gpt-5.6-luna'], '被 6 系替代的 5.6 应隐藏');
  assert.ok(!bySlug['gpt-5.6-terra'], 'terra 无对位,退役');
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

test('中转模式:提供了 gpt-6-sol 时隐藏其 5.6 前任并校准参数', () => {
  const relayLike = { generation: 't', models: [
    BASE.models[0], // gpt-6-astra(模板来源)
    BASE.models[1], // gpt-5.6-sol
    { slug: 'gpt-6-sol', display_name: 'gpt-6-sol', context_window: 872000, max_context_window: 872000, default_reasoning_level: 'low', supported_reasoning_levels: [{ effort: 'low' }] }
  ] };
  const out = applyCatalogPatch(relayLike, { addMissing: false });
  const bySlug = Object.fromEntries(out.models.map(m => [m.slug, m]));
  assert.ok(!bySlug['gpt-5.6-sol'], '6 系在场,5.6-sol 隐藏');
  assert.equal(bySlug['gpt-6-sol'].context_window, 272000, '校准为官方软限');
  assert.equal(bySlug['gpt-6-sol'].max_context_window, 1050000, '校准为官方硬顶');
  assert.equal(bySlug['gpt-6-sol'].default_reasoning_level, 'medium');
});

test('内嵌快照追上后(原生条目已存在):该条目退化为参数校准,仍缺失的照常补入', () => {
  const caught = { generation: 't', models: [
    BASE.models[0],
    { slug: 'gpt-6-sol', display_name: 'GPT-6-Sol', context_window: 900000, max_context_window: 900000, default_reasoning_level: 'low', supported_reasoning_levels: [{ effort: 'low' }] }
  ] };
  const out = applyCatalogPatch(caught, { addMissing: true });
  const sol = out.models.find(m => m.slug === 'gpt-6-sol');
  assert.equal(sol.context_window, 272000, '按官方参数校准软限');
  assert.equal(sol.max_context_window, 1050000, '按官方参数校准硬顶');
  assert.equal(out.models.filter(m => m.slug === 'gpt-6-sol').length, 1, '不重复添加');
  assert.ok(out.models.some(m => m.slug === 'gpt-6-luna'), '仍缺失的 luna 照常补入');
});
