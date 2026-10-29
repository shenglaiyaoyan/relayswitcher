'use strict';
/* Test: opencode.js — JSONC 解析/合并/摘除/auth/备份/协议映射 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  PROTOCOL_ADAPTERS, readOpenCodeConfig, writeOpenCodeConfig,
  readAuthFile, writeAuthFile,
  mergeProviderBlock, removeProviderBlock, backupOpenCode,
  providerBlockToRS, modelsToBlocks, fileVariantsShape, resolveFetchTarget
} = require('../electron/lib/opencode.js');

const OC_HOME = path.join(os.homedir(), '.config', 'opencode');
const OC_DATA = path.join(os.homedir(), '.local', 'share', 'opencode');

function mkHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-oc-'));
  fs.mkdirSync(path.join(home, '.config', 'opencode'), { recursive: true });
  fs.mkdirSync(path.join(home, '.local', 'share', 'opencode'), { recursive: true });
  return home;
}

test('PROTOCOL_ADAPTERS: message→anthropic, chat→openai-compatible, responses→openai', () => {
  assert.equal(PROTOCOL_ADAPTERS.message, '@ai-sdk/anthropic');
  assert.equal(PROTOCOL_ADAPTERS.chat, '@ai-sdk/openai-compatible');
  assert.equal(PROTOCOL_ADAPTERS.responses, '@ai-sdk/openai');
});

/* resolveFetchTarget:手动填的站(不在中转站库)也必须能拉模型 */
test('resolveFetchTarget: 手写 baseUrl+apiKey 直接可用,不依赖站库', () => {
  const r = resolveFetchTarget({ baseUrl: 'https://manual.example.com/v1', apiKey: 'sk-x' }, () => { throw new Error('不该查库'); });
  assert.equal(r.baseUrl, 'https://manual.example.com/v1');
  assert.equal(r.apiKey, 'sk-x');
  assert.equal(r.error, undefined);
});

test('resolveFetchTarget: 只传 relayId(旧调用)仍从中转站库取', () => {
  const r = resolveFetchTarget('relay-1', (id) => ({ id, baseUrl: 'https://lib.example.com/v1', apiKey: 'sk-lib' }));
  assert.equal(r.baseUrl, 'https://lib.example.com/v1');
  assert.equal(r.apiKey, 'sk-lib');
});

test('resolveFetchTarget: 表单 baseUrl 优先于站库(改了地址就用改的)', () => {
  const r = resolveFetchTarget({ relayId: 'relay-1', baseUrl: 'https://edited.example.com/v1' },
    () => ({ baseUrl: 'https://lib.example.com/v1', apiKey: 'sk-lib' }));
  assert.equal(r.baseUrl, 'https://edited.example.com/v1');
  assert.equal(r.apiKey, 'sk-lib'); // 旧对象调用保留站库回退；新工作区 IPC 不再传 lookup
});

test('resolveFetchTarget: 新工作区禁用站库回退，空 Key 不会被历史 relayId 补齐', () => {
  const r = resolveFetchTarget({ baseUrl: 'https://manual.example.com/v1', apiKey: '' }, null);
  assert.deepEqual(r, { baseUrl: 'https://manual.example.com/v1', apiKey: '' });
});

test('resolveFetchTarget: 裸域名拉模型走 /v1/models，且不改表单或 Key', () => {
  for (const baseUrl of ['https://dihuang.zeniths.codes', ' https://dihuang.zeniths.codes/ ']) {
    const target = Object.freeze({ baseUrl, apiKey: 'test-key', protocol: 'message' });
    const r = resolveFetchTarget(target, () => { throw new Error('不该查站库'); });
    assert.equal(r.baseUrl.replace(/\/+$/, '') + '/models', 'https://dihuang.zeniths.codes/v1/models');
    assert.equal(r.apiKey, 'test-key');
    assert.equal(target.baseUrl, baseUrl);
  }
});

test('resolveFetchTarget: 已带 /v1 不重复追加，自定义 API 路径原样保留', () => {
  for (const baseUrl of [
    'https://api.example.com/v1',
    'https://api.example.com/v1/',
    'https://api.example.com/proxy/v1/',
    'https://api.example.com/custom-api/'
  ]) {
    const r = resolveFetchTarget({ baseUrl, apiKey: '' });
    assert.equal(r.baseUrl.replace(/\/+$/, '') + '/models', baseUrl.replace(/\/+$/, '') + '/models');
    assert.equal(r.apiKey, '');
  }
});

