import React, { useEffect, useState, useCallback } from 'react';
import Dashboard from './pages/Dashboard.jsx';
import Accounts from './pages/Accounts.jsx';
import Relays from './pages/Relays.jsx';
import Backups from './pages/Backups.jsx';
import Settings from './pages/Settings.jsx';
import { Icon } from './components/ui.jsx';
import TitleBar from './components/TitleBar.jsx';

const NAV = [
  { key: 'dash', ico: 'dash', label: '仪表盘' },
  { key: 'accounts', ico: 'account', label: '账号' },
  { key: 'relays', ico: 'relay', label: '中转站' },
  { key: 'backups', ico: 'backup', label: '备份' },
  { key: 'settings', ico: 'settings', label: '设置' }
];

export default function App() {
  const [page, setPage] = useState('dash');
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

  // 后端状态变化(token 自动保养成功等)自动同步 UI — 用户永远不需要手点刷新
  useEffect(() => {
    const off = window.rs.onStateChanged ? window.rs.onStateChanged(() => refresh()) : null;
    return off || undefined;
  }, [refresh]);

  if (!window.rs) {
    return <div className="app" style={{ alignItems: 'center', justifyContent: 'center', color: '#78716c', flexDirection: 'column', gap: 12 }}>
      <Icon name="alert" size={28} style={{ color: '#f87171' }} />
      <div>IPC 桥接不可用 — 请通过 RelaySwitcher.exe 启动本应用</div>
    </div>;
  }

  if (fatal) {
    return <div className="app" style={{ alignItems: 'center', justifyContent: 'center', color: '#78716c', flexDirection: 'column', gap: 10 }}>
      <Icon name="alert" size={28} style={{ color: '#f87171' }} />
      <div>状态读取失败: {fatal}</div>
      <button className="btn btn-gold btn-sm" onClick={() => { setFatal(null); refresh(); }}>重试</button>
    </div>;
  }

  if (!booted || !state) {
    return <div className="app" style={{ padding: 40, display: 'block' }}>
      <div className="skeleton" style={{ height: 92, marginBottom: 14 }} />
      <div className="skeleton" style={{ height: 320, marginBottom: 14 }} />
      <div className="skeleton" style={{ height: 70 }} />
    </div>;
  }

  const s = state.status;
  const wired = !!(s.baseUrl && !/localhost|127\.0\.0\.1/.test(s.baseUrl) && s.hasTokens);

  return (
    <div className="app">
      <TitleBar title="RelaySwitcher" />
      <div className="app-body">
      <aside className="side">
        <div className="brand">
          <div className="brand-mark"><Icon name="logo" size={19} /></div>
          <div>
            <div className="wordmark">RelaySwitcher</div>
          </div>
        </div>
        <div className="wordmark-sub">账号 × 中转站</div>
        <nav className="nav">
          {NAV.map(n => (
            <div key={n.key} className={'nav-item' + (page === n.key ? ' active' : '')}
                 onClick={() => setPage(n.key)}>
              <span className="nav-ico"><Icon name={n.ico} size={16} /></span>{n.label}
            </div>
          ))}
        </nav>
        <div className="side-bottom">
          <div className="live-pill" onClick={() => setPage('dash')} title={wired ? `${s.activeAccount?.label || ''} → ${s.baseUrl}` : '尚未绑定'}>
            <span className={'dot ' + (wired ? 'ok' : s.baseUrl || s.authExists ? 'bad' : 'idle')} />
            <span className="pill-txt">
              <span className="pill-main">{wired ? '已绑定中转站' : '未绑定'}</span>
              <span className="pill-sub">{wired ? (s.activeAccount?.label || '账号') + ' → ' + (s.activeRelay?.name || s.baseUrl) : '去仪表盘完成切换'}</span>
            </span>
          </div>
          {upd.status !== 'idle' && (
            <div className="toast" style={{ position: 'relative', left: 'auto', bottom: 'auto', margin: '12px 0 0' }}>
              {upd.status === 'checking' && <><Spinner size={12} /> 检查更新中…</>}
              {upd.status === 'downloading' && <><Spinner size={12} /> 下载中{upd.progress ? ` ${upd.progress}%` : ''}</>}
              {upd.status === 'ready' && <b style={{ color: 'var(--gold)' }}>发现新版本 v{upd.version},点击设置页“关于”更新</b>}
              {upd.status === 'error' && <b style={{ color: 'var(--bad)' }}>{upd.message}</b>}
              {upd.status === 'uptodate' && <b style={{ color: 'var(--txt-3)' }}>"当前已是最新版本"</b>}
            </div>
          )}
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
      {toast && (
        <div className={'toast ' + toast.kind} key={toast.id}>
          <span className="t-ico"><Icon name={toast.kind === 'bad' ? 'alert' : 'check'} size={16} /></span>
          <span>{toast.msg}</span>
        </div>
      )}
      </div>
    </div>
  );
}
