'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const TOML = require('@iarna/toml');
const codex = require('../electron/lib/codex');

const providerOf = home => TOML.parse(fs.readFileSync(path.join(home, 'config.toml'), 'utf8')).model_providers.codex_local_access;

test('patchProviderBlock 默认 requires_openai_auth = true，传 false 时写 false', () => {
  const def = codex.patchProviderBlock('', 'codex_local_access', {
    name: 'Relay', baseUrl: 'https://relay.example.com/v1', apiKey: 'sk-1'
  });
  assert.equal(TOML.parse(def.text).model_providers.codex_local_access.requires_openai_auth, true);

  const off = codex.patchProviderBlock(def.text, 'codex_local_access', {
    name: 'Relay', baseUrl: 'https://relay.example.com/v1', apiKey: 'sk-1', requiresOpenaiAuth: false
  });
  assert.equal(TOML.parse(off.text).model_providers.codex_local_access.requires_openai_auth, false);
});

test('仅中转切换（无 auth.json）：写 requires_openai_auth = false，不创建 auth.json，状态正确识别', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-relayonly-empty-'));
  try {
    const r = codex.applySwitch({
      home,
      account: null,
      relay: { name: 'Relay', baseUrl: 'https://relay.example.com/v1', apiKey: 'sk-only' },
      model: 'gpt-6.2-sol',
      providerId: 'codex_local_access',
      catalogEnabled: false
    });
    assert.equal(r.ok, true, r.error);
    const prov = providerOf(home);
    assert.equal(prov.requires_openai_auth, false);
    assert.equal(prov.base_url, 'https://relay.example.com/v1');
    assert.equal(prov.experimental_bearer_token, 'sk-only');
    assert.equal(fs.existsSync(path.join(home, 'auth.json')), false, '无账号模式不得创建 auth.json');
    assert.ok(r.log.some(l => l.name === '写入登录态（跳过）' && l.ok === true));

    const st = codex.getStatus(home);
    assert.equal(st.tomlOk, true);
    assert.equal(st.baseUrl, 'https://relay.example.com/v1');
    assert.equal(st.requiresOpenaiAuth, false);
    assert.equal(st.authExists, false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('仅中转切换（已有 auth.json）：不改不删原 auth.json，切回账号模式恢复 requires_openai_auth = true', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-relayonly-keep-'));
  try {
    const origAuth = JSON.stringify({
      custom: 1,
      tokens: { id_token: 'old.i.d', access_token: 'old-at', refresh_token: 'old-rt', account_id: 'acc-old' }
    }, null, 2) + '\n';
    fs.writeFileSync(path.join(home, 'auth.json'), origAuth);

    const r1 = codex.applySwitch({
      home,
      account: null,
      relay: { name: 'Relay', baseUrl: 'https://relay.example.com/v1', apiKey: 'sk-only' },
      model: 'gpt-6.2-sol',
      providerId: 'codex_local_access',
      catalogEnabled: false,
      baseUrlOverride: 'http://127.0.0.1:18767'
    });
    assert.equal(r1.ok, true, r1.error);
    assert.equal(fs.readFileSync(path.join(home, 'auth.json'), 'utf8'), origAuth, '原 auth.json 必须字节未动');
    assert.equal(providerOf(home).requires_openai_auth, false);
    assert.equal(providerOf(home).base_url, 'http://127.0.0.1:18767');
    assert.equal(codex.getStatus(home).requiresOpenaiAuth, false);

    // 切回带账号模式
    const r2 = codex.applySwitch({
      home,
      account: { tokens: { id_token: 'new.i.d', access_token: 'new-at', refresh_token: 'new-rt', account_id: 'acc-new' } },
      relay: { name: 'Relay', baseUrl: 'https://relay.example.com/v1', apiKey: 'sk-only' },
      model: 'gpt-6.2-sol',
      providerId: 'codex_local_access',
      catalogEnabled: false
    });
    assert.equal(r2.ok, true, r2.error);
    assert.equal(providerOf(home).requires_openai_auth, true);
    assert.equal(codex.getStatus(home).requiresOpenaiAuth, true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(home, 'auth.json'), 'utf8')).tokens.account_id, 'acc-new');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
