'use strict';
/* Test: 从本机 config.toml 导入中转站(US-06) — BOM/CRLF 容忍、provider 提取、当前指向标记 */
const { test } = require('node:test');
const assert = require('node:assert');
const { extractRelayCandidates } = require('../electron/lib/codex.js');

const DOC = [
  'model_provider = "codex_local_access"',
  'model = "gpt-6-astra"',
  '',
  '[mcp_servers.memory]',
  'command = "npx"',
  '',
  '[model_providers.codex_local_access]',
  'name = "Sub2APIU"',
  'base_url = "https://api.example.com/v1"',
  'wire_api = "responses"',
  'experimental_bearer_token = "sk-abc"',
  '',
  '[model_providers.old_local]',
  'name = "Local Gateway"',
  'base_url = "http://127.0.0.1:20573/v1"',
  'experimental_bearer_token = "agt_old"',
  ''
].join('\r\n'); // Windows CRLF + 下方再裹 BOM,模拟真实文件

test('提取:BOM+CRLF 容忍,列出全部 provider 并标记当前指向', () => {
  const r = extractRelayCandidates('\uFEFF' + DOC);
  assert.ok(r.ok, '应解析成功(剥 BOM)');
  assert.equal(r.relays.length, 2);
  const main = r.relays.find(x => x.id === 'codex_local_access');
  assert.equal(main.name, 'Sub2APIU');
  assert.equal(main.apiKey, 'sk-abc');
  assert.equal(main.isCurrent, true);
  const local = r.relays.find(x => x.id === 'old_local');
  assert.equal(local.isCurrent, false, 'localhost 网关也是合法候选,照常列出');
});

test('提取:空文本/坏 TOML 明确报错且不抛异常', () => {
  assert.equal(extractRelayCandidates('').ok, false);
  assert.equal(extractRelayCandidates('not [ valid toml').ok, false);
  const r = extractRelayCandidates('not [ valid toml');
  assert.match(r.error, /解析失败/);
});

test('提取:无 provider 段时返回空列表(不算错误)', () => {
  const r = extractRelayCandidates('model = "gpt-5.5"\n');
  assert.ok(r.ok);
  assert.equal(r.relays.length, 0);
});
