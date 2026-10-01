'use strict';
/* Test: 官方已废弃配置键清理 — guardianv2.thread_context 摘除(含 profile 覆盖/空段收尾) */
const { test } = require('node:test');
const assert = require('node:assert');
const { stripDeprecatedKeys } = require('../electron/lib/codex.js');

test('摘除 [features.guardianv2] 下的 thread_context,段内其它键保留', () => {
  const out = stripDeprecatedKeys([
    'model = "gpt-5.5"',
    '[features.guardianv2]',
    'thread_context = true',
    'async_scorer = true',
    '[mcp_servers.memory]',
    'command = "npx"'
  ].join('\n'));
  assert.ok(!out.includes('thread_context'), '废弃键被摘除');
  assert.ok(out.includes('async_scorer = true'), '同段其它键保留');
  assert.ok(out.includes('[features.guardianv2]'), '段还有键,段头保留');
  assert.ok(out.includes('[mcp_servers.memory]'), '无关段不动');
});

test('段被清空则连段头一起移除', () => {
  const out = stripDeprecatedKeys([
    'model = "gpt-5.5"',
    '',
    '[features.guardianv2]',
    'thread_context = true',
    '',
    '[mcp_servers.memory]',
    'command = "npx"'
  ].join('\n'));
  assert.ok(!out.includes('thread_context'));
  assert.ok(!out.includes('[features.guardianv2]'), '空段段头一并移除');
  assert.ok(out.includes('[mcp_servers.memory]'));
});

test('profile 覆盖段 [profiles.x.features.guardianv2] 同样清理', () => {
  const out = stripDeprecatedKeys([
    '[profiles.work.features.guardianv2]',
    'thread_context = false',
    '[profiles.work]',
    'model = "gpt-6-sol"'
  ].join('\n'));
  assert.ok(!out.includes('thread_context'), 'profile 覆盖段的废弃键被摘除');
  assert.ok(out.includes('[profiles.work]'), 'profile 主段不受影响');
});

test('同名键在无关段不动(防误伤)', () => {
  const out = stripDeprecatedKeys([
    '[features.other]',
    'thread_context = true',
    '[guardianv2]',
    'thread_context = true'
  ].join('\n'));
  assert.equal((out.match(/thread_context/g) || []).length, 2, '无关段的同名键原样保留');
});

test('无命中时文本逐字节不变', () => {
  const t = 'model = "x"\n\n[mcp_servers.memory]\ncommand = "npx"\n';
  assert.equal(stripDeprecatedKeys(t), t);
});
