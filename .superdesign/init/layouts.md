# layouts.md — 共享布局

## src/App.jsx — 应用外壳(标题栏 + 侧边栏 + 主区 + toast)
hash 路由(`#dash/#accounts/#relays/#backups/#settings`),侧边栏 NAV 数组驱动,页面组件按 `page` state 条件渲染。含全局状态:state(getState 轮询/事件刷新)、toast、更新事件侧边栏提示。

```jsx
import React, { useEffect, useState, useCallback } from 'react';
import Dashboard from './pages/Dashboard.jsx';
import Accounts from './pages/Accounts.jsx';
import Relays from './pages/Relays.jsx';
import Backups from './pages/Backups.jsx';
import Settings from './pages/Settings.jsx';
import { Icon, Spinner } from './components/ui.jsx';
import TitleBar from './components/TitleBar.jsx';

const NAV = [
  { key: 'dash', ico: 'dash', label: '仪表盘' },
  { key: 'accounts', ico: 'account', label: '账号' },
  { key: 'relays', ico: 'relay', label: '中转站' },
  { key: 'backups', ico: 'backup', label: '备份' },
  { key: 'settings', ico: 'settings', label: '设置' }
];

export default function App() {
  const VALID_PAGES = ['dash', 'accounts', 'relays', 'backups', 'settings'];
  const [page, setPage] = useState(() => {
    const h = (window.location.hash || '').replace(/^#/, '');
    return VALID_PAGES.includes(h) ? h : 'dash';
  });
  useEffect(() => {
    const onHash = () => {
      const h = (window.location.hash || '').replace(/^#/, '');
      if (VALID_PAGES.includes(h)) setPage(h);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const [state, setState] = useState(null);
  const [toast, setToast] = useState(null);
  const [booted, setBooted] = useState(false);
  const [fatal, setFatal] = useState(null);
  const [upd, setUpd] = useState({ status: 'idle', version: null, progress: 0, message: null });
  const [appVer, setAppVer] = useState('');

  useEffect(() => {
    if (window.rs.getVersion) window.rs.getVersion().then(v => setAppVer(v)).catch(() => {});
    const off = window.rs.onUpdateEvent ? window.rs.onUpdateEvent(({ ev, info }) => {
      setUpd(u => {
        switch (ev) {
          case 'checking': return { ...u, status: 'checking', message: null };
          case 'available': return { ...u, status: 'downloading', version: info && info.version, message: null };
          case 'uptodate': return { ...u, status: 'uptodate', message: null };
          case 'progress': return { ...u, status: 'downloading', progress: Math.round(info && info.percent || 0) };
          case 'downloaded': return { ...u, status: 'ready', version: info && info.version };
          case 'error': return { ...u, status: 'error', message: (info && info.message) || '检查更新失败' };
          default: return u;
        }
      });
    }) : null;
    return off || undefined;
  }, []);

  const refresh = useCallback(async () => {
    try { setState(await window.rs.getState()); }
    catch (e) { setFatal(e.message); }
  }, []);

  const showToast = useCallback((msg, kind = 'ok') => {
    const id = Date.now();
    setToast({ msg, kind, id });
    setTimeout(() => setToast(t => (t && t.id === id ? null : t)), 3400);
  }, []);

  useEffect(() => { refresh().finally(() => setBooted(true)); }, [refresh]);
  useEffect(() => {
    const off = window.rs.onStateChanged ? window.rs.onStateChanged(() => refresh()) : null;
    return off || undefined;
  }, [refresh]);

  if (!window.rs) { /* IPC 不可用占位 */ }
  if (fatal) { /* 错误占位 + 重试 */ }
  if (!booted || !state) { /* 骨架屏 */ }

  const s = state.status;
  const wired = !!(s.baseUrl && !/localhost|127\.0\.0\.1/.test(s.baseUrl) && s.hasTokens);

  return (
    <div className="app">
      <TitleBar title="RelaySwitcher" />
      <div className="app-body">
      <aside className="side">
        <div className="brand">
          <div className="brand-mark"><Icon name="logo" size={19} /></div>
          <div><div className="wordmark">RelaySwitcher</div></div>
        </div>
        <div className="wordmark-sub">账号 × 中转站</div>
        <nav className="nav">
          {NAV.map(n => (
            <div key={n.key} className={'nav-item' + (page === n.key ? ' active' : '')} onClick={() => setPage(n.key)}>
              <span className="nav-ico"><Icon name={n.ico} size={16} /></span>{n.label}
            </div>
          ))}
        </nav>
        <div className="side-bottom">
          <div className="live-pill" onClick={() => setPage('dash')}>
            <span className={'dot ' + (wired ? 'ok' : s.baseUrl || s.authExists ? 'bad' : 'idle')} />
            <span className="pill-txt">
              <span className="pill-main">{wired ? '已绑定中转站' : '未绑定'}</span>
              <span className="pill-sub">{wired ? (s.activeAccount?.label || '账号') + ' → ' + (s.activeRelay?.name || s.baseUrl) : '去仪表盘完成切换'}</span>
            </span>
          </div>
          {upd.status !== 'idle' && ( <div className="toast" style={{ position: 'relative', left: 'auto', bottom: 'auto', margin: '12px 0 0' }}>…更新状态…</div> )}
          <button className="btn btn-sm btn-gold" style={{ marginTop: 6, width: '100%' }} onClick={() => setPage('settings')}>
            <Icon name="info" size={11} /> 关于与更新
          </button>
        </div>
      </aside>
      <main className="main">
        <div className="page" key={page}>
          {page === 'dash' && <Dashboard state={state} refresh={refresh} toast={showToast} goto={setPage} />}
          {page === 'accounts' && <Accounts state={state} refresh={refresh} toast={showToast} />}
          {page === 'relays' && <Relays state={state} refresh={refresh} toast={showToast} />}
          {page === 'backups' && <Backups refresh={refresh} toast={showToast} />}
          {page === 'settings' && <Settings state={state} refresh={refresh} toast={showToast} />}
        </div>
      </main>
      {toast && (<div className={'toast ' + toast.kind} key={toast.id}><span className="t-ico"><Icon name={toast.kind === 'bad' ? 'alert' : 'check'} size={16} /></span><span>{toast.msg}</span></div>)}
      </div>
    </div>
  );
}
```
(完整源码见 `src/App.jsx`;上文为结构完整版,占位注释处为错误/骨架分支)

