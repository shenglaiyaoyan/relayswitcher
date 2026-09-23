'use strict';
/**
 * 自动更新(v1.11.0 重构,用户指令:删除浏览器降级,全自动扛到底):
 * - checkUpdate:轻量检测(GitHub API 对版本号),无重依赖,dev 模式也可用
 * - electron-updater:全量下载 + 停滞看门狗(30s 无进展取消重来)+ 自动重试
 *   (短期 3 连试,之后每 60s 循环,直到成功)——永不降级浏览器
 * - 差分下载禁用:代理抖动环境下实测卡死且 pending 烂尾不清理(2026-09-23 实证)
 * - 启动发现新版即后台自动下载;autoInstallOnAppQuit 兜底退出安装;
 *   用户手点路径下载完立即重启安装,自动路径等用户重启
 * 事件统一经 rs:update-event 转发渲染层:{ev, info}
 * ev: checking | available | uptodate | progress | downloaded | error | retry
 */
const { net } = require('electron');

const REPO_LATEST = 'https://api.github.com/repos/shenglaiyaoyan/relayswitcher/releases/latest';

/**
 * 对比远端 latest release 与当前版本。
 * @param {string} currentVersion 当前 app 版本(如 "1.11.0")
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
    if (!currentVersion || remote === currentVersion) {
      return { found: false, version: remote, message: '当前已是最新版本' };
    }
    return { found: true, version: remote };
  } catch (e) {
    return { found: false, error: e.message };
  }
}

/* ---------------- electron-updater 全自动下载安装 ---------------- */

let autoUpdater = null;
let initError = null;
let winRef = null;
let loopRunning = false;

function sendEvent(payload) {
  if (winRef && !winRef.isDestroyed()) winRef.webContents.send('rs:update-event', payload);
}

/** 窗口创建后调用:初始化 autoUpdater 并把生命周期事件转发给渲染层 */
function initAutoUpdater(win) {
  winRef = win;
  try {
    autoUpdater = require('electron-updater').autoUpdater;
    autoUpdater.logger = null;
    autoUpdater.autoDownload = false;          // 下载时机由我们自己的循环掌控
    autoUpdater.autoInstallOnAppQuit = true;   // 下载完成后即使用户没重启,退出时也会装
    autoUpdater.disableDifferentialDownload = true; // 差分下载代理抖动下易卡死,全量更稳
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

/** 清掉上一轮卡死遗留的 pending 半成品(实测会让后续下载行为诡异) */
function cleanPendingCache() {
  try {
    const fs = require('fs');
    const path = require('path');
    const pending = path.join(process.env.LOCALAPPDATA || '', 'relayswitcher-updater', 'pending');
    fs.rmSync(pending, { recursive: true, force: true });
  } catch { /* 无则跳过 */ }
}

/** 单次尝试:看门狗(30s 无进展即取消)兜住停滞;成功返回 {ok},无更新 {noop} */
async function attemptDownloadOnce(userInvoked) {
  cleanPendingCache();
  let lastTick = Date.now();
  let curCts = null;
  const onProgress = () => { lastTick = Date.now(); };
  autoUpdater.on('download-progress', onProgress);
  const watchdog = setInterval(() => {
    if (Date.now() - lastTick > 30000 && curCts) {
      try { curCts.cancel(); } catch { /* 已结束 */ }
    }
  }, 5000);
  try {
    const result = await autoUpdater.checkForUpdates();
    if (!result || !result.isUpdateAvailable) return { noop: true };
    curCts = result.cancellationToken;
    await autoUpdater.downloadUpdate(curCts);
    if (userInvoked) autoUpdater.quitAndInstall(true, true); // 手点:装完立即重启
    return { ok: true };
  } finally {
    clearInterval(watchdog);
    autoUpdater.removeListener('download-progress', onProgress);
  }
}

/** 重试主循环:3 连试 → 每 60s 再战,直到成功;全程事件驱动,永不降级浏览器 */
async function runUpdateLoop(userInvoked) {
  if (loopRunning) return;
  loopRunning = true;
  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const r = await attemptDownloadOnce(userInvoked && attempt === 1);
        if (r.ok || r.noop) return; // 成功(装完重启)/无更新,收工
      } catch (e) {
        if (attempt < 3) sendEvent({ ev: 'retry', info: { attempt, message: e && e.message } });
      }
    }
    const t = setTimeout(() => { runUpdateLoop(false); }, 60000);
    t.unref?.();
    sendEvent({ ev: 'retry', info: { scheduled: true } });
  } finally {
    loopRunning = false;
  }
}

/**
 * 启动全自动下载安装(用户手点或开机自动拉起)。
 * @param {boolean} userInvoked 手点路径下载完成立即重启安装;自动路径等用户重启
 * @returns {Promise<{started?:boolean, error?:string}>} 下载进度由 rs:update-event 驱动
 */
async function downloadAndInstallUpdate(userInvoked) {
  if (!autoUpdater) {
    return { started: false, error: 'electron-updater 未打进应用包(require 失败:' + (initError || '未知') + ')' };
  }
  if (!autoUpdater.isUpdaterActive) {
    return { started: false, error: '当前为 dev/未安装环境运行,自动更新仅对正式安装的应用生效' };
  }
  runUpdateLoop(!!userInvoked);
  return { started: true };
}

/** 已下载就绪时立即重启安装(用户手点) */
function restartToInstall() {
  if (autoUpdater) autoUpdater.quitAndInstall(true, true);
}

module.exports = { checkUpdate, initAutoUpdater, downloadAndInstallUpdate, restartToInstall };
