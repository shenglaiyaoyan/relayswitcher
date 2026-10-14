'use strict';
/* Test: catalog-merge.js — 自定义模型合并进目录 */
const { test } = require('node:test');
const assert = require('node:assert');
const { mergeCustomModels } = require('../electron/lib/catalog-merge.js');


/* ---------------- v1.12.9:模板缺席但目标条目已在目录时,用自身当底校准(中转模式) ---------------- */

test('mergeCustomModels: 模板不在目录但 slug 已存在 → 用既有条目当底,不炸(站清单无 astra 的中转场景)', () => {
  const catalog = { models: [
    { slug: 'gpt-6-sol', display_name: 'GPT-6-Sol', context_window: 128000,
      supported_reasoning_levels: [{ effort: 'low' }], service_tiers: ['standard'] }
  ] };
  const out = mergeCustomModels(catalog, [
    { templateSlug: 'gpt-6-astra', slug: 'gpt-6-sol', displayName: 'GPT-6-Sol',
      contextWindow: 272000, defaultEffort: 'medium',
      reasoningLevels: ['low', 'medium', 'high', 'xhigh', 'max'] }
  ]);
  const sol = out.models.find(m => m.slug === 'gpt-6-sol');
  assert.equal(sol.context_window, 272000, '校准覆盖生效(以既有条目为底)');
  assert.equal(sol.default_reasoning_level, 'medium');
  assert.equal(sol.supported_reasoning_levels.length, 5);
});

test('mergeCustomModels: 模板与 slug 都不在目录 → 仍然报错(真配置错误不放过)', () => {
  assert.throws(() => mergeCustomModels({ models: [] }, [
    { templateSlug: 'gpt-6-astra', slug: 'gpt-6-sol' }
  ]), /模板 gpt-6-astra 不存在于目录/);
});
