'use strict';
/**
 * 自动更新(轻量版):手动触发,GitHub API 检测 + 浏览器下载。
 * 无 npm 依赖;用 Electron net 走系统代理(Clash 环境下同样可用)。
 */
const { net } = require('electron');

const REPO_LATEST = 'https://api.github.com/repos/shenglaiyaoyan/relayswitcher/releases/latest';

/**
 * 对比远端 latest release 与当前版本。
 * @param {string} currentVersion 当前 app 版本(如 "1.4.1")
 * @returns {Promise<{found:boolean, version?:string, url?:string, message?:string, error?:string}>}
 */
async function checkUpdate(currentVersion) {
  try {
    const resp = await net.fetch(REPO_LATEST, {
      headers: { 'User-Agent': 'RelaySwitcher-Updater' },
      signal: AbortSignal.timeout(15000)
    });
    if (!resp.ok) return { found: false, error: 'GitHub API HTTP ' + resp.status };
    const data = await resp.json();
    const remote = String(data.tag_name || '').replace(/^v/, '');
    const exe = (data.assets || []).find(a => a.name && a.name.endsWith('.exe'));
    if (!exe) return { found: false, error: 'Release 中没有 .exe 安装包' };
    if (!currentVersion || remote === currentVersion) {
      return { found: false, version: remote, url: exe.browser_download_url, message: '当前已是最新版本' };
    }
    return { found: true, version: remote, url: exe.browser_download_url };
  } catch (e) {
    return { found: false, error: e.message };
  }
}

module.exports = { checkUpdate };
