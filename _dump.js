'use strict';
const { app, BrowserWindow, crashReporter } = require('electron');
const path = require('path'), os = require('os'), fs = require('fs');
const db = path.join(os.tmpdir(), 'rs-cp');
fs.mkdirSync(db, { recursive: true });
crashReporter.start({ submitURL: '', uploadToServer: false });
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1000, height: 700, backgroundColor: '#0a0a0a' });
  win.loadURL('data:text/html,<body style="background:#0a0a0a;color:#fff">ok</body>');
  win.webContents.on('render-process-gone', (_e, d) => console.error('[render-gone]', d.reason, d.exitCode));
});
app.on('window-all-closed', () => app.quit());
