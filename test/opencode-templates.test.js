'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../src/pages/opencode/templates.mjs');

test('内置模板覆盖 11 个系列且数据完整', async () => {
  const t = await load();
  const names = t.BUILTIN_TEMPLATES.map(x => x.name);
  assert.deepEqual(names, ['Claude', 'GPT', 'Gemini', 'DeepSeek', 'GLM', 'Kimi', 'Qwen', 'Grok', 'MiniMax', 'Mistral', 'MiMo']);
  for (const x of t.BUILTIN_TEMPLATES) {
    assert.equal(x.builtin, true, x.name);
    assert.ok(x.patterns.length > 0, x.name);
    assert.ok(x.limit.context > 0 && x.limit.output > 0, x.name);
    for (const k of ['reasoning', 'attachment', 'tool_call', 'temperature']) assert.equal(typeof x[k], 'boolean', x.name + k);
    assert.ok(x.modalities.input.includes('text') && x.modalities.output.includes('text'), x.name);
    assert.ok(!x.effort || x.efforts.includes(x.effort), x.name);
  }
  const claude = t.BUILTIN_TEMPLATES[0];
  assert.deepEqual(claude.efforts, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(claude.temperature, false);
  assert.deepEqual(claude.limit, { context: 1000000, output: 128000 });
  const gemini = t.BUILTIN_TEMPLATES.find(x => x.name === 'Gemini');
  assert.deepEqual(gemini.efforts, ['low', 'medium', 'high']);
  assert.equal(t.BUILTIN_TEMPLATES.find(x => x.name === 'GPT').limit.context, 872000);
});

test('按模型名匹配：通配、前缀路径、大小写，自定义优先，未命中返回 null', async () => {
  const t = await load();
  const list = t.BUILTIN_TEMPLATES;
  assert.equal(t.matchTemplate(list, 'claude-opus-5-5').name, 'Claude');
  assert.equal(t.matchTemplate(list, 'anthropic/Claude-Sonnet-5-5').name, 'Claude');
  assert.equal(t.matchTemplate(list, 'gpt-6.1-sol').name, 'GPT');
  assert.equal(t.matchTemplate(list, 'qwen3.8-max').name, 'Qwen');
  assert.equal(t.matchTemplate(list, 'MiniMax-M3').name, 'MiniMax');
  assert.equal(t.matchTemplate(list, 'my-gpt-x'), null);
  assert.equal(t.matchTemplate(list, ''), null);
  const custom = { ...list[1], id: 'c1', name: '内网 GPT', builtin: false, patterns: ['gpt-6*'] };
  assert.equal(t.matchTemplate([...list, custom], 'gpt-6.1-sol').name, '内网 GPT');
});

test('套用模板后写入 OpenCode 的模型块不含模板元数据，档位写成 variants', async () => {
  const t = await load();
  const { modelsToBlocks } = require('../electron/lib/opencode.js');
  const model = t.applyTemplate({ id: 'claude-opus-5-5', name: 'Opus', options: {} }, t.BUILTIN_TEMPLATES[0], 1);
  const block = modelsToBlocks([model])['claude-opus-5-5'];
  assert.equal(JSON.stringify(block).includes('template'), false);
  assert.equal(block.settings.reasoningEffort, 'high');
  assert.deepEqual(block.variants.map(v => v.id), ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.deepEqual(block.limit, { context: 1000000, output: 128000 });
});

test('旧对象形态 variants 的导入模型套模板后，新增档位也写成 variants', async () => {
  const t = await load();
  const { modelsToBlocks } = require('../electron/lib/opencode.js');
  const imported = { id: 'claude-opus-5-5', name: 'Opus', options: {}, variantsShape: 'object',
    variantsRaw: { high: { effort: 'high' } }, efforts: ['high'], effort: 'high', baseEffort: '' };
  const block = modelsToBlocks([t.applyTemplate(imported, t.BUILTIN_TEMPLATES[0], 1)])['claude-opus-5-5'];
  assert.deepEqual(block.variants.map(v => v.id).sort(), ['high', 'low', 'max', 'medium', 'xhigh']);
  assert.equal(new Set(block.variants.map(v => v.id)).size, block.variants.length);
});

test('token 数显示为 M/K', async () => {
  const t = await load();
  assert.equal(t.fmtTokens(1000000), '1M');
  assert.equal(t.fmtTokens(1048576), '1.05M');
  assert.equal(t.fmtTokens(128000), '128K');
  assert.equal(t.fmtTokens(0), '—');
});

test('套用模板：复制参数、保留身份字段、记录来源、不共享引用', async () => {
  const t = await load();
  const tpl = t.BUILTIN_TEMPLATES[0];
  const model = { id: 'claude-opus-5-5', name: 'Opus', options: { a: 1 }, rawExtra: { cost: 1 },
    limit: { context: 0, output: 0 }, reasoning: false, attachment: false, tool_call: false, temperature: true,
    modalities: { input: ['text'], output: ['text'] }, efforts: ['ultra'], effort: 'ultra', baseEffort: 'ultra' };
  const out = t.applyTemplate(model, tpl, 1000);
  assert.equal(out.id, 'claude-opus-5-5');
  assert.equal(out.name, 'Opus');
  assert.deepEqual(out.options, { a: 1 });
  assert.deepEqual(out.rawExtra, { cost: 1 });
  assert.deepEqual(out.limit, tpl.limit);
  assert.equal(out.temperature, false);
  assert.deepEqual(out.efforts, tpl.efforts);
  assert.equal(out.effort, tpl.effort);
  assert.deepEqual(out.modalities, tpl.modalities);
  assert.equal(out.template.id, tpl.id);
  assert.equal(out.template.name, 'Claude');
  assert.equal(out.template.appliedAt, 1000);
  out.efforts.push('x'); out.limit.context = 1; out.modalities.input.push('audio');
  assert.equal(tpl.efforts.includes('x'), false);
  assert.equal(tpl.limit.context, 1000000);
  assert.equal(tpl.modalities.input.includes('audio'), false);
  assert.equal(out.template.values.limit.context, 1000000);
});

test('已修改判定只标与套用时模板值不同的字段', async () => {
  const t = await load();
  const applied = t.applyTemplate({ id: 'claude-x', name: 'x' }, t.BUILTIN_TEMPLATES[0], 1);
  assert.deepEqual(t.templateDiff(applied), []);
  const edited = { ...applied, limit: { ...applied.limit, output: 64000 }, temperature: true,
    modalities: { ...applied.modalities, input: ['pdf', 'image', 'text'] } };
  assert.deepEqual(t.templateDiff(edited).sort(), ['limit.output', 'temperature']);
  assert.deepEqual(t.templateDiff({ id: 'none' }), []);
});

test('store 持久化模板列表：未保存为 null，保存后重开仍在，且不写入 opencodeProviders', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { createStore } = require('../electron/lib/store.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-tpl-store-'));
  try {
    const s = createStore(dir);
    s.load();
    assert.equal(s.getOpenCodeTemplates(), null);
    s.saveOpenCodeTemplates([{ id: 'c1', name: 'X', builtin: false, patterns: ['x-*'] }]);
    const again = createStore(dir);
    again.load();
    assert.deepEqual(again.getOpenCodeTemplates().map(t => t.id), ['c1']);
    assert.deepEqual(again.listOpenCodeProviders(), []);
    assert.throws(() => again.saveOpenCodeTemplates('bad'), /数组/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('模板列表：null 回退内置，恢复内置保留自定义，可由模型生成新模板', async () => {
  const t = await load();
  assert.equal(t.resolveTemplates(null).length, 11);
  const custom = { ...t.BUILTIN_TEMPLATES[0], id: 'c1', name: '自定义', builtin: false };
  const changed = t.resolveTemplates([{ ...t.BUILTIN_TEMPLATES[0], limit: { context: 1, output: 1 } }, custom]);
  const reset = t.resetBuiltins(changed);
  assert.equal(reset.length, 12);
  assert.deepEqual(reset.find(x => x.id === t.BUILTIN_TEMPLATES[0].id).limit, { context: 1000000, output: 128000 });
  assert.ok(reset.some(x => x.id === 'c1'));
  const fromModel = t.templateFromModel({ id: 'acme-1', name: 'Acme', limit: { context: 5, output: 6 },
    reasoning: true, attachment: false, tool_call: true, temperature: true,
    modalities: { input: ['text'], output: ['text'] }, efforts: ['low'], effort: 'low' }, 'tid');
  assert.equal(fromModel.id, 'tid');
  assert.equal(fromModel.builtin, false);
  assert.deepEqual(fromModel.patterns, ['acme-1']);
  assert.equal(fromModel.name, 'Acme');
  assert.deepEqual(fromModel.efforts, ['low']);
});
