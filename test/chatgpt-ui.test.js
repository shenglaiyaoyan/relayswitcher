'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = name => fs.readFileSync(path.join(__dirname, '../src', name), 'utf8');

test('切换流程五步由 onSwitchStep 日志推导：完成 / 出错 / 进行中', async () => {
  const { STAGES, stageStates } = await import('../src/pages/chatgpt/pipeline.mjs');
  assert.deepEqual(STAGES.map(s => s.label), ['备份当前配置', '写入登录态', '流量指向中转站', '部署模型目录', '校验']);
  assert.deepEqual(stageStates([], false), ['idle', 'idle', 'idle', 'idle', 'idle']);
  const log = [
    { name: '竞品工具检测', ok: true }, { name: '目录生成', ok: true }, { name: '备份当前配置', ok: true },
    { name: '写入登录态 auth.json', ok: true }
  ];
  assert.deepEqual(stageStates(log, true), ['done', 'done', 'active', 'done', 'idle']);
  const failed = [...log, { name: '流量指向中转站', ok: false }];
  assert.deepEqual(stageStates(failed, false), ['done', 'done', 'error', 'done', 'idle']);
  const all = [...log, { name: '流量指向中转站', ok: true }, { name: '校验完成', ok: true }];
  assert.deepEqual(stageStates(all, false), ['done', 'done', 'done', 'done', 'done']);
  const relayFallback = [{ name: '目录生成', ok: false, detail: '回落官方目录' }];
  assert.equal(stageStates(relayFallback, false)[3], 'warn');
});

test('ChatGPT 页：控制台两栏，去掉步骤编号和终端日志框，目录只有官方/中转两项', () => {
  const page = read('pages/Dashboard.jsx');
  assert.doesNotMatch(page, /step-num|>0[123]</);
  assert.doesNotMatch(page, /className="logbox"/);
  assert.doesNotMatch(page, /不部署|本机提取/);
  assert.match(page, /官方目录/);
  assert.match(page, /中转目录/);
  for (const t of ['切换', '当前状态', '最近备份', '登录态', '流量出口', '切换流程']) assert.match(page, new RegExp(t));
  assert.match(page, /className="cg-grid"/);
  assert.match(page, /backups\.slice\(0, 3\)/);
  // 保留：Codex 运行拦截、竞品提醒、回滚
  for (const t of ['帮我关闭并切换', '仍要切换', '我去手动退出', 'detectRivals', 'restoreBackup', '一键回滚']) assert.match(page, new RegExp(t));
});

test('ChatGPT 页每个按钮都有自定义背景和边框', () => {
  const css = read('styles.css');
  const src = read('pages/Dashboard.jsx');
  const classes = new Set();
  for (const m of src.matchAll(/<button[^>]*?className=\{?["'`]([^"'`]+)/g)) classes.add(m[1].trim().split(/\s+/)[0]);
  assert.doesNotMatch(src, /<button(?![^>]*className)[^>]*>/);
  for (const c of classes) {
    const rules = [...css.matchAll(new RegExp('[^}]*\\.' + c.replace(/-/g, '\\-') + '\\b[^{]*\\{([^}]*)\\}', 'g'))].map(m => m[1]);
    assert.ok(rules.some(r => /background/.test(r)) && rules.some(r => /border\s*:/.test(r)), `按钮类 .${c} 缺少 background 或 border`);
  }
});
