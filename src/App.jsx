import React, { useEffect, useState, useCallback, useRef } from 'react';
import Dashboard from './pages/Dashboard.jsx';
import Accounts from './pages/Accounts.jsx';
import Relays from './pages/Relays.jsx';
import Backups from './pages/Backups.jsx';
import Settings from './pages/Settings.jsx';
import OpenCode from './pages/OpenCode.jsx';
import { Icon, Spinner } from './components/ui.jsx';
import TitleBar from './components/TitleBar.jsx';
import { canLeavePage, handleHashNavigation } from './pages/opencode/navigationGuard.js';

const NAV = [
  { key: 'dash', ico: 'dash', label: 'ChatGPT' },
  { key: 'opencode', ico: 'bolt', label: 'OpenCode' },
  { key: 'relays', ico: 'relay', label: '中转站' },
  { key: 'backups', ico: 'backup', label: '备份' },
  { key: 'settings', ico: 'settings', label: '设置' }
];

// 支持 #<page> 直达初始页面(调试/截图用):#relays / #backups / #settings ...
// accounts 已从侧边栏移除但保留 hash 直达(Dashboard 页头 👤 按钮等仍可跳转)
const VALID_PAGES = ['dash', 'accounts', 'opencode', 'relays', 'backups', 'settings'];
// #settings-chatgpt / #settings-opencode 让 Settings 按 mode 渲染专属卡片;settings-demo-* 仍为 global
const parseHash = () => {
  const h = (window.location.hash || '').replace(/^#/, '');
  const m = VALID_PAGES.find(v => h.startsWith(v)); // 前缀匹配:settings-demo-* 仍落在 settings 页
  if (!m) return null;
  const subMode = h.startsWith('settings-chatgpt') ? 'chatgpt'
    : h.startsWith('settings-opencode') ? 'opencode' : 'global';
  return { page: m, subMode };
};

export default function App() {
  const [page, setPage] = useState(() => (parseHash() || {}).page || 'dash');
  const [pageSubMode, setPageSubMode] = useState(() => (parseHash() || {}).subMode || 'global');
  const currentHash = useRef(window.location.hash || '#dash');
  useEffect(() => {
    const onHash = handleHashNavigation({
      location: window.location,
      parseHash,
      currentHash: () => currentHash.current,
      navigate: route => {
        currentHash.current = route.hash;
        window.history.replaceState(null, '', route.hash);
        setPage(route.page); setPageSubMode(route.subMode);
      },
      replaceHash: hash => window.history.replaceState(null, '', hash)
    });
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

  // 统一页内跳转:'settings-chatgpt'/'settings-opencode' 直达 Settings 子模式;
  // 同步写回 hash(不触发 hashchange),避免残留旧 hash 让同目标二次跳转失效
  const goto = useCallback((target) => {
    const navigate = () => {
      let p = target, sub = 'global';
      if (target === 'settings-chatgpt' || target === 'settings-opencode') {
        p = 'settings'; sub = target.slice('settings-'.length);
      }
      setPage(p); setPageSubMode(sub);
      const hash = '#' + (sub === 'global' ? p : target);
      currentHash.current = hash;
      window.history.replaceState(null, '', hash);
    };
    if (canLeavePage(navigate)) navigate();
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
                 onClick={() => goto(n.key)}>
              <span className="nav-ico"><Icon name={n.ico} size={16} /></span>{n.label}
            </div>
          ))}
        </nav>
        <div className="side-bottom">
          <div className="live-pill" onClick={() => goto('dash')} title={wired ? `${s.activeAccount?.label || ''} → ${s.baseUrl}` : '尚未绑定'}>
            <span className={'dot ' + (wired ? 'ok' : s.baseUrl || s.authExists ? 'bad' : 'idle')} />
            <span className="pill-txt">
              <span className="pill-main">{wired ? '已绑定中转站' : '未绑定'}</span>
              <span className="pill-sub">{wired ? (s.activeAccount?.label || '账号') + ' → ' + (s.activeRelay?.name || s.baseUrl) : '去 ChatGPT 页完成切换'}</span>
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
          <button className="btn btn-sm btn-gold" style={{ marginTop: 6, width: '100%' }} onClick={() => goto('settings')}>
            <Icon name="info" size={11} /> 关于与更新
          </button>
        </div>
      </aside>
      <main className="main">
        <div className="page" key={page}>
          {page === 'dash' && <Dashboard state={state} refresh={refresh} toast={showToast} goto={goto} />}
          {page === 'accounts' && <Accounts state={state} refresh={refresh} toast={showToast} />}
          {page === 'opencode' && <OpenCode state={state} refresh={refresh} toast={showToast} goto={goto} />}
          {page === 'relays' && <Relays state={state} refresh={refresh} toast={showToast} />}
          {page === 'backups' && <Backups refresh={refresh} toast={showToast} />}
          {page === 'settings' && <Settings mode={pageSubMode || 'global'} state={state} refresh={refresh} toast={showToast} />}
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
