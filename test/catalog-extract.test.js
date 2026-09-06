'use strict';
/* Test: catalog-extract 提取器(锚点/校验/兜底)与 catalog-merge(自定义模型派生) */
const { test } = require('node:test');
const assert = require('node:assert');
const { extractCatalogFromBuffer } = require('../electron/lib/catalog-extract.js');
const { mergeCustomModels } = require('../electron/lib/catalog-merge.js');

function fakeBin(models) {
  const json = '{\n  "models": [\n' + models.map(m => '    ' + JSON.stringify(m)).join(',\n') + '\n  ]\n}';
  return Buffer.concat([Buffer.from('MZ\x90\x00 garbage header...'), Buffer.from(json), Buffer.from('...trailing binary')]);
}

const FULL = { slug: 'gpt-5.5', base_instructions: 'FULL-TEXT', context_window: 272000, supported_reasoning_levels: [{ effort: 'low' }], service_tiers: [{ id: 'priority' }] };
const PARTIAL = { slug: 'gpt-6-astra', context_window: 272000 };

test('提取:正常锚点解析 + 缺 base_instructions 自动兜底并报告', () => {
  const { catalog, report } = extractCatalogFromBuffer(fakeBin([FULL, PARTIAL]));
  assert.equal(report.modelCount, 2);
  assert.deepEqual(report.patchedSlugs, ['gpt-6-astra']);
  assert.equal(catalog.models[1].base_instructions, 'FULL-TEXT');
});

test('提取:目录内自带兜底源(优先 gpt-5.5)', () => {
  const donor = { slug: 'other-model', base_instructions: 'OTHER' };
  const { catalog, report } = extractCatalogFromBuffer(fakeBin([donor, PARTIAL, FULL]));
  assert.equal(catalog.models[1].base_instructions, 'FULL-TEXT', '应优先用 gpt-5.5 的文本而非第一个出现者');
  assert.deepEqual(report.patchedSlugs, ['gpt-6-astra']);
});

test('提取:外部注入 fallbackInstructions 优先级最高', () => {
  const { catalog } = extractCatalogFromBuffer(fakeBin([FULL, PARTIAL]), { fallbackInstructions: 'EXTERNAL' });
  assert.equal(catalog.models[1].base_instructions, 'EXTERNAL');
});

test('提取:无锚点 / 无可兜底文本时明确报错', () => {
  assert.throws(() => extractCatalogFromBuffer(Buffer.from('no anchor here')), /锚点/);
  const lone = { slug: 'only', base_instructions: '' };
  assert.throws(() => extractCatalogFromBuffer(fakeBin([lone])), /无可用兜底/);
});

test('合并:自定义模型派生 + 同 slug 改写', () => {
  const cat = { models: [JSON.parse(JSON.stringify(FULL))] };
  const merged = mergeCustomModels(cat, [
    { templateSlug: 'gpt-5.5', slug: 'my-custom-6', displayName: '我的6', contextWindow: 400000 }
  ]);
  assert.equal(merged.models.length, 2);
  const custom = merged.models.find(m => m.slug === 'my-custom-6');
  assert.equal(custom.display_name, '我的6');
  assert.equal(custom.context_window, 400000);
  assert.equal(custom.base_instructions, 'FULL-TEXT', '继承模板 base_instructions');
  assert.equal(cat.models.length, 1, '原目录不可变');

  const rewritten = mergeCustomModels(cat, [{ templateSlug: 'gpt-5.5', slug: 'gpt-5.5', contextWindow: 999999 }]);
  assert.equal(rewritten.models.length, 1);
  assert.equal(rewritten.models[0].context_window, 999999);
});

test('合并:坏配置(模板不存在/slug 非法)明确报错', () => {
  const cat = { models: [FULL] };
  assert.throws(() => mergeCustomModels(cat, [{ templateSlug: 'nope', slug: 'x' }]), /模板.*不存在/);
  assert.throws(() => mergeCustomModels(cat, [{ templateSlug: 'gpt-5.5', slug: 'bad slug!' }]), /非法/);
});
