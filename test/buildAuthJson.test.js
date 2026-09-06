'use strict';
/* Test: buildAuthJson 切换到 OAuth tokens 模式时必须清除 API-key 模式的伴生标记 */
const { test } = require('node:test');
const assert = require('node:assert');
const { buildAuthJson } = require('../electron/lib/codex.js');

test('buildAuthJson 移除旧 auth_mode 标记(apikey → tokens 模式切换)', () => {
  const existing = JSON.stringify({
    OPENAI_API_KEY: 'placeholder-old-key',
    auth_mode: 'apikey'
  });
  const out = JSON.parse(buildAuthJson(existing, {
    id_token: 'placeholder-id', access_token: 'placeholder-access',
    refresh_token: 'placeholder-refresh', account_id: 'placeholder-acc'
  }));
  assert.ok(out.tokens && out.tokens.access_token, 'tokens 应写入');
  assert.equal(out.OPENAI_API_KEY, undefined, 'OPENAI_API_KEY 应移除');
  assert.equal(out.auth_mode, undefined, 'auth_mode 是 API-key 模式标记,切 tokens 模式时必须一并移除——残留会让 codex 判定未登录');
});

test('buildAuthJson 保留真正无关的用户字段', () => {
  const existing = JSON.stringify({
    OPENAI_API_KEY: 'placeholder-old-key',
    auth_mode: 'apikey',
    some_future_field: 'keep-me'
  });
  const out = JSON.parse(buildAuthJson(existing, {
    id_token: 'placeholder-id', access_token: 'placeholder-access',
    refresh_token: 'placeholder-refresh', account_id: 'placeholder-acc'
  }));
  assert.equal(out.some_future_field, 'keep-me');
  assert.equal(out.auth_mode, undefined);
});