test('resolveFetchTarget: 既没 baseUrl 也没站 → 明确报错而不是静默失败', () => {
  const r = resolveFetchTarget({}, () => null);
  assert.ok(r.error && r.error.includes('Base URL'));
});

test('readOpenCodeConfig: 文件带 UTF-8 BOM 也能解析(Windows 编辑器常见,JSON.parse 会把它当非法字符)', () => {
  const home = mkHome();
  const body = '{\n  // 注释\n  "provider": { "pulse": { "npm": "@ai-sdk/anthropic" } }\n}';
  fs.writeFileSync(path.join(home, '.config/opencode/opencode.jsonc'),
    Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(body, 'utf8')]));
  const cfg = readOpenCodeConfig(home);
  assert.ok(cfg.provider.pulse, 'BOM 不能导致整份配置解析失败');
});

test('readOpenCodeConfig: 纯 JSON 正常解析', () => {
  const home = mkHome();
  fs.writeFileSync(path.join(home, '.config/opencode/opencode.json'),
    JSON.stringify({ model: 'test/m1', provider: { test: { npm: '@ai-sdk/openai-compatible' } } }));
  const cfg = readOpenCodeConfig(home);
  assert.equal(cfg.model, 'test/m1');
  assert.ok(cfg.provider.test);
});

test('readOpenCodeConfig: JSONC 含注释正常解析(容忍//)', () => {
  const home = mkHome();
  fs.writeFileSync(path.join(home, '.config/opencode/opencode.json'),
    '{\n  // my comment\n  "model": "test/m1"\n}');
  const cfg = readOpenCodeConfig(home);
  assert.equal(cfg.model, 'test/m1');
});

test('readOpenCodeConfig: 文件不存在返回空对象', () => {
  const home = mkHome();
  const cfg = readOpenCodeConfig(home);
  assert.deepEqual(cfg, {});
});

test('readOpenCodeConfig: 只有 opencode.jsonc 时也能读到(官方双文件名,jsonc 优先)', () => {
  const home = mkHome();
  fs.writeFileSync(path.join(home, '.config/opencode/opencode.jsonc'),
    '{\n  // 注释\n  "provider": { "dihuang": { "npm": "@ai-sdk/anthropic" } }\n}');
  const cfg = readOpenCodeConfig(home);
  assert.ok(cfg.provider.dihuang, 'jsonc 里的 provider 必须被识别');
  assert.equal(cfg._hasComments, true);
  assert.equal(cfg._configFile, 'opencode.jsonc');
});

test('readOpenCodeConfig: json 与 jsonc 并存时 jsonc 胜出(对齐官方 names.toReversed)', () => {
  const home = mkHome();
  fs.writeFileSync(path.join(home, '.config/opencode/opencode.json'),
    JSON.stringify({ provider: { old: { npm: 'x' } } }));
  fs.writeFileSync(path.join(home, '.config/opencode/opencode.jsonc'),
    JSON.stringify({ provider: { fresh: { npm: 'y' } } }));
  const cfg = readOpenCodeConfig(home);
  assert.ok(cfg.provider.fresh);
  assert.equal(cfg.provider.old, undefined);
});

test('readOpenCodeConfig: 检测到注释返回 _hasComments=true(写回时警告)', () => {
  const home = mkHome();
  fs.writeFileSync(path.join(home, '.config/opencode/opencode.json'), '{ // c\n "a": 1 }');
  const cfg = readOpenCodeConfig(home);
  assert.equal(cfg._hasComments, true);
});

test('mergeProviderBlock: 注入新 provider 到空配置(真 schema:providers/package/settings)', () => {
  const existing = {};
  const pd = { id: 'myrelay', package: '@opencode/ai/providers/openai-compatible', name: 'My Relay',
    settings: { baseURL: 'https://api.example.com/v1' },
    models: { 'gpt-6-sol': { name: 'GPT-6-Sol', modelID: 'gpt-6-sol', limit: { context: 272000, output: 128000 } } } };
  const out = mergeProviderBlock(existing, pd);
  assert.ok(out.providers.myrelay);
  assert.equal(out.providers.myrelay.package, '@opencode/ai/providers/openai-compatible');
  assert.equal(out.providers.myrelay.settings.baseURL, 'https://api.example.com/v1');
  assert.equal(out.providers.myrelay.models['gpt-6-sol'].limit.context, 272000);
  assert.equal(out.providers.myrelay.models['gpt-6-sol'].modelID, 'gpt-6-sol');
});

