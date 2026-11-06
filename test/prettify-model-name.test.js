'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

test('prettifyModelName 按规格把模型 ID 转成显示名', async () => {
  const { prettifyModelName: p } = await import('../src/pages/opencode/prettify-model-name.mjs');
  const cases = {
    'claude-opus-5-5': 'Claude Opus 5.5',
    'claude-opus-5': 'Claude Opus 5',
    'claude-sonnet-5.5': 'Claude Sonnet 5.5',
    'gpt-6-astra': 'GPT 6 Astra',
    'gpt-6.1-sol': 'GPT 6.1 Sol',
    'gpt-6.1-terra': 'GPT 6.1 Terra',
    'gemini-3.8-flash': 'Gemini 3.8 Flash',
    'deepseek-v4-pro': 'DeepSeek V4 Pro',
    'glm-5.2-plus': 'GLM 5.2 Plus',
    'qwen3.8-max': 'Qwen 3.8 Max',
    'qwen-3.8-max': 'Qwen 3.8 Max',
    'kimi-k3.1-pro': 'Kimi K3.1 Pro',
    'MiniMax-M3': 'MiniMax M3',
    'mimo-v2.6-pro': 'MiMo V2.6 Pro',
    'gpt-oss-120b': 'GPT OSS 120B',
    'muse-wonder-1.0': 'Muse Wonder 1.0',
    'org/claude-opus-5': 'Claude Opus 5',
    'anthropic/Claude-Sonnet-5-5': 'Claude Sonnet 5.5',
    'claude-sonnet-4-5-20250929': 'Claude Sonnet 4.5',
    'claude_opus_5_5': 'Claude Opus 5.5',
    'grok-5 fast': 'Grok 5 Fast',
    'qwen3-235b-a22b': 'Qwen 3 235B A22B',
    'llama-4-70b': 'Llama 4 70B',
    'codex-mini': 'Codex Mini',
    'ERNIE-5': 'ERNIE 5'
  };
  for (const [id, name] of Object.entries(cases)) assert.equal(p(id), name, id);
  assert.equal(p(''), '');
  assert.equal(p(undefined), '');
  assert.equal(p('   '), '');
});

test('tidyModelNames 只整理名称为空或等于 ID 的模型，自定义名称不动', async () => {
  const { tidyModelNames } = await import('../src/pages/opencode/draft.mjs');
  const models = [
    { id: 'claude-opus-5-5', name: 'claude-opus-5-5' },
    { id: 'gpt-6-astra', name: '' },
    { id: 'gpt-6.1-sol', name: '我的 Sol' },
    { id: '', name: '' },
    { id: 'Plain', name: 'Plain' }
  ];
  const r = tidyModelNames(models);
  assert.equal(r.count, 2);
  assert.deepEqual(r.models.map(m => m.name), ['Claude Opus 5.5', 'GPT 6 Astra', '我的 Sol', '', 'Plain']);
  assert.equal(r.models[2], models[2]);
  assert.equal(models[0].name, 'claude-opus-5-5');
  assert.equal(tidyModelNames(r.models).count, 0);
});

test('newModel 用美化后的显示名；改 ID 时自动生成的名称跟着变', async () => {
  const d = await import('../src/pages/opencode/draft.mjs');
  assert.equal(d.newModel('claude-opus-5-5').name, 'Claude Opus 5.5');
  assert.equal(d.newModel().name, '');
  const sync = (model, patch) => d.syncModelNamePatch(model, patch);
  assert.deepEqual(sync({ id: '', name: '' }, { id: 'gpt-6-astra' }), { id: 'gpt-6-astra', name: 'GPT 6 Astra' });
  assert.deepEqual(sync({ id: 'gpt-6', name: 'gpt-6' }, { id: 'gpt-6.1-sol' }), { id: 'gpt-6.1-sol', name: 'GPT 6.1 Sol' });
  assert.deepEqual(sync({ id: 'gpt-6', name: 'GPT 6' }, { id: 'gpt-6.1-sol' }), { id: 'gpt-6.1-sol', name: 'GPT 6.1 Sol' });
  assert.deepEqual(sync({ id: 'gpt-6', name: '我的' }, { id: 'gpt-6.1-sol' }), { id: 'gpt-6.1-sol' });
  assert.deepEqual(sync({ id: 'gpt-6', name: 'GPT 6' }, { id: 'gpt-7', name: '手填' }), { id: 'gpt-7', name: '手填' });
  assert.deepEqual(sync({ id: 'gpt-6', name: 'GPT 6' }, { limit: { context: 1 } }), { limit: { context: 1 } });
  assert.deepEqual(sync({ id: 'gpt-6', name: 'GPT 6' }, { id: '' }), { id: '', name: '' });
});
