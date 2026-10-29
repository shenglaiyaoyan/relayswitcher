'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const asar = require('@electron/asar');
const { path7za } = require('7zip-bin');
const yaml = createRequire(require.resolve('electron-updater'))('js-yaml');
const { verifyUpdateConfig } = require('./verify-update-config.cjs');
const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

async function verifyPayload(directory, temp) {
  const resources = path.join(directory, 'resources');
  await verifyUpdateConfig(resources);
  const archive = path.join(resources, 'app.asar');
  assert.equal(JSON.parse(asar.extractFile(archive, 'package.json')).version, pkg.version, 'ASAR version mismatch');
  for (const file of ['electron/main.js', 'electron/preload.js', 'electron/lib/opencode.js', 'electron/lib/auto-update.js']) {
    assert(asar.extractFile(archive, path.normalize(file)).equals(fs.readFileSync(path.join(root, file))), 'Stale packaged file: ' + file);
  }
  assert(fs.readFileSync(path.join(resources, 'resources/model-catalog.json'))
    .equals(fs.readFileSync(path.join(root, 'resources/model-catalog.json'))), 'Stale model catalog');
  const result = execFileSync(require('electron'), [
    path.join(__dirname, 'verify-packaged-updater.cjs'), resources, path.join(temp, 'user-data')
  ], {
    timeout: 60000, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, APPDATA: path.join(temp, 'roaming'), LOCALAPPDATA: path.join(temp, 'local'),
      USERPROFILE: path.join(temp, 'home'), HOME: path.join(temp, 'home'), ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' }
  });
  assert.match(result, /"packagedUpdaterLoaded":true/, 'Packaged updater did not confirm configuration loading');
  console.log(result.trim());
}

async function main() {
  const release = path.join(root, 'release');
  const installerName = `RelaySwitcher-Setup-${pkg.version}.exe`;
  const installer = path.join(release, installerName);
  const metadata = yaml.load(fs.readFileSync(path.join(release, 'latest.yml'), 'utf8'));
  const exe = fs.readFileSync(installer);
  const sha512 = crypto.createHash('sha512').update(exe).digest('base64');
  assert.equal(metadata.version, pkg.version, 'Update metadata version mismatch');
  assert.equal(metadata.path, installerName, 'Update metadata installer mismatch');
  assert.equal(metadata.sha512, sha512, 'Update metadata SHA-512 mismatch');
  const item = metadata.files.find(file => file.url === installerName);
  assert(item && item.sha512 === sha512 && item.size === exe.length, 'Update metadata file size/hash mismatch');
  assert(fs.statSync(installer + '.blockmap').size > 0, 'Missing blockmap');
  const parent = fs.existsSync('C:/Windows/Temp/opencode') ? 'C:/Windows/Temp/opencode' : os.tmpdir();
  const temp = fs.mkdtempSync(path.join(parent, 'rs-release-check-'));
  const payload = path.join(temp, 'payload');
  try {
    execFileSync(path7za, ['x', installer, '-o' + payload, '-y', '-bso0', '-bsp0'], { timeout: 120000, windowsHide: true });
    await verifyPayload(payload, temp);
    const expected = path.join(release, 'win-unpacked');
    for (const file of ['RelaySwitcher.exe', 'resources/app.asar', 'resources/app-update.yml']) {
      assert(fs.readFileSync(path.join(payload, file)).equals(fs.readFileSync(path.join(expected, file))), 'Installer payload mismatch: ' + file);
    }
    console.log(JSON.stringify({ releaseVerified: true, version: pkg.version, installerBytes: exe.length, sha512Matches: true }));
    fs.rmSync(temp, { recursive: true, force: true });
  } catch (error) {
    console.error('Verification evidence kept at ' + temp);
    throw error;
  }
}

module.exports = { verifyPayload };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
