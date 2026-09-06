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
