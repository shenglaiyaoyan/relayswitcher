'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const yaml = createRequire(require.resolve('electron-updater'))('js-yaml');
const root = path.join(__dirname, '..');

test('自动更新配置作为独立资源复制，dir/prepackaged 打包也不得漏掉', () => {
  const config = yaml.load(fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8'));
  const resource = config.extraResources.find(item => item.to === 'app-update.yml');
  assert.ok(resource, '必须显式打包 resources/app-update.yml，不能依赖 NSIS 隐式生成');
  const actual = yaml.load(fs.readFileSync(path.join(root, resource.from), 'utf8'));
  const publish = config.publish.find(item => item.provider === 'github');
  assert.equal(actual.provider, publish.provider);
  assert.equal(actual.owner, publish.owner);
  assert.equal(actual.repo, publish.repo);
  assert.equal(actual.updaterCacheDirName, 'relayswitcher-updater');
});

test('发布门禁使用真实 electron-updater 加载配置，并拒绝缺失或错误目标', async t => {
  const { verifyUpdateConfig } = require('../scripts/verify-update-config.cjs');
  const resources = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-update-config-'));
  t.after(() => fs.rmSync(resources, { recursive: true, force: true }));
  await assert.rejects(verifyUpdateConfig(resources), /ENOENT/);
  const file = path.join(resources, 'app-update.yml');
  fs.copyFileSync(path.join(root, 'build/app-update.yml'), file);
  const loaded = await verifyUpdateConfig(resources);
  assert.deepEqual(loaded, { provider: 'github', owner: 'shenglaiyaoyan', repo: 'relayswitcher', updaterCacheDirName: 'relayswitcher-updater' });
  fs.writeFileSync(file, 'provider: github\nowner: wrong-owner\nrepo: relayswitcher\nupdaterCacheDirName: relayswitcher-updater\n');
  await assert.rejects(verifyUpdateConfig(resources), /owner/);
  fs.writeFileSync(file, 'provider: github\nowner: shenglaiyaoyan\nrepo: relayswitcher\n');
  await assert.rejects(verifyUpdateConfig(resources), /updaterCacheDirName/);
});
