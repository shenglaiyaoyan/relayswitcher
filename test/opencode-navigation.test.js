'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { setNavigationGuard, canLeavePage, handleHashNavigation } = require('../src/pages/opencode/navigationGuard.js');

test('OpenCode 未保存离开守卫：无草稿放行，有草稿阻止并提示', () => {
  setNavigationGuard(null);
  assert.equal(canLeavePage(), true);
  let prompted = 0;
  setNavigationGuard(() => { prompted++; return false; });
  assert.equal(canLeavePage(), false);
  assert.equal(prompted, 1);
  setNavigationGuard(() => true);
  assert.equal(canLeavePage(), true);
  setNavigationGuard(null);
});

test('hash 导航取消时恢复原地址，再次导航仍会询问；确认后才跳转', () => {
  setNavigationGuard(null);
  let hash = '#opencode';
  const location = { get hash() { return hash; }, replace(value) { hash = value; } };
  let target = '';
  let replaceHash;
  const route = r => { target = r.page; hash = r.hash; replaceHash(r.hash); };
  replaceHash = value => { hash = value; };
  const handler = handleHashNavigation({ location, currentHash: () => '#opencode', replaceHash, parseHash: () => ({ page: 'relays', subMode: 'global' }), navigate: route });
  const attempt = () => { hash = '#relays'; handler(); }; // hashchange 前浏览器已更新地址
  let asks = 0;
  setNavigationGuard(() => { asks++; return false; });
  attempt();
  assert.equal(hash, '#opencode');
  assert.equal(target, '');
  attempt();
  assert.equal(asks, 2);
  setNavigationGuard(resume => { asks++; resume(); return false; });
  attempt();
  assert.equal(target, 'relays');
  assert.equal(hash, '#relays');
  setNavigationGuard(null);
});