test('mergeProviderBlock: 旧形态文件新增 provider 统一写 V2 providers', () => {
  const existing = { provider: { zcode: { npm: '@ai-sdk/anthropic', options: { baseURL: 'https://z.example.com/v1' } } } };
  const pd = { id: 'workbuddy', package: '@opencode/ai/providers/anthropic', name: 'WorkBuddy',
    settings: { baseURL: 'https://w.example.com/v1', apiKey: 'k' }, models: {} };
  const out = mergeProviderBlock(existing, pd);
  assert.ok(out.providers.workbuddy, 'RS 管理的 provider 统一写 V2 providers');
  assert.equal(out.providers.workbuddy.package, '@opencode/ai/providers/anthropic');
  assert.equal(out.providers.workbuddy.settings.baseURL, 'https://w.example.com/v1');
  assert.equal(out.providers.workbuddy.settings.apiKey, 'k');
  assert.equal(out.providers.workbuddy.npm, undefined);
  assert.equal(out.providers.workbuddy.options, undefined);
  assert.ok(out.provider.zcode, '未被编辑的旧 provider 不在本次迁移范围内');
});

test('mergeProviderBlock: 新增模型的 variants 统一为 V2 数组', () => {
  const existing = { provider: { zcode: { npm: '@ai-sdk/anthropic', models: {
    'GLM-5.3': { variants: { low: { effort: 'low' }, high: { effort: 'high' } } } } } } };
  const pd = { id: 'accio', package: '@opencode/ai/providers/anthropic', name: 'Accio',
    settings: { baseURL: 'https://a.example.com/v1' },
    models: [{ id: 'claude-opus-4.8', name: 'Opus 4.8', reasoning: true,
      efforts: ['low', 'high', 'max'] }] };
  const out = mergeProviderBlock(existing, pd);
  assert.ok(out.providers.accio, '新 provider 必须写 V2 providers,实际键: ' + Object.keys(out));
  const v = out.providers.accio.models['claude-opus-4.8'].variants;
  assert.ok(Array.isArray(v), 'V2 variants 必须是数组');
  assert.deepEqual(v.map(x => x.id), ['low', 'high', 'max']);
  // Anthropic 包只认 effort（2026-10-29 抓请求体实测：reasoningEffort 被忽略）
  assert.deepEqual(v[0].settings, { effort: 'low' });
});

test('mergeProviderBlock: 旧 provider 统一迁移为 V2,保留 compatibility 并转换 variants', () => {
  const existing = { provider: { Pulse: {
    name: 'pulse', npm: '@opencode/ai/providers/anthropic',
    options: { baseURL: 'http://127.0.0.1:18790/v1', apiKey: 'k' },
    models: {
      'claude-opus-5-5': {
        name: 'Opus 5.5', modelID: 'claude-opus-5-5',
        compatibility: { supportsThinkingBlockBinding: false },
        capabilities: { tools: true, input: ['text', 'image'], output: ['text'] },
        reasoning: true, attachment: true,
        settings: { reasoningEffort: 'max' },
        variants: { high: { effort: 'high' }, xhigh: { effort: 'xhigh' }, max: { effort: 'max' } },
        limit: { context: 1000000, output: 128000 }
      }
    }
  } } };
  const rs = providerBlockToRS('Pulse', existing.provider.Pulse, existing);
  const out = mergeProviderBlock(existing, {
    id: 'Pulse', package: '@opencode/ai/providers/anthropic', name: 'pulse',
    settings: { baseURL: 'http://127.0.0.1:18790/v1', apiKey: 'k' }, models: rs.models
  });
  assert.ok(out.providers.Pulse, '必须写入 V2 providers,实际键: ' + Object.keys(out));
  assert.equal(out.provider, undefined, '当前 provider 的旧 V1 块必须迁移,不能混用');
  const m = out.providers.Pulse.models['claude-opus-5-5'];
  assert.deepEqual(m.compatibility, { supportsThinkingBlockBinding: false }, 'V2 compatibility 必须保留');
  assert.equal(m.reasoning, undefined, '不能再混入 V1 reasoning');
  assert.equal(m.attachment, undefined, '不能再混入 V1 attachment');
  assert.equal(m.modelID, 'claude-opus-5-5');
  assert.equal(m.capabilities.tools, true);
  assert.deepEqual(m.capabilities.input, ['text', 'image']);
  assert.equal(m.settings.effort, 'max');
  assert.equal(m.settings.reasoningEffort, undefined, 'Anthropic 包不认 reasoningEffort');
  assert.ok(Array.isArray(m.variants), 'variants 必须是 V2 数组');
  assert.deepEqual(m.variants.map(v => v.id), ['high', 'xhigh', 'max']);
  assert.deepEqual(m.variants[0].settings, { effort: 'high' });
});

