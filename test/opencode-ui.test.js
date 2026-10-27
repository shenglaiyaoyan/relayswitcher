'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// 根因:新增档位输入框未声明 type=text,绕过全局输入框的深色主题样式,
// 在深色卡片上回落为浏览器默认黑字。修复必须让它命中现有输入框样式,而非只改截图。
test('OpenCode 新增档位输入框是文本输入,可命中深色主题输入框样式', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/pages/OpenCode.jsx'), 'utf8');
  assert.match(source,
    /<input[^>]*type="text"[^>]*value=\{newEffort\}/,
    '新增档位输入框必须显式 type=text;否则会显示为深色背景上的黑字');
});
