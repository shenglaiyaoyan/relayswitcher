'use strict';
/**
 * 自动更新:
 * - checkUpdate: 轻量检测(GitHub API 对版本号),无重依赖,dev 模式也可用
 * - electron-updater: 打包环境真·下载安装(downloadUpdate → quitAndInstall 静默装),
 *   下载失败返回 {fallback:true} 由前端降级为浏览器下载
 * 事件统一经 rs:update-event 转发渲染层: {phase, version, progress, message}
 * phase: checking | available | not-available | downloading | downloaded | error
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

/* ---------------- electron-updater 真下载安装(仅打包环境生效) ---------------- */

let autoUpdater = null;
let initError = null;
let winRef = null;

function sendEvent(payload) {
  if (winRef && !winRef.isDestroyed()) winRef.webContents.send('rs:update-event', payload);
}

/** 窗口创建后调用:初始化 autoUpdater 并把生命周期事件转发给渲染层。
 *  事件格式与旧版 checkForUpdates 一致({ev, info}),App.jsx 侧边栏状态机零改动直接复用 */
function initAutoUpdater(win) {
  winRef = win;
  try {
    autoUpdater = require('electron-updater').autoUpdater;
    autoUpdater.logger = null;
    autoUpdater.autoDownload = false;          // 只在用户点击后下载
    autoUpdater.autoInstallOnAppQuit = true;   // 下载完即使用户没点装,退出时也会装
    autoUpdater.on('checking-for-update', () => sendEvent({ ev: 'checking' }));
    autoUpdater.on('update-available', (i) => sendEvent({ ev: 'available', info: { version: i && i.version } }));
    autoUpdater.on('update-not-available', () => sendEvent({ ev: 'uptodate' }));
    autoUpdater.on('download-progress', (p) => sendEvent({
      ev: 'progress',
      info: { percent: p.percent || 0, transferred: p.transferred, total: p.total }
    }));
    autoUpdater.on('update-downloaded', (i) => sendEvent({ ev: 'downloaded', info: { version: i && i.version } }));
    autoUpdater.on('error', (e) => sendEvent({ ev: 'error', info: { message: e && e.message } }));
    return { active: autoUpdater.isUpdaterActive };
  } catch (e) {
    autoUpdater = null;
    initError = e.message;
    return { active: false, error: e.message };
  }
}

/**
 * 下载并静默安装新版(保留原安装路径)。
 * @returns {Promise<{started?:boolean, fallback?:boolean, reason?:string}>}
 *   fallback=true 时前端应降级为浏览器打开下载页
 */
async function downloadAndInstallUpdate() {
  // 两种"不能自动"要分开说清:模块没打进包(打包问题,装新版解决) vs dev/未安装环境运行
  if (!autoUpdater) {
    return { fallback: true, reason: 'electron-updater 未打进应用包(require 失败:' + (initError || '未知') + ')— 手动安装一次新版即可修复' };
  }
  if (!autoUpdater.isUpdaterActive) {
    return { fallback: true, reason: '当前为 dev/未安装环境运行,自动更新仅对正式安装的应用生效' };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    if (!result || !result.isUpdateAvailable) {
      return { started: false, reason: '远端没有更新' };
    }
    await autoUpdater.downloadUpdate(result.cancellationToken);
    // isSilent=true: 静默装并沿用原安装目录;isForceRunAfter=true: 装完自动启动新版
    autoUpdater.quitAndInstall(true, true);
    return { started: true };
  } catch (e) {
    return { fallback: true, reason: e.message };
  }
}

module.exports = { checkUpdate, initAutoUpdater, downloadAndInstallUpdate };
