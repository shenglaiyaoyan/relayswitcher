'use strict';
/* Test: token 刷新失败响应的错误提取 — 兼容对象形态 error(实测 auth.openai.com 返回) */
const { test } = require('node:test');
const assert = require('node:assert');
const { extractTokenError } = require('../electron/lib/oauth-errors.js');

test('对象形态 error(实测 401 token_expired)显示真实 code + 失效提示', () => {
  // 2026-09-18 实测响应: HTTP 401, {"error":{"message":"Could not validate your token...","type":"invalid_request_error","code":"token_expired"}}
  const out = extractTokenError({
    error: { message: 'Could not validate your token. Please try signing in again.', type: 'invalid_request_error', param: null, code: 'token_expired' }
  }, 401);
  assert.ok(out.includes('token_expired'), '应含真实错误码 token_expired,实际: ' + out);
  assert.ok(out.includes('已失效'), 'token 过期应提示已失效而非检查网络,实际: ' + out);
  assert.ok(!out.includes('object Object'), '不得出现 [object Object]');
  assert.ok(!out.includes('请检查网络'), '401 token 失效不得再伪装成网络问题');
});

test('字符串形态 invalid_grant 保持原失效提示(经典 OAuth 兼容)', () => {
  const out = extractTokenError({ error: 'invalid_grant' }, 400);
  assert.ok(out.includes('invalid_grant'));
  assert.ok(out.includes('已失效'));
});

test('无 error 字段时显示 HTTP 状态码', () => {
  const out = extractTokenError({}, 418);
  assert.ok(out.includes('HTTP 418'), '实际: ' + out);
});

test('429 显示频控专用提示(不得伪装成网络问题)', () => {
  const out = extractTokenError({ error: { code: 'rate_limit_exceeded' } }, 429);
  assert.ok(out.includes('频控') || out.includes('稍后再试'), '实际: ' + out);
  assert.ok(!out.includes('请检查网络'));
});

test('5xx 显示服务端错误提示', () => {
  const out = extractTokenError({}, 503);
  assert.ok(out.includes('服务端错误'), '实际: ' + out);
});

test('对象形态但 code 缺失时回退到 type 再到 HTTP 状态码', () => {
  const out = extractTokenError({ error: { type: 'some_error', message: 'x' } }, 400);
  assert.ok(out.includes('some_error') && !out.includes('object Object'), '实际: ' + out);
});
