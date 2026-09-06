'use strict';
/** 性能基准:跑在 Electron 主进程(npx electron bench.js),测真实 DPAPI/safeStorage 成本 */
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

app.whenReady().then(() => {
  const t = (label, fn, n = 10) => {
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < n; i++) fn();
    const ms = Number(process.hrtime.bigint() - t0) / 1e6 / n;
    console.log(`  ${label}: ${ms.toFixed(2)} ms/次 (×${n})`);
    return ms;
  };

  console.log('== 1. store.listAccounts(50 账号,含逐账号解密 hasRefreshToken) ==');
  const { createStore } = require('./electron/lib/store');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-bench-'));
  const store = createStore(path.join(dir, 'userData')); store.load();
  const tok = JSON.stringify({ id_token: 'x.y.' + Buffer.from('{"email":"a@b.c"}').toString('base64'),
    access_token: 'a'.repeat(1700), refresh_token: 'r'.repeat(200), account_id: 'id-1' });
  t('  导入 50 账号(一次性)', () => store.addAccount(tok), 50);
  const listMs = t('listAccounts', () => store.listAccounts());

  console.log('== 2. 目录解析(读+parse 500KB)+ 自定义模型合并 ==');
  const { mergeCustomModels } = require('./electron/lib/catalog-merge');
  const catPath = path.join(__dirname, 'resources', 'model-catalog.json');
  t('读文件+JSON.parse 目录', () => JSON.parse(fs.readFileSync(catPath, 'utf8')));
  let cat = JSON.parse(fs.readFileSync(catPath, 'utf8'));
  const cms = Array.from({ length: 10 }, (_, i) => ({ id: 'i' + i, templateSlug: 'gpt-5.5', slug: 'custom-' + i, displayName: 'C' + i, contextWindow: 872000 }));
  t('mergeCustomModels(10 条)', () => mergeCustomModels(cat, cms));

  console.log('== 3. getStatus(读 config.toml + TOML.parse + auth + JWT×2) ==');
  const codex = require('./electron/lib/codex');
  t('getStatus(本机 ~/.codex,只读)', () => codex.getStatus(codex.defaultCodexHome()));

  console.log('== 4. 前端 parsePreview 等价(100KB JSON 数组文本) ==');
  const big = JSON.stringify(Array.from({ length: 50 }, () => JSON.parse(tok)));
  t(`JSON.parse(${(big.length / 1024).toFixed(0)}KB 数组)`, () => JSON.parse(big));

  console.log(`\n结论数据: listAccounts=${listMs.toFixed(2)}ms`);
  fs.rmSync(dir, { recursive: true, force: true });
  app.exit(0);
}).catch(e => { console.error(e); app.exit(1); });
