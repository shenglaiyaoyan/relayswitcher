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

// 更新日志落盘:线上挂死类问题唯一的取证渠道(控制台关掉就没了)
const UPDATE_LOG = (() => {
  const fs = require('fs');
  const path = require('path');
  const file = path.join(process.env.APPDATA || '.', 'relayswitcher', 'logs', 'update.log');
  return {
    log(msg) {
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        if (fs.existsSync(file) && fs.statSync(file).size > 1024 * 1024) fs.rmSync(file); // 超 1MB 翻新
        fs.appendFileSync(file, `${new Date().toISOString()} ${msg}\n`);
      } catch { /* 日志失败不影响主流程 */ }
    }
  };
})();

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

/** 单次尝试:看门狗(30s 无进展即取消)兜住停滞;硬超时不依赖 cancel 生效,
 *  连 checkForUpdates/downloadUpdate 挂死(cancel 失效的真空区)也能弃船重试。
 *  2026-10-11 实证:v1.12.2 更新 v1.12.3 时代理抖动 → downloadUpdate 挂死、
 *  cts.cancel() 掐不断、循环永久冻结,UI 卡"下载中"再无事件 */
const CHECK_TIMEOUT_MS = 45000;   // checkForUpdates 正常几秒内返回
const ATTEMPT_HARD_MS = 300000;   // 5min 硬上限:79MB 全量在 ≥275KB/s 下可完成
async function attemptDownloadOnce(userInvoked) {
  cleanPendingCache();
  UPDATE_LOG.log(`attempt start (userInvoked=${!!userInvoked})`);
  let lastTick = Date.now();
  let lastBytes = 0;
  let curCts = null;
  // 滴漏也算停滞:30s 窗口内新增 <200KB(≈6.7KB/s)视同卡死 —— 健康路径 4MB/s 会秒级刷新,
  // 只有真卡死/极端慢速才触发重试(2026-09-25 实测:旧看门狗只拦"完全无进展",慢速滴漏
  // 让更新卡在 1% 永不重试)
  const onProgress = (p) => {
    const got = p && p.transferred != null ? p.transferred : null;
    if (got == null || got - lastBytes >= 200 * 1024) {
      lastTick = Date.now();
      if (got != null) lastBytes = got;
    }
  };
  autoUpdater.on('download-progress', onProgress);
  const watchdog = setInterval(() => {
    if (Date.now() - lastTick > 30000 && curCts) {
      try { curCts.cancel(); } catch { /* 已结束 */ }
    }
  }, 5000);
  // 弃船计时:无论卡在哪个阶段(含 cancel 掐不断的挂死请求),到点即放弃本次尝试。
  // 挂死的旧 promise 任其自然了结,结果被弃置不再使用 —— 循环立即进入下一轮
  let abandonTimer = null;
  const abandoned = new Promise((_, rej) => { abandonTimer = setTimeout(() => rej(new Error('attempt hard timeout')), ATTEMPT_HARD_MS); });
  try {
    const checkResult = await Promise.race([
      autoUpdater.checkForUpdates(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('checkForUpdates timeout')), CHECK_TIMEOUT_MS))
    ]);
    if (!checkResult || !checkResult.isUpdateAvailable) { UPDATE_LOG.log('attempt noop (no update)'); return { noop: true }; }
    curCts = checkResult.cancellationToken;
    await Promise.race([autoUpdater.downloadUpdate(curCts), abandoned]);
    UPDATE_LOG.log('attempt ok (downloaded)');
    if (userInvoked) autoUpdater.quitAndInstall(true, true); // 手点:装完立即重启
    return { ok: true };
  } catch (e) {
    UPDATE_LOG.log(`attempt fail: ${(e && e.message) || e}`);
    if (curCts) { try { curCts.cancel(); } catch { /* 双保险 */ } }
    throw e;
  } finally {
    clearTimeout(abandonTimer);
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
