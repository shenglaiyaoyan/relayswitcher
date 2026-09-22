'use strict';
/* Test: patchProviderBlock preserves existing http_headers + reuse same provider ID */
const { test } = require('node:test');
const assert = require('node:assert');
const { patchProviderBlock } = require('../electron/lib/codex.js');

/** Helper to create TOML document text */
function doc(lines) { return lines.join('\n'); }

/* RED - tests that current implementation FAILS */

test('patchProviderBlock preserves existing http_headers when updating base_url', () => {
  const original = doc([
    '[model_providers.codex_local_access]',
    'name = "Codex API Service"',
    'base_url = "http://localhost:20573/v1"',
    'wire_api = "responses"',
    'requires_openai_auth = false',
    'experimental_bearer_token = "agt_codex_OLD"',
    'supports_websockets = false',
    'http_headers = { x-cockpit-instance-id = ".codex", x-openai-actor-authorization = "cockpit-tools" }',
  ]);
  
  const result = patchProviderBlock(original, 'codex_local_access', {
    name: 'Codex API Service',
    baseUrl: 'https://api.zeniths.codes/v1',
    apiKey: process.env.TEST_BEARER_TOKEN || 'sk-replacement-token'
  });
  
  // Assert: http_headers unchanged in result.text
  const newText = result.text;
  if (!newText.includes('x-cockpit-instance-id')) {
    throw new Error('FAILED: http_headers were NOT preserved. Original had x-cockpit-instance-id but it is gone.');
  }
  if (!newText.includes('x-openai-actor-authorization')) {
    throw new Error('FAILED: http_headers x-openai-actor-authorization removed.');
  }
});

test('patchProviderBlock does not remove non-managed providers (zeniths stays)', () => {
  const original = doc([
    '[model_providers.zeniths]',
    'name = "Zeniths Relay"',
    'base_url = "https://zeniths.codes/v1"',
    'wire_api = "responses"',
    'requires_openai_auth = false',
    'experimental_bearer_token = "sk-OLD"',
    
    '[model_providers.codex_local_access]',
    'base_url = "http://localhost:20573/v1"',
  ]);
  
  const result = patchProviderBlock(original, 'codex_local_access', {
    name: 'Codex API Service',
    baseUrl: 'https://api.zeniths.codes/v1',
    apiKey: process.env.TEST_BEARER_TOKEN || 'sk-replacement-token'
  });
  
  // Assert: zeniths block still present
  if (!result.text.includes('[model_providers.zeniths]')) {
    throw new Error('FAILED: zeniths provider was incorrectly removed.');
  }
});

test('patchProviderBlock only returns stale ids for localhost-based providers', () => {
  const original = doc([
    '[model_providers.local_sidecar]',
    'base_url = "http://localhost:62309/v1"',
    '[model_providers.zeniths]',
    'base_url = "https://zeniths.codes/v1"',
  ]);
  
  const result = patchProviderBlock(original, 'codex_local_access', {
    baseUrl: 'https://api.zeniths.codes/v1',
    apiKey: process.env.TEST_BEARER_TOKEN || 'sk-replacement-token'
  }, { pruneLocalProviders: true });
  
  // Assert: only local_sidecar should be in removedStale (not zeniths)
  if (!Array.isArray(result.removedStale)) {
    throw new Error('removedStale must be array');
  }
  if (!result.removedStale.includes('local_sidecar')) {
    throw new Error('Expected local_sidecar to be marked as stale (localhost provider).');
  }
  if (result.removedStale.includes('zeniths')) {
    throw new Error('ERROR: zeniths (HTTPS provider) should NOT be removed as stale.');
  }
});

/* ---------------- 清场:切换时清掉远端老路由(2026-09-22 用户事故) ---------------- */

test('pruneRemoteProviders: true 时清掉 https 老路由区块,保留 localhost 本机网关与当前 provider', () => {
  const original = doc([
    'model_provider = "codex_local_access"',
    '',
    '[model_providers.zeniths]',
    'name = "Zeniths Relay"',
    'base_url = "https://zeniths.codes/v1"',
    'experimental_bearer_token = "sk-old"',
    '',
    '[model_providers.localhost_sidecar]',
    'base_url = "http://localhost:20573/v1"',
    'experimental_bearer_token = "agt_keep"',
    '',
    '[model_providers.codex_local_access]',
    'base_url = "https://dihuang.zeniths.codes/v1"',
    'experimental_bearer_token = "dh-new"',
  ]);

  const result = patchProviderBlock(original, 'codex_local_access', {
    name: 'DIHUANG2API',
    baseUrl: 'https://dihuang.zeniths.codes/v1',
    apiKey: process.env.TEST_BEARER_TOKEN || 'sk-replacement-token'
  }, { pruneRemoteProviders: true });

  if (!result.removedStale.includes('zeniths')) {
    throw new Error('zeniths(https 老路由)应被清理,实际 removedStale: ' + JSON.stringify(result.removedStale));
  }
  if (result.removedStale.includes('localhost_sidecar')) {
    throw new Error('localhost_sidecar(本机网关,如 CockpitTools sidecar)绝不能被清理');
  }
  if (!result.text.includes('[model_providers.localhost_sidecar]')) {
    throw new Error('localhost 区块正文必须保留');
  }
  if (!result.text.includes('[model_providers.codex_local_access]')) {
    throw new Error('当前 provider 区块必须保留');
  }
  if (result.text.includes('[model_providers.zeniths]') || result.text.includes('sk-old')) {
    throw new Error('老路由 zeniths 区块必须连根清干净');
  }
});

test('pruneRemoteProviders 默认 false(向后兼容,不传 opt 不清理)', () => {
  const original = doc([
    '[model_providers.zeniths]',
    'base_url = "https://zeniths.codes/v1"',
    '',
    '[model_providers.codex_local_access]',
    'base_url = "https://old.example.com/v1"',
  ]);
  const result = patchProviderBlock(original, 'codex_local_access', {
    baseUrl: 'https://dihuang.zeniths.codes/v1',
    apiKey: process.env.TEST_BEARER_TOKEN || 'sk-replacement-token'
  });
  if (!result.text.includes('[model_providers.zeniths]')) {
    throw new Error('默认行为不应清理远端区块(需显式 opt-in)');
  }
});
