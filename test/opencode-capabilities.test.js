'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { providerBlockToRS, modelsToBlocks, mergeProviderBlock, mergeRsMeta, resolveSaveKey, PROVIDER_PACKAGES } = require('../electron/lib/opencode.js');

const ANTH = PROVIDER_PACKAGES.message;
const providerWith = models => ({ package: ANTH, name: 'P', settings: { baseURL: 'https://x.example.com/v1', apiKey: 'k' }, models });
const readModel = (m, id = 'm') => providerBlockToRS('p', providerWith({ [id]: m }), {}).models[0];
const writeModel = (m, pkg = ANTH) => modelsToBlocks([m], pkg)[m.id];
const variants = ids => ids.map(id => ({ id, settings: { effort: id } }));

test('读：推理与温度按 V2 capabilities 读成三态，保留 reasoning 原对象', () => {
  const m = readModel({ name: 'm', capabilities: { tools: true, input: ['text'], output: ['text'], temperature: false,
    reasoning: { supported: true, toggle: true, effort: ['low', 'high'] } }, variants: variants(['low', 'high']) });
  assert.equal(m.reasoning, 'yes');
  assert.equal(m.temperature, 'no');
  assert.deepEqual(m.reasoningRaw, { supported: true, toggle: true, effort: ['low', 'high'] });
  assert.equal(m.capExtra, undefined);
  assert.equal('attachment' in m, false);
  const off = readModel({ capabilities: { tools: true, reasoning: { supported: false } } });
  assert.equal(off.reasoning, 'no');
  const none = readModel({ capabilities: { tools: true, input: ['text'], output: ['text'] } });
  assert.equal(none.reasoning, 'unset');
  assert.equal(none.temperature, 'unset');
});

test('读：没有 V2 声明时用 V1 顶层布尔兜底', () => {
  const m = readModel({ name: 'm', reasoning: true, temperature: false, attachment: true });
  assert.equal(m.reasoning, 'yes');
  assert.equal(m.temperature, 'no');
});

test('读：档位顺序跟随文件里的 variants；默认档只在 settings 里时追加到末尾', () => {
  const ds = readModel({ settings: { effort: 'high' }, variants: variants(['low', 'high', 'max', 'medium', 'xhigh']) });
  assert.deepEqual(ds.efforts, ['low', 'high', 'max', 'medium', 'xhigh']);
  assert.equal(ds.effort, 'high');
  const grok = readModel({ settings: { effort: 'xhigh' }, variants: variants(['low', 'high', 'xhigh']) });
  assert.deepEqual(grok.efforts, ['low', 'high', 'xhigh']);
  const base = readModel({ settings: { effort: 'minimal' }, variants: variants(['high', 'xhigh']) });
  assert.deepEqual(base.efforts, ['high', 'xhigh', 'minimal']);
  assert.equal(base.baseEffort, 'minimal');
});

