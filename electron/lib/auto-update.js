// Minimal auto-update: only manual check via URL fetch (no npm deps)
const { ipcMain } = require('electron');
let mainWindow = null;

function setMainWindow(w) { mainWindow = w; }

async function checkUpdate(manual, onProgress, onError) {
  const GITHUB_API = 'https://api.github.com/repos/shenglaiyaoyan/relayswitcher/releases/latest';
  try {
    if (!man) { throw new Error('手动检查必须传入 manual=true'); }
    const resp = await fetch(GITHUB_API);
    if (!resp.ok) throw new Error(`GitHub API ${resp.status}`);
    const data = await resp.json();
    const tagName = data.tag_name || '';
    const exeUrl = data.assets?.find(a => a.name.endsWith('.exe'))?.browser_download_url || null;
    if (!exeUrl) throw new Error('未找到 .exe 发布文件');
    
    // 发送事件到 UI
    mainWindow?.webContents.send('rs:update-event', { ev: 'checking', info: null });
    return { found: true, version: tagName, url: exeUrl };
  } catch (e) {
    onError && onError(e.message);
    return { found: false, error: e.message };
  }
}

function registerListeners() {
  ipcMain.handle('rs:checkUpdate', async (_e, manual) => {
    const result = await checkUpdate(manual, 
      ({ev,info}) => mainWindow?.webContents.send('rs:update-event',{ev,info}),
      (err) => mainWindow?.webContents.send('rs:update-event',{ev:'error',info:{message:err}})
    );
    return result;
  });
  ipcMain.handle('rs:getVersion', () => require('electron').app.getVersion());
  ipcMain.handle('rs:quitAndInstall', () => process.exit(0)); // 简化版：退出即重开，让 updater 接管（如果装了的话）或提示重装
}

module.exports = { setMainWindow, checkUpdate, registerListeners };