test('mergeProviderBlock: 同 id 覆盖其他保留 + 旧形态 provider 块同步清理', () => {
  const existing = { providers: { myrelay: { package: 'old' }, other: { package: '@opencode/ai/providers/anthropic' } },
    provider: { myrelay: { npm: 'legacy' } } };
  const pd = { id: 'myrelay', package: '@opencode/ai/providers/openai-compatible', name: 'My Relay',
    settings: { baseURL: 'https://new.example.com/v1' }, models: {} };
  const out = mergeProviderBlock(existing, pd);
  assert.equal(out.providers.myrelay.package, '@opencode/ai/providers/openai-compatible');
  assert.equal(out.providers.other.package, '@opencode/ai/providers/anthropic');
  assert.ok(!out.provider || !out.provider.myrelay, '同 id 旧形态块清理,避免双写');
});

test('mergeProviderBlock: 顶层 model 键同步写入 + rawExtra 保留', () => {
  const existing = { providers: { myrelay: { package: 'x' } } };
  const pd = { id: 'myrelay', package: 'x', name: 'x', settings: {}, models: {},
    defaultModel: 'myrelay/gpt-6-sol', rawExtra: { whitelist: ['a'] } };
  const out = mergeProviderBlock(existing, pd);
  assert.equal(out.model, 'myrelay/gpt-6-sol');
  assert.deepEqual(out.providers.myrelay.whitelist, ['a']);
});

test('removeProviderBlock: 摘除指定 provider(providers + 旧 provider 双清),其余保留', () => {
  const existing = { model: 'myrelay/m1', providers: { myrelay: { package: 'x' }, keep: { package: 'y' } },
    provider: { myrelay: { npm: 'legacy' } } };
  const out = removeProviderBlock(existing, 'myrelay');
  assert.ok(!out.providers.myrelay);
  assert.ok(out.providers.keep);
  assert.ok(!out.provider || !out.provider.myrelay);
  assert.ok(!out.model, '顶层 model 被清除(指向已摘除的 provider)');
});

test('readAuthFile/writeAuthFile: 读写合并 auth.json', () => {
  const home = mkHome();
  const auth = readAuthFile(home);
  assert.deepEqual(auth, {});
  auth.myrelay = { type: 'api', key: 'sk-test-123' };
  writeAuthFile(home, auth);
  const reread = readAuthFile(home);
  assert.equal(reread.myrelay.key, 'sk-test-123');
});

test('writeAuthFile: 保留已有条目', () => {
  const home = mkHome();
  const auth = readAuthFile(home);
  auth.existing = { type: 'api', key: 'sk-old' };
  writeAuthFile(home, auth);
  const updated = readAuthFile(home);
  updated.newone = { type: 'api', key: 'sk-new' };
  writeAuthFile(home, updated);
  const final = readAuthFile(home);
  assert.equal(final.existing.key, 'sk-old');
  assert.equal(final.newone.key, 'sk-new');
});

test('providerBlockToRS: variants 对象形态(opencode 1.19 及更早)不崩且档位读全', () => {
  const block = { name: 'Dihuang', npm: '@ai-sdk/anthropic',
    options: { baseURL: 'https://example.com/v1', apiKey: 'k' },
    models: { 'GLM-5.3': { name: 'GLM-5.3', reasoning: true, tool_call: true,
      modalities: { input: ['text'], output: ['text'] },
      variants: { low: { effort: 'low' }, high: { effort: 'high' }, max: { effort: 'max' } } } } };
  const rs = providerBlockToRS('dihuang', block, {});
  assert.equal(rs.models.length, 1);
  assert.deepEqual(rs.models[0].efforts.sort(), ['high', 'low', 'max']);
  assert.equal(rs.models[0].variantsShape, 'object');
  // 对象形态原样保留,写回时不能被改写成数组(旧版 opencode 会判配置非法)
  assert.deepEqual(rs.models[0].variantsRaw, block.models['GLM-5.3'].variants);
});

