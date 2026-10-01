'use strict';
/* Test: 备份去重 — 同内容文件硬链接复用(目录文件占备份 99% 且很少变化) */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { backup, listBackups } = require('../electron/lib/codex.js');

function mkHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-bak-'));
  // model_catalog_json 键决定目录文件是否进备份(listBackupFiles 从 config.toml 读)
  fs.writeFileSync(path.join(home, 'config.toml'), 'model = "gpt-5.5"\nmodel_catalog_json = "relayswitcher-model-catalog.json"\n');
  fs.writeFileSync(path.join(home, 'auth.json'), JSON.stringify({ tokens: { access_token: 'a' } }));
  fs.writeFileSync(path.join(home, 'relayswitcher-model-catalog.json'), 'X'.repeat(500 * 1024)); // 大目录文件
  return home;
}
const ino = (p) => fs.statSync(p).ino;

test('目录未变时,新备份的目录文件与旧备份同 inode(硬链接复用)', () => {
  const home = mkHome();
  backup(home, 'switch'); backup(home, 'switch2'); // reason 不同避免同秒目录撞名
  const ids = listBackups(home).map(b => b.id).sort();
  const catA = path.join(home, 'relayswitcher-backups', ids[0], 'relayswitcher-model-catalog.json');
  const catB = path.join(home, 'relayswitcher-backups', ids[1], 'relayswitcher-model-catalog.json');
  assert.equal(ino(catA), ino(catB), '同内容目录文件应硬链接合一');
  fs.rmSync(home, { recursive: true, force: true });
});

test('config/auth 每次都变,各自独立拷贝(不误伤)', () => {
  const home = mkHome();
  backup(home, 'switch');
  fs.writeFileSync(path.join(home, 'config.toml'), 'model = "gpt-6-sol"\nmodel_catalog_json = "relayswitcher-model-catalog.json"\n'); // 内容变了但保留目录键
  fs.writeFileSync(path.join(home, 'auth.json'), JSON.stringify({ tokens: { access_token: 'b' } }));
  backup(home, 'switch2');
  const ids = listBackups(home).map(b => b.id).sort();
  const base = path.join(home, 'relayswitcher-backups');
  assert.notEqual(ino(path.join(base, ids[0], 'config.toml')), ino(path.join(base, ids[1], 'config.toml')), '内容不同各自独立');
  assert.equal(ino(path.join(base, ids[0], 'relayswitcher-model-catalog.json')), ino(path.join(base, ids[1], 'relayswitcher-model-catalog.json')), '目录未变仍去重');
  fs.rmSync(home, { recursive: true, force: true });
});

test('存量压缩:预先铺好的重复备份在下次 backup 时合一', () => {
  const home = mkHome();
  // 手工铺两份胖备份(模拟 v1.11.10 前的存量)
  for (const stamp of ['20260101-000001_switch', '20260102-000001_switch']) {
    const d = path.join(home, 'relayswitcher-backups', stamp);
    fs.mkdirSync(d, { recursive: true });
    fs.copyFileSync(path.join(home, 'config.toml'), path.join(d, 'config.toml'));
    fs.copyFileSync(path.join(home, 'auth.json'), path.join(d, 'auth.json'));
    fs.copyFileSync(path.join(home, 'relayswitcher-model-catalog.json'), path.join(d, 'relayswitcher-model-catalog.json'));
  }
  backup(home, 'switch'); // 触发 compactBackupDupes
  const base = path.join(home, 'relayswitcher-backups');
  const a = path.join(base, '20260101-000001_switch', 'relayswitcher-model-catalog.json');
  const b = path.join(base, '20260102-000001_switch', 'relayswitcher-model-catalog.json');
  assert.equal(ino(a), ino(b), '存量重复目录文件被硬链接合一');
  fs.rmSync(home, { recursive: true, force: true });
});
