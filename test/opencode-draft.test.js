'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

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
