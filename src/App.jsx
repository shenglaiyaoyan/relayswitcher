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