## src/components/TitleBar.jsx — 自绘标题栏

```jsx
import React from 'react';
import { Icon } from './ui.jsx';

/** 自绘标题栏:可拖拽,双击最大化,右侧窗口控制按钮(按 Superdesign 设计稿对齐) */
export default function TitleBar({ title }) {
  return (
    <div className="titlebar">
      <div className="tb-brand">
        <Icon name="logo" size={15} style={{ color: 'var(--gold)' }} />
        <span className="tb-name">{title}</span>
        <span className="tb-ver">v2.0</span>
      </div>
      <div className="tb-controls">
        <button className="tb-btn min" title="最小化" onClick={() => window.rs.windowMinimize()}>
          <svg width="11" height="11" viewBox="0 0 11 11"><path d="M1 5.5h9" stroke="currentColor" strokeWidth="1.1" /></svg>
        </button>
        <button className="tb-btn max" title="最大化/还原" onClick={() => window.rs.windowMaximize()}>
          <svg width="10" height="10" viewBox="0 0 11 11"><rect x="1.5" y="1.5" width="8" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.1" /></svg>
        </button>
        <button className="tb-btn tb-close" title="关闭" onClick={() => window.rs.windowClose()}>
          <svg width="11" height="11" viewBox="0 0 11 11"><path d="M1.5 1.5l8 8M9.5 1.5l-8 8" stroke="currentColor" strokeWidth="1.1" /></svg>
        </button>
      </div>
    </div>
  );
}
```
