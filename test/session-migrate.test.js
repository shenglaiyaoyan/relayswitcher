'use strict';
/* session-migrate: 切换清场后迁移旧 provider 的会话引用 — 2026-09-22 旧串报错事故产品化 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { migrateSessionFiles } = require('../electron/lib/session-migrate.js');

function makeHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-sess-'));
  fs.mkdirSync(path.join(home, 'sessions', '2026', '07', '24'), { recursive: true });
  fs.mkdirSync(path.join(home, 'archived_sessions'), { recursive: true });
  return home;
}
const K = () => process.env.TEST_BEARER_TOKEN || 'sk-replacement-token';

test('紧凑格式与带空格格式的 provider 字段都替换', async () => {
  const home = makeHome();
  const p = path.join(home, 'sessions', '2026', '07', '24', 'rollout-a.jsonl');
  fs.writeFileSync(p, [
    '{"type":"session_meta","payload":{"model_provider":"zeniths","session_id":"x"}}',
    '{"type":"turn_context","payload":{"model_provider": "zeniths"}}',
    '{"type":"turn_context","payload":{"model_provider":"codex_local_access"}}',
  ].join('\n'));
  const r = await migrateSessionFiles({ home, fromProviders: ['zeniths'], toProvider: 'codex_local_access' });
  assert.equal(r.replacements, 2, '两种格式各1处: ' + JSON.stringify(r));
  const out = fs.readFileSync(p, 'utf8');
  assert.ok(!out.includes('"model_provider":"zeniths"') && !out.includes('"model_provider": "zeniths"'));
  assert.equal((out.match(/codex_local_access/g) || []).length, 3);
});

test('对话正文里的 zeniths 字样零触碰(只动字段形态)', async () => {
  const home = makeHome();
  const p = path.join(home, 'sessions', '2026', '07', '24', 'rollout-b.jsonl');
  fs.writeFileSync(p, [
    '{"payload":{"model_provider":"zeniths"}}',
    '{"role":"user","text":"我聊到 zeniths.codes 503 和 https://dihuang.zeniths.codes/v1 的事"}',
    '{"role":"assistant","text":"zeniths zeniths zeniths 网关不行了"}',
  ].join('\n'));
  const r = await migrateSessionFiles({ home, fromProviders: ['zeniths'], toProvider: 'codex_local_access' });
  assert.equal(r.replacements, 1);
  const out = fs.readFileSync(p, 'utf8');
  assert.equal((out.match(/zeniths/g) || []).length, 5, '正文 5 处 zeniths(dihuang 域名里1+正文里4)必须原样');
  assert.ok(out.includes('我聊到 zeniths.codes 503'));
});

test('dryRun 只统计不动手不备份', async () => {
  const home = makeHome();
  const p = path.join(home, 'sessions', '2026', '07', '24', 'rollout-c.jsonl');
  fs.writeFileSync(p, '{"payload":{"model_provider":"zeniths"}}');
  const r = await migrateSessionFiles({ home, fromProviders: ['zeniths'], toProvider: 'x', dryRun: true });
  assert.equal(r.replacements, 1);
  assert.ok(fs.readFileSync(p, 'utf8').includes('"zeniths"'), 'dryRun 不得改文件');
  assert.ok(!fs.existsSync(p + '.bak-provider-migrate'), 'dryRun 不得产生备份');
});

test('实跑先备份(.bak 首次生成,幂等不重复备份),二次跑零替换', async () => {
  const home = makeHome();
  const p = path.join(home, 'sessions', '2026', '07', '24', 'rollout-d.jsonl');
  fs.writeFileSync(p, '{"payload":{"model_provider":"zeniths"}}\n{"text":"正文 zeniths 保留"}');
  const r1 = await migrateSessionFiles({ home, fromProviders: ['zeniths'], toProvider: 'codex_local_access' });
  assert.equal(r1.replacements, 1);
  const bak = p + '.bak-provider-migrate';
  assert.ok(fs.existsSync(bak), '首跑必须备份');
  assert.ok(fs.readFileSync(bak, 'utf8').includes('"zeniths"'), '备份保留原始内容');
  const r2 = await migrateSessionFiles({ home, fromProviders: ['zeniths'], toProvider: 'codex_local_access' });
  assert.equal(r2.replacements, 0, '幂等: 二次跑零替换');
  assert.ok(fs.existsSync(bak), '二次跑不得覆盖首次备份');
});

test('archived_sessions 同样扫描,无匹配文件零动作', async () => {
  const home = makeHome();
  fs.writeFileSync(path.join(home, 'archived_sessions', 'rollout-e.jsonl'),
    '{"payload":{"model_provider":"zeniths"}}');
  const r = await migrateSessionFiles({ home, fromProviders: ['zeniths'], toProvider: 'codex_local_access' });
  assert.equal(r.replacements, 1);
  const r2 = await migrateSessionFiles({ home, fromProviders: ['不存在的'], toProvider: 'x' });
  assert.equal(r2.files, 0);
});

test('多个 fromProviders 一次迁移', async () => {
  const home = makeHome();
  const p = path.join(home, 'sessions', '2026', '07', '24', 'rollout-f.jsonl');
  fs.writeFileSync(p, '{"a":{"model_provider":"zeniths"}}\n{"b":{"model_provider":"old-relay"}}');
  const r = await migrateSessionFiles({ home, fromProviders: ['zeniths', 'old-relay'], toProvider: 'codex_local_access' });
  assert.equal(r.replacements, 2);
});
