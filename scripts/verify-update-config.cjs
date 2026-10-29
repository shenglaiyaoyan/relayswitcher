'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { NsisUpdater } = require('electron-updater');
const yaml = createRequire(require.resolve('electron-updater'))('js-yaml');
const root = path.join(__dirname, '..');

async function verifyUpdateConfig(resources, Updater = NsisUpdater) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const builder = yaml.load(fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8'));
  const publish = builder.publish.find(item => item.provider === 'github');
  if (!publish) throw new Error('Missing GitHub publish configuration');
  const expected = {
    provider: publish.provider,
    owner: publish.owner,
    repo: publish.repo,
    updaterCacheDirName: pkg.name.toLowerCase() + '-updater'
  };
  // Real electron-updater file loading; the adapter only isolates app/version
  // discovery. No requests, downloads, installation or userData writes occur.
  const updater = new Updater(null, {
    version: pkg.version,
    appUpdateConfigPath: path.join(resources, 'app-update.yml')
  });
  const actual = await updater.configOnDisk.value;
  for (const [key, value] of Object.entries(expected)) {
    if (!actual || actual[key] !== value) throw new Error('Invalid app-update.yml: ' + key);
  }
  return expected;
}

module.exports = { verifyUpdateConfig };
if (require.main === module) {
  verifyUpdateConfig(process.argv[2] || path.join(root, 'release/win-unpacked/resources'))
    .then(result => console.log(JSON.stringify({ updateConfigLoaded: true, ...result }, null, 2)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
