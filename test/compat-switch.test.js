'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const TOML = require('@iarna/toml');
const codex = require('../electron/lib/codex');

const switchIn = (home, over) => codex.applySwitch({
  home, account: { tokens: { id_token: 'a.b.c', access_token: 'at', refresh_token: 'rt', account_id: 'acc-1' } },
  relay: { name: 'Relay', baseUrl: 'https://relay.example.com/v1', apiKey: 'sk-relay' },
  model: 'gpt-6-astra', providerId: 'codex_local_access', catalogEnabled: false, ...over
});
const providerOf = home => TOML.parse(fs.readFileSync(path.join(home, 'config.toml'), 'utf8')).model_providers.codex_local_access;

test('兼容模式：provider 写本机代理地址，Key 仍是中转站 Key，写后复查按实际地址比对；关闭后写回中转地址', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-compat-'));
  try {
    const on = switchIn(home, { baseUrlOverride: 'http://127.0.0.1:18767' });
    assert.equal(on.ok, true, on.error);
    assert.equal(providerOf(home).base_url, 'http://127.0.0.1:18767');
    assert.equal(providerOf(home).experimental_bearer_token, 'sk-relay');
    assert.equal(on.log.find(l => l.name === '流量指向中转站').detail, '经本机兼容代理 http://127.0.0.1:18767 → https://relay.example.com/v1');
    const off = switchIn(home, {});
    assert.equal(off.ok, true, off.error);
    assert.equal(providerOf(home).base_url, 'https://relay.example.com/v1');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