test('写：variants 严格按 efforts 顺序，原有档位内容保留，默认档仅在 settings 的不合成 variant', () => {
  const file = { settings: { effort: 'high' }, variants: [
    { id: 'low', settings: { effort: 'low' } }, { id: 'high', settings: { effort: 'high' }, body: { x: 1 } },
    { id: 'max', settings: { effort: 'max' } }, { id: 'medium', settings: { effort: 'medium' } }, { id: 'xhigh', settings: { effort: 'xhigh' } }] };
  const m = readModel(file, 'ds');
  const out = writeModel({ ...m, efforts: ['low', 'medium', 'high', 'xhigh', 'max'] });
  assert.deepEqual(out.variants.map(v => v.id), ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.deepEqual(out.variants.find(v => v.id === 'high').body, { x: 1 });
  const base = readModel({ settings: { effort: 'minimal' }, variants: variants(['high', 'xhigh']) });
  const baseOut = writeModel({ ...base, efforts: ['minimal', 'xhigh', 'high'] });
  assert.deepEqual(baseOut.variants.map(v => v.id), ['xhigh', 'high']);
  assert.equal(baseOut.settings.effort, 'minimal');
});

test('写：推理三态', () => {
  const raw = { supported: true, toggle: true, effort: ['low', 'high'] };
  const m = readModel({ capabilities: { tools: true, reasoning: raw }, settings: { effort: 'high' }, variants: variants(['low', 'high']) });
  assert.deepEqual(writeModel(m).capabilities.reasoning, raw, '没改档位时原样写回');
  assert.deepEqual(writeModel({ ...m, efforts: ['high', 'low', 'max'] }).capabilities.reasoning,
    { toggle: true, supported: true, effort: ['high', 'low', 'max'] }, '改了档位时保留 toggle，effort 跟随新顺序');
  const fresh = { id: 'n', name: 'n', reasoning: 'yes', efforts: ['low', 'max'], effort: 'max', options: {} };
  assert.deepEqual(writeModel(fresh).capabilities.reasoning, { supported: true, effort: ['low', 'max'] });
  assert.deepEqual(writeModel({ ...fresh, efforts: [], effort: '' }).capabilities.reasoning, { supported: true });

  const no = writeModel({ ...m, reasoning: 'no', options: { effort: 'high', foo: 1 } });
  assert.deepEqual(no.capabilities.reasoning, { supported: false });
  assert.equal(no.variants, undefined, '不支持推理时不写档位');
  assert.deepEqual(no.settings, { foo: 1 });

  const unset = writeModel({ ...m, reasoning: 'unset' });
  assert.equal('reasoning' in unset.capabilities, false);
  assert.deepEqual(unset.variants.map(v => v.id), ['low', 'high']);
});

test('写：温度三态；不再写任何 V1 顶层字段', () => {
  const base = { id: 't', name: 't', efforts: [], effort: '', options: {} };
  assert.equal(writeModel({ ...base, temperature: 'yes' }).capabilities.temperature, true);
  assert.equal(writeModel({ ...base, temperature: 'no' }).capabilities.temperature, false);
  const unset = writeModel({ ...base, temperature: 'unset' });
  assert.equal('temperature' in unset.capabilities, false);
  for (const k of ['reasoning', 'attachment', 'temperature', 'tool_call']) assert.equal(k in unset, false, k);
  // 旧草稿里的布尔值也能写：true 视为支持，false 视为未设置
  assert.equal(writeModel({ ...base, temperature: true }).capabilities.temperature, true);
  assert.equal('temperature' in writeModel({ ...base, temperature: false }).capabilities, false);
});

test('读出来原样保存：Provider 块 0 处改动（含推理/温度声明与默认档仅在 settings 的模型）', () => {
  const block = providerWith({
    'deepseek-v4.1-flash-sg': { name: 'DS', modelID: 'deepseek-v4.1-flash-sg', limit: { context: 1000000, output: 128000 },
      capabilities: { tools: true, input: ['text'], output: ['text'] }, settings: { effort: 'high' },
      variants: variants(['low', 'high', 'max', 'medium', 'xhigh']) },
    'claude-opus-5-5': { name: 'Opus', modelID: 'claude-opus-5-5', limit: { context: 1000000, input: 900000, output: 128000 },
      capabilities: { tools: true, input: ['text', 'image'], output: ['text'], temperature: false, reasoning: { supported: true, budget: { min: 1, max: 9 } } },
      settings: { effort: 'minimal', foo: 1 }, variants: variants(['high', 'xhigh']), cost: { input: 1 } },
    'plain': { name: 'plain', modelID: 'plain', capabilities: { tools: false, input: ['text'], output: ['text'], reasoning: { supported: false } } }
  });
  const cfg = { providers: { p: block } };
  const rs = providerBlockToRS('p', block, cfg);
  const out = mergeProviderBlock(cfg, { id: 'p', package: ANTH, name: rs.name,
    settings: { baseURL: rs.baseUrl, apiKey: rs.apiKey }, models: rs.models });
  assert.deepEqual(out.providers.p, block);
});

test('mergeRsMeta：配置文件为准，只叠加 RS 自己的元数据', () => {
  const fromFile = providerBlockToRS('p', providerWith({
    a: { name: 'A 新名字', capabilities: { tools: true }, variants: variants(['low']) },
    b: { name: 'B', capabilities: { tools: true, reasoning: { supported: false } } }
  }), {});
  const stored = { id: 'p', relayId: 'r1', name: '旧名字', baseUrl: 'https://old.example.com/v1', models: [
    { id: 'a', name: 'A 旧名字', efforts: ['zzz'], template: { id: 'builtin-claude', name: 'Claude', appliedAt: 1, values: { reasoning: true } } },
    { id: 'b', efforts: ['low', 'max'], effort: 'max' },
    { id: 'gone', name: 'only in store' }] };
  const merged = mergeRsMeta(fromFile, stored);
  assert.equal(merged.relayId, 'r1');
  assert.equal(merged.name, 'P');
  assert.equal(merged.baseUrl, 'https://x.example.com/v1');
  assert.deepEqual(merged.models.map(m => m.id), ['a', 'b']);
  assert.equal(merged.models[0].name, 'A 新名字');
  assert.deepEqual(merged.models[0].efforts, ['low'], '档位以文件为准');
  assert.equal(merged.models[0].template.id, 'builtin-claude');
  assert.deepEqual(merged.models[1].efforts, ['low', 'max'], '推理不支持时恢复 RS 记下的档位');
  assert.equal(merged.models[1].effort, 'max');
  assert.deepEqual(merged.models[1].effortsAtLoad, ['low', 'max']);
  assert.equal(mergeRsMeta(fromFile, null), fromFile);
});

test('listProvidersFromConfig：列表以配置文件为准，新出现的算导入，store 里多出来的标记清理', () => {
  const { listProvidersFromConfig } = require('../electron/lib/opencode.js');
  const cfg = { providers: { a: providerWith({ m1: { name: 'M1 新', variants: variants(['low', 'max']) } }) },
    provider: { legacy: { npm: '@ai-sdk/anthropic', options: { baseURL: 'https://l.example.com/v1' }, models: {} } } };
  const stored = [
    { id: 'a', relayId: 'r1', models: [{ id: 'm1', name: 'M1 旧', efforts: ['max', 'low'], template: { id: 't', name: 'T' } }] },
    { id: 'deleted-elsewhere', models: [] }
  ];
  const r = listProvidersFromConfig(cfg, stored);
  assert.deepEqual(r.providers.map(p => p.id), ['a', 'legacy']);
  assert.equal(r.providers[0].models[0].name, 'M1 新');
  assert.deepEqual(r.providers[0].models[0].efforts, ['low', 'max']);
  assert.equal(r.providers[0].relayId, 'r1');
  assert.equal(r.providers[0].models[0].template.id, 't');
  assert.deepEqual(r.imported, ['legacy']);
  assert.deepEqual(r.stale, ['deleted-elsewhere']);
});

test('resolveSaveKey：输入框 > 关联中转站 > 配置里已有的 Key', () => {
  const cfg = { providers: { a: { settings: { apiKey: 'sk-file' } } }, provider: { old: { options: { apiKey: 'sk-legacy' } } } };
  assert.equal(resolveSaveKey({ id: 'a', typed: 'sk-typed', relayKey: 'sk-relay', cfg }), 'sk-typed');
  assert.equal(resolveSaveKey({ id: 'a', typed: '', relayKey: 'sk-relay', cfg }), 'sk-relay');
  assert.equal(resolveSaveKey({ id: 'a', typed: '  ', relayKey: null, cfg }), 'sk-file');
  assert.equal(resolveSaveKey({ id: 'old', typed: '', cfg }), 'sk-legacy');
  assert.equal(resolveSaveKey({ id: 'new', typed: '', cfg }), null);
});
