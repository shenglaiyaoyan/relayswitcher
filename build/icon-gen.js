'use strict';
/** 用 Electron 离屏窗口渲染 icon.svg 一次(256px),再缩放出全部尺寸 —— 单窗口无竞态 */
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const BASE = 256;
const SIZES = [16, 24, 32, 48, 64, 128, 256];
const svg = fs.readFileSync(path.join(__dirname, '..', 'build', 'icon.svg'), 'utf8');

app.whenReady().then(async () => {
  const outDir = path.join(__dirname, '..', 'build');
  fs.mkdirSync(outDir, { recursive: true });
  const tmp = path.join(outDir, '.icon-render.html');
  fs.writeFileSync(tmp, `<!DOCTYPE html><html><head><style>
    *{margin:0;padding:0}
    html,body{background:transparent;width:${BASE}px;height:${BASE}px;overflow:hidden}
    svg{display:block;width:${BASE}px;height:${BASE}px}
  </style></head><body>${svg}</body></html>`, 'utf8');

  const win = new BrowserWindow({
    width: BASE, height: BASE, show: false, transparent: true,
    frame: false, useContentSize: true
  });
  let lastErr = null;
  let baseImg = null;
  for (let attempt = 0; attempt < 3 && !baseImg; attempt++) {
    try {
      await win.loadFile(tmp);
      await new Promise(r => setTimeout(r, 200));
      const img = await win.webContents.capturePage({ x: 0, y: 0, width: BASE, height: BASE });
      if (!img.isEmpty()) baseImg = img;
    } catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 300)); }
  }
  win.destroy();
  fs.unlinkSync(tmp);
  if (!baseImg) { console.error('render failed:', lastErr); app.exit(1); return; }

  for (const s of SIZES) {
    const out = s === BASE ? baseImg.toPNG() : baseImg.resize({ width: s, height: s, quality: 'best' }).toPNG();
    fs.writeFileSync(path.join(outDir, `icon-${s}.png`), out);
    console.log('rendered', s);
  }
  app.exit(0);
}).catch(e => { console.error(e); app.exit(1); });
