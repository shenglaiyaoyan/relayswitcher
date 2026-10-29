'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

test('默认模型随 Provider ID / 模型 ID 改名而更新，指向不存在的模型时清空', async () => {
  const d = await import('../src/pages/opencode/draft.mjs');
  const models = [{ id: 'claude-opus-5-5' }, { id: 'org/gpt-6' }];
  const fix = (id, defaultModel) => d.normalizeDefaultModel({ id, models, defaultModel }).defaultModel;
  assert.equal(fix('lovable', 'lovable/claude-opus-5-5'), 'lovable/claude-opus-5-5');
  assert.equal(fix('lovable2', 'lovable/claude-opus-5-5'), 'lovable2/claude-opus-5-5');
  assert.equal(fix('lovable', 'lovable/org/gpt-6'), 'lovable/org/gpt-6');
  assert.equal(fix('lovable', 'lovable/deleted-model'), '');
  assert.equal(fix('lovable', ''), '');
  assert.equal(fix('lovable', 'other/claude-opus-5-5'), 'lovable/claude-opus-5-5');
  const p = { id: 'x', defaultModel: 'x/a', models: [{ id: 'a' }] };
  assert.equal(d.renameModelDefault(p, 'a', 'b').defaultModel, 'x/b');
  assert.equal(d.renameModelDefault(p, 'c', 'b').defaultModel, 'x/a');
});

test('Provider 草稿手动拉取、模型编辑与新增档位保持纯数据操作', async () => {
  const d = await import('../src/pages/opencode/draft.mjs');
  const p = d.newProvider();
  assert.equal(p.relayId, undefined);
  assert.deepEqual(d.providerFetchTarget({ baseUrl: ' https://a.test/v1 ', apiKey: ' k ' }),
    { baseUrl: 'https://a.test/v1', apiKey: 'k' });

  const withModel = d.updateModel({ ...p, models: [d.newModel()] }, 0,
    { id: 'claude-opus-5-5', name: 'Opus' });
  assert.equal(withModel.models[0].name, 'Opus');
  assert.equal(p.models.length, 0);

  const withEffort = d.addEffort(withModel.models[0], ' xhigh ');
  assert.equal(withEffort.effort, 'xhigh');
  assert.deepEqual(withEffort.efforts, ['xhigh']);
  assert.equal(d.addEffort(withEffort, 'xhigh'), withEffort);
  assert.equal(d.addEffort(withEffort, '   '), withEffort);
});
