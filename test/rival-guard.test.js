'use strict';
/* Test: 竞品工具进程识别 — tasklist CSV 解析与模式匹配 */
const { test } = require('node:test');
const assert = require('node:assert');
const { findRivalProcesses } = require('../electron/lib/rival-guard.js');

test('识别 CockpitTools / cc-switch / CLIProxyAPI 并按工具聚合 PID', () => {
  const csv = [
    '"CockpitTools.exe","4012","Console","1","123,456 K"',
    '"cockpit-tray.exe","4013","Console","1","12,000 K"',
    '"CCSwitch Thinking Proxy.exe","5100","Console","1","45,000 K"',
    '"cli-proxy-api.exe","6200","Console","1","30,000 K"',
    '"codex.exe","7000","Console","1","500,000 K"',
    '"explorer.exe","100","Console","1","80,000 K"',
    ''
  ].join('\r\n');
  const tools = findRivalProcesses(csv);
  assert.strictEqual(tools.length, 3, '应识别 3 个工具,实际: ' + JSON.stringify(tools.map(t => t.name)));
  const byName = Object.fromEntries(tools.map(t => [t.name, t]));
  assert.ok(byName.CockpitTools && byName.CockpitTools.pids.length === 2, 'cockpit 两个进程都应聚合');
  assert.ok(byName['cc-switch'] && byName['cc-switch'].pids.includes('5100'));
  assert.ok(byName.CLIProxyAPI && byName.CLIProxyAPI.pids.includes('6200'));
});

test('cc-switch.exe 与 CCSwitch 大小写/连字符变体都命中', () => {
  const csv = '"cc-switch.exe","11","Console","1","1,000 K"\r\n"CCSwitch.exe","12","Console","1","1,000 K"';
  const tools = findRivalProcesses(csv);
  assert.strictEqual(tools.length, 1);
  assert.strictEqual(tools[0].pids.length, 2);
});

test('无关进程(codex/explorer/node)不误报', () => {
  const csv = '"codex.exe","1","Console","1","1 K"\r\n"node.exe","2","Console","1","1 K"\r\n"chrome.exe","3","Console","1","1 K"';
  assert.deepStrictEqual(findRivalProcesses(csv), []);
});

test('空输入/坏输入返回空数组不抛异常', () => {
  assert.deepStrictEqual(findRivalProcesses(''), []);
  assert.deepStrictEqual(findRivalProcesses(null), []);
  assert.deepStrictEqual(findRivalProcesses('随便的文本\n没有 CSV 结构'), []);
});
