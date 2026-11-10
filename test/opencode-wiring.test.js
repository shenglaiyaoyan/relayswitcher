'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const main = fs.readFileSync(path.join(__dirname, '../electron/main.js'), 'utf8');

test('OpenCode 列表每次从配置文件生成，保存时 Key 留空保持不变', () => {
  const list = main.slice(main.indexOf("ipcMain.handle('rs:oc:list'"), main.indexOf("ipcMain.handle('rs:oc:save'"));
  assert.match(list, /oc\.listProvidersFromConfig\(cfg, store\.listOpenCodeProviders\(\)\)/);
  assert.match(list, /store\.deleteOpenCodeProvider\(id\)/);
  const save = main.slice(main.indexOf("ipcMain.handle('rs:oc:save'"), main.indexOf("ipcMain.handle('rs:oc:remove'"));
  assert.match(save, /oc\.resolveSaveKey\(\{ id: p\.id, typed: p\.apiKey, relayKey, cfg \}\)/);
});
