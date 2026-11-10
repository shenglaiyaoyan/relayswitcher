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

test('新模型推理与温度默认「未设置」，没有附件字段', async () => {
  const d = await import('../src/pages/opencode/draft.mjs');
  const m = d.newModel('x');
  assert.equal(m.reasoning, 'unset');
  assert.equal(m.temperature, 'unset');
  assert.equal('attachment' in m, false);
});

test('moveEffort：把档位移到目标位置，返回新数组，不改原数组；越界或原地不动返回原数组', async () => {
  const d = await import('../src/pages/opencode/draft.mjs');
  const list = ['low', 'high', 'max', 'medium', 'xhigh'];
  assert.deepEqual(d.moveEffort(list, 2, 4), ['low', 'high', 'medium', 'xhigh', 'max']);
  assert.deepEqual(d.moveEffort(list, 3, 1), ['low', 'medium', 'high', 'max', 'xhigh']);
  assert.deepEqual(d.moveEffort(list, 0, 4), ['high', 'max', 'medium', 'xhigh', 'low']);
  assert.deepEqual(list, ['low', 'high', 'max', 'medium', 'xhigh']);
  assert.equal(d.moveEffort(list, 2, 2), list);
  assert.equal(d.moveEffort(list, -1, 2), list);
  assert.equal(d.moveEffort(list, 1, 9), list);
});
