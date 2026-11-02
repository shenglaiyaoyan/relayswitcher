'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf8');
const main = fs.readFileSync(path.join(__dirname, '../electron/main.js'), 'utf8');

// 2026-11-02 实测：侧栏「已绑定」绿点无限呼吸动画（位于 backdrop-filter 侧栏内）让 GPU 进程常驻 59–68% 单核。
test('常驻元素不得有无限动画；无限动画只允许出现在加载/执行中的临时状态', () => {
  const allowed = /\.(spinner|spin|switching|skeleton|log-cursor)\b/;
  for (const m of css.matchAll(/([^{}]+)\{([^}]*animation:[^};]*infinite[^}]*)\}/g)) {
    const selector = m[1].trim();
    assert.match(selector, allowed, `持续无限动画会让 GPU 一直重绘：${selector}`);
  }
  const dotOk = css.match(/\.dot\.ok\s*\{([^}]*)\}/);
  assert.ok(dotOk, '.dot.ok 规则存在');
  assert.doesNotMatch(dotOk[1], /animation/);
});

test('侧栏不使用 backdrop-filter（背后是纯色，模糊无可见效果却让子元素变化时整栏重算）', () => {
  const side = css.match(/\n\.side\s*\{([^}]*)\}/);
  assert.ok(side, '.side 规则存在');
  assert.doesNotMatch(side[1], /backdrop-filter/);
});

test('窗口隐藏到托盘时开启后台降频，显示时恢复不降频', () => {
  assert.match(main, /win\.on\('hide',\s*\(\)\s*=>\s*win\.webContents\.setBackgroundThrottling\(true\)\)/);
  assert.match(main, /win\.on\('show',\s*\(\)\s*=>\s*win\.webContents\.setBackgroundThrottling\(false\)\)/);
});