test('modelsToBlocks: 对象 variants 迁移为 V2 数组,档位内容保留', () => {
  const [id, block] = Object.entries(modelsToBlocks([{
    id: 'GLM-5.3', name: 'GLM-5.3', reasoning: true, tool_call: true,
    modalities: { input: ['text'], output: ['text'] },
    variantsShape: 'object',
    variantsRaw: { low: { effort: 'low' }, high: { effort: 'high' }, off: { thinking: { type: 'disabled' } } },
    efforts: ['low', 'off']
  }]))[0];
  assert.equal(id, 'GLM-5.3');
  assert.ok(Array.isArray(block.variants), '统一 V2 后 variants 必须是数组');
  assert.deepEqual(block.variants.map(v => v.id), ['low', 'off']);
  assert.deepEqual(block.variants[0].settings, { reasoningEffort: 'low' });
  assert.deepEqual(block.variants[1].settings, { thinking: { type: 'disabled' } }, 'off 档的 thinking 配置必须保留');
  assert.equal(block.reasoning, undefined, '不能混入 V1 reasoning');
  assert.equal(block.attachment, undefined, '不能混入 V1 attachment');
  assert.equal(block.capabilities.tools, true);
});

test('writeOpenCodeConfig: 读自 jsonc 的配置写回 jsonc,不另造 opencode.json', () => {
  const home = mkHome();
  fs.writeFileSync(path.join(home, '.config/opencode/opencode.jsonc'),
    JSON.stringify({ provider: { keep: { npm: 'x' } } }));
  const cfg = readOpenCodeConfig(home);
  cfg.model = 'keep/m1';
  writeOpenCodeConfig(home, cfg);
  assert.ok(fs.existsSync(path.join(home, '.config/opencode/opencode.jsonc')));
  assert.equal(fs.existsSync(path.join(home, '.config/opencode/opencode.json')), false,
    '不能把用户的 jsonc 配置拆成一个 opencode 不优先读的 json');
  const back = JSON.parse(fs.readFileSync(path.join(home, '.config/opencode/opencode.jsonc'), 'utf8'));
  assert.equal(back.model, 'keep/m1');
  assert.ok(back.provider.keep);
});

test('backupOpenCode: 备份 opencode.json + auth.json 存在时生成快照目录', () => {
  const home = mkHome();
  fs.writeFileSync(path.join(home, '.config/opencode/opencode.json'), '{"model":"x"}');
  fs.writeFileSync(path.join(home, '.local/share/opencode/auth.json'), '{"k":{"type":"api","key":"v"}}');
  const bdir = backupOpenCode(home);
  assert.ok(bdir, '返回备份目录名');
  assert.ok(fs.existsSync(path.join(home, '.config/opencode/relayswitcher-backups', bdir, 'opencode.json')));
  assert.ok(fs.existsSync(path.join(home, '.config/opencode/relayswitcher-backups', bdir, 'auth.json')));
});

test('mergeProviderBlock: 不变异输入 existing(纯函数契约)', () => {
  const existing = { model: 'other/m9', providers: { myrelay: { package: 'old' }, keep: { package: 'y' } } };
  const snapshot = JSON.parse(JSON.stringify(existing));
  const pd = { id: 'myrelay', package: '@opencode/ai/providers/openai-compatible', name: 'My Relay',
    settings: { baseURL: 'https://api.example.com/v1' }, models: {} };
  const out = mergeProviderBlock(existing, pd);
  assert.deepEqual(existing, snapshot, '原始 existing 深比较未被修改');
  assert.equal(existing.providers.myrelay.package, 'old', '原对象里的旧 provider 保持');
  assert.equal(out.providers.myrelay.package, '@opencode/ai/providers/openai-compatible', '输出里是新版');
  assert.equal(out.providers.keep.package, 'y');
});

