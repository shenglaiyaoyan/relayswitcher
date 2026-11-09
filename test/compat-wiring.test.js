'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('主进程接线：切换带本机地址、切换/回滚/启动后同步代理、托盘退出先确认、设置默认值', () => {
  const main = read('electron/main.js');
  assert.match(main, /createCompatManager\(\{/);
  assert.match(main, /baseUrlOverride: opts\.compat \? compatBaseUrl\(compatPort\) : null/);
  assert.match(main, /compatMode: !!opts\.compat/);
  assert.ok((main.match(/compat\.sync\(codex\.getStatus\(codexHome\(\)\)\)/g) || []).length >= 3, '切换、回滚、启动三处同步');
  assert.match(main, /label: '退出', click: \(\) => requestQuit\(\)/);
  assert.match(main, /兼容模式正在使用/);
  const store = read('electron/lib/store.js');
  assert.match(store, /compatMode: false/);
  assert.match(store, /compatPort: 18767/);
  assert.match(store, /compatRelayId: ''/);
});
