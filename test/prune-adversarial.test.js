'use strict';
/* 清场(pruneRemoteProviders)脏场景专项 — 2026-09-22 用户要求"再乱也能正常用" */
const { test } = require('node:test');
const assert = require('node:assert');
const TOML = require('@iarna/toml');
const { patchProviderBlock } = require('../electron/lib/codex.js');

const KEY = () => process.env.TEST_BEARER_TOKEN || 'sk-replacement-token';

function patch(text, opts = {}) {
  return patchProviderBlock(text, 'codex_local_access', {
    name: 'DIHUANG2API', baseUrl: 'https://dihuang.zeniths.codes/v1', apiKey: KEY()
  }, { pruneRemoteProviders: true, ...opts });
}

/** 清场后必须永远满足的不变量: TOML 仍合法 + 当前区块在 + 指针内容正确 */
function assertInvariants(result) {
  const parsed = TOML.parse(result.text); // 解析抛异常即测试失败
  const prov = parsed.model_providers && parsed.model_providers.codex_local_access;
  assert.ok(prov, '当前 provider 区块必须存在');
  assert.equal(prov.base_url, 'https://dihuang.zeniths.codes/v1');
  assert.ok(prov.experimental_bearer_token.length > 0);
}

/* BOM/CRLF 场景由真实 I/O 层(readConfigText 剥BOM/CRLF→LF)处理,
   patch 的输入永远是 LF 域 — 该场景在真机演练(临时 CODEX_HOME 全链)覆盖 */

test('脏场景: 伪装域名 localhost.evil.com 保守保留(误留好过误删)', () => {
  const text = '[model_providers.fake_local]\nbase_url = "http://localhost.evil.com/v1"\n\n' +
    '[model_providers.codex_local_access]\nbase_url = "https://old.example.com/v1"\n';
  const r = patch(text);
  assert.ok(!r.removedStale.includes('fake_local'), 'localhost 前缀域名按本地保留');
  assert.ok(r.text.includes('fake_local'));
  assertInvariants(r);
});

test('脏场景: IPv6 本地网关 [::1] 必须保留(本机网关不许误删)', () => {
  const text = '[model_providers.v6_sidecar]\nbase_url = "http://[::1]:20573/v1"\n\n' +
    '[model_providers.zeniths]\nbase_url = "https://zeniths.codes/v1"\n\n' +
    '[model_providers.codex_local_access]\nbase_url = "https://old.example.com/v1"\n';
  const r = patch(text);
  assert.ok(!r.removedStale.includes('v6_sidecar'), '[::1] 是本机网关,不得清: ' + JSON.stringify(r.removedStale));
  assert.ok(r.text.includes('[::1]:20573'));
  assert.ok(r.removedStale.includes('zeniths'));
  assertInvariants(r);
});

test('脏场景: 同名重复老区块(两个 zeniths)全部清掉', () => {
  const text = '[model_providers.zeniths]\nbase_url = "https://a.example.com/v1"\n\n' +
    '[model_providers.zeniths]\nbase_url = "https://b.example.com/v1"\n\n' +
    '[model_providers.codex_local_access]\nbase_url = "https://old.example.com/v1"\n';
  const r = patch(text);
  assert.equal(r.removedStale.filter(x => x === 'zeniths').length, 2, '两个重复区块都该清');
  assert.ok(!r.text.includes('a.example.com') && !r.text.includes('b.example.com'));
  assertInvariants(r);
});

test('脏场景: 无 base_url 的区块语义不明,保守不动', () => {
  const text = '[model_providers.mystery]\nname = "???"\n\n' +
    '[model_providers.codex_local_access]\nbase_url = "https://old.example.com/v1"\n';
  const r = patch(text);
  assert.ok(!r.removedStale.includes('mystery'));
  assert.ok(r.text.includes('[model_providers.mystery]'));
  assertInvariants(r);
});

test('脏场景: 非本地 IP / 端口 / 大小写 / 末尾斜杠的远端变体一律清', () => {
  const text = '[model_providers.byip]\nbase_url = "https://1.2.3.4/v1"\n\n' +
    '[model_providers.byport]\nbase_url = "https://relay.example.com:8443/v1"\n\n' +
    '[model_providers.byupper]\nbase_url = "HTTPS://UPPER.EXAMPLE.COM/V1"\n\n' +
    '[model_providers.byslash]\nbase_url = "https://trail.example.com/v1/"\n\n' +
    '[model_providers.codex_local_access]\nbase_url = "https://old.example.com/v1"\n';
  const r = patch(text);
  for (const id of ['byip', 'byport', 'byupper', 'byslash']) {
    assert.ok(r.removedStale.includes(id), id + ' 应被清: ' + JSON.stringify(r.removedStale));
  }
  assertInvariants(r);
});

test('脏场景: 区块内带注释行,清场不受干扰', () => {
  const text = '# 顶部注释\n[model_providers.zeniths]\n# 这是老网关,已废弃\nbase_url = "https://zeniths.codes/v1" # 行尾注释\n\n' +
    '[model_providers.localhost_sidecar]\nbase_url = "http://localhost:20573/v1"\n\n' +
    '[model_providers.codex_local_access]\nbase_url = "https://old.example.com/v1"\n';
  const r = patch(text);
  assert.ok(r.removedStale.includes('zeniths'));
  assert.ok(!r.removedStale.includes('localhost_sidecar'));
  assert.ok(r.text.includes('# 顶部注释'), '无关注释保留');
  assertInvariants(r);
});

test('脏场景: 大写表头 [Model_Providers.x] 是不同表,不碰', () => {
  const text = '[Model_Providers.weird]\nbase_url = "https://weird.example.com/v1"\n\n' +
    '[model_providers.codex_local_access]\nbase_url = "https://old.example.com/v1"\n';
  const r = patch(text);
  assert.ok(r.text.includes('[Model_Providers.weird]'), '大小写不同的表不是 model_providers,不动');
  assertInvariants(r);
});

test('脏场景: 清到只剩当前区块时父表与全文仍合法', () => {
  const text = 'model = "gpt-6-astra"\nmodel_provider = "codex_local_access"\n\n' +
    '[model_providers.zeniths]\nbase_url = "https://zeniths.codes/v1"\n\n' +
    '[mcp_servers.memory]\ncommand = "npx"\n';
  const r = patch(text);
  assert.ok(r.removedStale.includes('zeniths'));
  assert.ok(!r.text.includes('[mcp_servers.memory]') === false, '无关配置保留');
  const parsed = TOML.parse(r.text);
  assert.equal(parsed.model, 'gpt-6-astra');
  assert.ok(parsed.mcp_servers && parsed.mcp_servers.memory, '其他配置不受清场影响');
});