test('readOpenCodeConfig: 纯 JSON 含 https:// URL 不误报 _hasComments', () => {
  const home = mkHome();
  fs.writeFileSync(path.join(home, '.config/opencode/opencode.json'),
    JSON.stringify({ provider: { myrelay: { options: { baseURL: 'https://api.example.com/v1' } } } }));
  const cfg = readOpenCodeConfig(home);
  assert.equal(cfg._hasComments, undefined, 'URL 里的 // 不算注释');
});

test('readAuthFile: auth.json 损坏时抛异常而非返回空对象', () => {
  const home = mkHome();
  fs.writeFileSync(path.join(home, '.local/share/opencode/auth.json'), '{broken json');
  assert.throws(() => readAuthFile(home), /auth\.json 解析失败/);
});

test('writeOpenCodeConfig: 写回标准 JSON(2空格缩进+LF)', () => {
  const home = mkHome();
  const cfg = { model: 'test/m1', provider: { test: { npm: 'x' } } };
  writeOpenCodeConfig(home, cfg);
  const raw = fs.readFileSync(path.join(home, '.config/opencode/opencode.json'), 'utf8');
  assert.ok(!raw.includes('//'), '不含注释');
  assert.ok(raw.includes('\n'), 'LF 换行');
  assert.deepEqual(JSON.parse(raw), cfg);
});

/* ---------------- v1.12.6:真 schema(providers/package/settings/capabilities/variants)自动全量接管 + 无痕保真 ---------------- */

test('providerBlockToRS: 真 schema 全字段反解析(variants/capabilities/settings/key)', () => {
  const p = providerBlockToRS('qwen-local', {
    name: 'Qwen 本地离线',
    package: '@opencode/ai/providers/openai-compatible',
    settings: { baseURL: 'http://127.0.0.1:8088/v1', apiKey: 'local', timeout: 3600000 },
    models: {
      'qwen3.8-27b': {
        name: 'Qwen3.8 27B 本地', modelID: 'qwen3.8-27b',
        capabilities: { tools: true, input: ['text'], output: ['text'] },
        settings: { reasoningEffort: 'minimal', temperature: 1.0 },
        limit: { context: 16384, output: 6144 },
        variants: [
          { id: 'high', settings: { reasoningEffort: 'high' }, body: { enable: true } },
          { id: 'xhigh', settings: { reasoningEffort: 'xhigh' } }
        ],
        cost: { input: 0 }
      }
    }
  }, { model: 'qwen-local/qwen3.8-27b' });
  assert.equal(p.id, 'qwen-local');
  assert.equal(p.protocol, 'chat');
  assert.equal(p.baseUrl, 'http://127.0.0.1:8088/v1');
  assert.equal(p.apiKey, 'local');                          // key 从 settings 提取
  assert.deepEqual(p.settingsExtra, { timeout: 3600000 });  // baseURL/apiKey 之外的键保留
  assert.equal(p.defaultModel, 'qwen-local/qwen3.8-27b');
  assert.equal(p.imported, true);
  const m = p.models[0];
  assert.equal(m.id, 'qwen3.8-27b'); assert.equal(m.name, 'Qwen3.8 27B 本地');
  assert.deepEqual(m.limit, { context: 16384, output: 6144 });
  assert.equal(m.tool_call, true);
  assert.deepEqual(m.modalities, { input: ['text'], output: ['text'] });
  assert.equal(m.effort, 'minimal');                                // 基础档
  assert.deepEqual(m.efforts, ['minimal', 'high', 'xhigh']);       // 基础档 + variants
  assert.deepEqual(m.variantsRaw.map(v => v.id), ['high', 'xhigh']);
  assert.equal(m.baseEffort, 'minimal');                           // 基础档标记(写回不合成 variant)
  assert.deepEqual(m.options, { temperature: 1.0 });               // reasoningEffort 拆出,其余保留
  assert.deepEqual(m.rawExtra, { cost: { input: 0 } });            // 未建模键保真
});

test('providerBlockToRS: 未知包名原样保留 + 旧形态(npm/options)兼容导入', () => {
  const p1 = providerBlockToRS('weird', {
    package: '@mycorp/custom', settings: { baseURL: 'https://x.io/v1', api: 'custom' },
    command: ['bin'], models: {}
  }, {});
  assert.equal(p1.protocol, '@mycorp/custom');
  assert.equal(p1.pkg, '@mycorp/custom');
  assert.deepEqual(p1.settingsExtra, { api: 'custom' });
  assert.deepEqual(p1.rawExtra, { command: ['bin'] });
  const p2 = providerBlockToRS('legacy', {
    npm: '@ai-sdk/openai-compatible', options: { baseURL: 'https://y.io/v1' }, models: {}
  }, {});
  assert.equal(p2.protocol, 'chat');
  assert.equal(p2.baseUrl, 'https://y.io/v1');
});

