'use strict';
// Run with Electron, loading the updater actually shipped inside the ASAR.
const path = require('node:path');
const fs = require('node:fs');
const { app } = require('electron');
const { verifyUpdateConfig } = require('./verify-update-config.cjs');
const resources = path.resolve(process.argv[2]);
const userData = path.resolve(process.argv[3]);
fs.mkdirSync(userData, { recursive: true });
app.setPath('userData', userData);
app.whenReady().then(async () => {
  const { NsisUpdater } = require(path.join(resources, 'app.asar', 'node_modules', 'electron-updater'));
  const loaded = await verifyUpdateConfig(resources, NsisUpdater);
  console.log(JSON.stringify({ packagedUpdaterLoaded: true, ...loaded }));
  app.exit(0);
}).catch(error => {
  console.error(error.message);
  app.exit(1);
});
