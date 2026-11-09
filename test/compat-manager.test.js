'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCompatManager, compatBaseUrl, compatPortFromBaseUrl, DEFAULT_COMPAT_PORT } = require('../electron/lib/compat-manager');

test('本机地址与端口互转', () => {
  assert.equal(DEFAULT_COMPAT_PORT, 18767);
  assert.equal(compatBaseUrl(18767), 'http://127.0.0.1:18767');
  assert.equal(compatPortFromBaseUrl('http://127.0.0.1:18767/'), 18767);
  assert.equal(compatPortFromBaseUrl('http://127.0.0.1:3000/v1'), null);
  assert.equal(compatPortFromBaseUrl('https://relay.example.com/v1'), null);
  assert.equal(compatPortFromBaseUrl(null), null);
});

test('按配置决定是否运行；换端口先起新再停旧；起新失败保留旧；不接管用户自己的本机网关', async () => {
  const events = [];
  const busy = new Set([19002]);
  const createProxy = ({ port }) => ({
    port,
    async start() {
      if (busy.has(port)) { const e = new Error('listen EADDRINUSE'); e.code = 'EADDRINUSE'; throw e; }
      events.push('start ' + port);
    },
    async stop() { events.push('stop ' + port); }
  });
  let settings = { compatMode: true, compatRelayId: 'r1' };
  const relays = { r1: { id: 'r1', baseUrl: 'https://relay.example.com/v1' } };
  const getRelay = id => { if (!relays[id]) throw new Error('中转站不存在'); return relays[id]; };
  const mgr = createCompatManager({ getSettings: () => settings, getRelay, createProxy });
  const local = port => ({ baseUrl: compatBaseUrl(port) });

  await mgr.sync(local(19001));
  assert.deepEqual(events, ['start 19001']);
  assert.deepEqual(mgr.info(local(19001)), { active: true, port: 19001, running: true, relayId: 'r1', requests: 0, rewritten: 0, error: '' });

  const failed = await mgr.ensure(19002);
  assert.equal(failed.ok, false);
  assert.match(failed.error, /19002 被占用/);
  assert.equal(mgr.isServing(), true);
  assert.deepEqual(events, ['start 19001']);

  assert.deepEqual(await mgr.ensure(19003), { ok: true, port: 19003 });
  assert.deepEqual(events, ['start 19001', 'start 19003', 'stop 19001']);
  assert.equal(mgr.info(local(19003)).error, '');

  await mgr.sync({ baseUrl: 'https://relay.example.com/v1' });
  assert.deepEqual(events.slice(-1), ['stop 19003']);
  assert.equal(mgr.isServing(), false);
  assert.equal(mgr.info({ baseUrl: 'https://relay.example.com/v1' }).active, false);

  settings = { compatMode: false, compatRelayId: 'r1' };
  await mgr.sync(local(19001));
  assert.equal(mgr.isServing(), false);

  settings = { compatMode: true, compatRelayId: 'gone' };
  assert.equal(mgr.info(local(19001)).active, false);
});