test('modelsToBlocks: 档位写基础 reasoningEffort;选中 variant 时叠加其 settings/body', () => {
  const blocks = modelsToBlocks([
    { id: 'a', name: 'A', limit: { context: 1000, output: 0 }, tool_call: true,
      modalities: { input: ['text'], output: ['text'] }, effort: 'high',
      options: { temperature: 1 },
      variantsRaw: [{ id: 'high', settings: { reasoningEffort: 'high' }, body: { enable: true } }],
      efforts: ['high'], rawExtra: { cost: { input: 1 } } },
    { id: 'b', name: 'B', effort: '', options: {} }
  ]);
  const a = blocks.a;
  assert.equal(a.modelID, 'a');
  assert.equal(a.settings.reasoningEffort, 'high');
  assert.equal(a.settings.temperature, 1);
  assert.deepEqual(a.body, { enable: true });            // 选中 variant 的 body 叠加为基础 body
  assert.deepEqual(a.cost, { input: 1 });                // rawExtra 保真
  assert.equal(a.capabilities.tools, true);
  assert.deepEqual(a.capabilities.input, ['text']);
  assert.deepEqual(a.variants.map(v => v.id), ['high']); // variants 原样保留
  assert.ok(!('settings' in blocks.b), '未选档位且无其余键 → 不写 settings');
});

test('modelsToBlocks: 新增档位生成 variant,删除档位移除 variant', () => {
  const blocks = modelsToBlocks([
    { id: 'm', name: 'M', effort: '', efforts: ['low', 'ultra'],
      variantsRaw: [{ id: 'low', settings: { reasoningEffort: 'low' } }] },
    { id: 'n', name: 'N', effort: '', efforts: ['low'],
      variantsRaw: [{ id: 'low', settings: { reasoningEffort: 'low' } }, { id: 'gone' }] }
  ]);
  assert.deepEqual(blocks.m.variants.map(v => v.id), ['low', 'ultra']);       // ultra 新生成
  assert.deepEqual(blocks.m.variants[1], { id: 'ultra', settings: { reasoningEffort: 'ultra' } });
  assert.deepEqual(blocks.n.variants.map(v => v.id), ['low']);                // gone 已删
});

test('modelsToBlocks: 基础档(baseEffort)不合成 variant,选中基础档只写 base settings', () => {
  const blocks = modelsToBlocks([
    { id: 'q', name: 'Q', effort: 'minimal', baseEffort: 'minimal',
      efforts: ['minimal', 'high'],
      variantsRaw: [{ id: 'high', settings: { reasoningEffort: 'high' } }], options: {} }
  ]);
  assert.deepEqual(blocks.q.variants.map(v => v.id), ['high']);   // minimal 不合成
  assert.equal(blocks.q.settings.reasoningEffort, 'minimal');     // 基础档只写 base
});

/* ---------------- v1.12.7:baseURL 防呆(opencode 三种协议包都要求 baseURL 含 /v1) ---------------- */

const { normalizeBaseUrl } = require('../electron/lib/opencode.js');

test('normalizeBaseUrl: 裸域名自动补 /v1(anthropic 包只追加 /messages,缺 /v1 会 404)', () => {
  assert.equal(normalizeBaseUrl('https://dihuang.zeniths.codes'), 'https://dihuang.zeniths.codes/v1');
  assert.equal(normalizeBaseUrl('https://dihuang.zeniths.codes/'), 'https://dihuang.zeniths.codes/v1');
  assert.equal(normalizeBaseUrl('http://127.0.0.1:8088'), 'http://127.0.0.1:8088/v1');
});

test('normalizeBaseUrl: 已含 /v1 或自定义路径的不动(尊重用户显式选择)', () => {
  assert.equal(normalizeBaseUrl('https://dihuang.zeniths.codes/v1'), 'https://dihuang.zeniths.codes/v1');
  assert.equal(normalizeBaseUrl('https://gw.example.com/api'), 'https://gw.example.com/api');
  assert.equal(normalizeBaseUrl(''), '');
});
