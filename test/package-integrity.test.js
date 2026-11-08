'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// 2026-11-08：PowerShell 改版本号时把引号写成 \"，package-lock.json 损坏却随 v1.17.2 发布。
test('package.json 与 package-lock.json 是合法 JSON，版本号一致', () => {
  const read = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
  const pkg = read('package.json');
  const lock = read('package-lock.json');
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
});
