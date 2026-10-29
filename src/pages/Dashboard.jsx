import React, { useEffect, useState } from 'react';
import { Icon, Select, Spinner, Modal, Confirm, fmtK, planLabel } from '../components/ui.jsx';
import { STAGES, stageStates } from './chatgpt/pipeline.mjs';

const CTX_PRESETS = [272000, 372000, 872000];
const MAIN_STEPS = new Set(['备份当前配置', '流量指向中转站', '目录生成', '校验完成']);

const lifeStr = (ms) => {
  if (ms == null) return '—';
  const d = ms - Date.now();
  if (d <= 0) return '已过期';
  const mins = Math.round(d / 60000);
  return mins < 90 ? `剩 ${mins} 分` : `剩 ${(mins / 1440).toFixed(1)} 天`;
};
const backupWhen = id => (id || '').replace(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2}).*$/, '$1-$2-$3 $4:$5');
const REASON = { switch: '切换前自动备份', manual: '手动创建', 'pre-restore': '回滚前自动备份' };

// 截图/设计管线专用示例数据（#dash-demo-filled），正常运行不可达
const DEMO_NOW = Date.now();
const DEMO_STATE = {
  accounts: [{ id: 'a1', label: 'a***7@outlook.com', plan: 'free' }, { id: 'a2', label: 'b***2@gmail.com', plan: 'plus' }],
  relays: [{ id: 'r1', name: 'DIHUANG2API·Workbuddy', baseUrl: 'https://dihuang.zeniths.codes/v1', lastTest: { ok: true, ms: 411, count: 18 } },
    { id: 'r2', name: 'Local Gateway', baseUrl: 'http://127.0.0.1:18790/v1', lastTest: { ok: true, ms: 12 } }],
  settings: { contextWindow: 372000 },
  catalogCounts: { official: 11 },
  status: { home: 'C:\\Users\\me\\.codex', hasTokens: true, authExists: true, model: 'gpt-6.1-sol', catalog: true, contextWindow: 372000,
    baseUrl: 'https://dihuang.zeniths.codes/v1', tokenLife: { accessTokenMs: DEMO_NOW + 9.2 * 86400000, idTokenMs: DEMO_NOW - 3600000 } }
};
DEMO_STATE.status.activeAccount = { ...DEMO_STATE.accounts[0], email: 'a***7@outlook.com' };
DEMO_STATE.status.activeRelay = DEMO_STATE.relays[0];
const DEMO_BACKUPS = [
  { id: '20261018-224656_switch', reason: 'switch', files: ['auth.json', 'config.toml'] },
  { id: '20261018-221307_manual', reason: 'manual', files: ['auth.json', 'config.toml'] },
  { id: '20261017-193842_switch', reason: 'switch', files: ['auth.json', 'config.toml'] },
  { id: '20261016-101500_switch', reason: 'switch', files: ['auth.json'] }
];

function StatusRow({ label, children, onClick, title }) {
  return <div className={'cg-srow' + (onClick ? ' link' : '')} onClick={onClick} title={title}>
    <span className="cg-slabel">{label}</span><div className="cg-svalue">{children}</div></div>;
}

export default function Dashboard({ state: liveState, refresh, toast, goto }) {
  const [demoState, setDemoState] = useState(null);
  const state = demoState || liveState;
  const { accounts, relays, settings, status } = state;
  const [accountId, setAccountId] = useState('');
  const [relayId, setRelayId] = useState('');
  const [catalogChoice, setCatalogChoice] = useState('official'); // 官方目录 / 中转目录(v1.8.0:切换即切目录)
  const [ctx, setCtx] = useState(872000);
  const [switching, setSwitching] = useState(false);
  const [done, setDone] = useState(null); // 'ok' | 'bad'
  const [codexWarn, setCodexWarn] = useState(null);
  const [stopping, setStopping] = useState(false);
  const [rivalWarn, setRivalWarn] = useState(null);
  const [log, setLog] = useState([]);
  const [showLog, setShowLog] = useState(false);
  const [backups, setBackups] = useState([]);
  const [confirmRb, setConfirmRb] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // 从当前状态同步默认值
  useEffect(() => {
    setCtx(status.contextWindow || settings.contextWindow || 872000);
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!accountId && accounts.length) setAccountId((status.activeAccount || accounts[0]).id);
    if (!relayId && relays.length) setRelayId((status.activeRelay || relays[0]).id);
  }, [accounts, relays]); // eslint-disable-line

  const loadBackups = async () => {
    if ((window.location.hash || '').includes('filled')) return;
    try { setBackups(await window.rs.listBackups() || []); } catch { /* ignore */ }
  };
  useEffect(() => { loadBackups(); }, [status]);

  useEffect(() => {
    const off = window.rs.onSwitchStep((step) => setLog(prev => [...prev, step]));
    return off;
  }, []);

  // 竞品工具检测(FEAT-002): 进页面就查,发现回写类工具常驻警告条
  useEffect(() => {
    // 截图/设计管线专用:#dash-demo-warn / #dash-demo-modal 强制展示警告条与弹窗(正常运行不可达)
    const applyDemo = () => {
      const h = window.location.hash || '';
      if (h.includes('demo-warn')) setRivalWarn([{ name: 'CockpitTools', image: 'CockpitTools.exe', pids: ['4012'] }]);
      if (h.includes('demo-modal')) setCodexWarn({ pids: ['4012', '4013'] });
      if (h.includes('filled')) {
        setDemoState(DEMO_STATE); setBackups(DEMO_BACKUPS); setAccountId('a1'); setRelayId('r1'); setCtx(372000);
        if (h.includes('progress')) setLog([{ name: '竞品工具检测', ok: true, detail: '未发现' }, { name: '目录生成', ok: true, detail: '官方目录' },
          { name: '备份当前配置', ok: true, detail: '快照 20261029-101010' }, { name: '写入登录态 auth.json', ok: true }, { name: '流量指向中转站', ok: false, detail: '示例失败' }]);
        if (h.includes('logopen')) setShowLog(true);
      }
    };
    applyDemo();
    window.addEventListener('hashchange', applyDemo);
    return () => window.removeEventListener('hashchange', applyDemo);
  }, []);
  useEffect(() => {
    if ((window.location.hash || '').includes('demo')) return; // demo 态不被真实检测覆盖
    window.rs.detectRivals().then(r => setRivalWarn(r.running ? r.tools : null)).catch(() => {});
  }, []);

  const manualRefresh = async () => {
    setRefreshing(true);
    await refresh(); await loadBackups();
    setTimeout(() => setRefreshing(false), 450);
  };

  const activeRelay = relays.find(r => r.id === relayId);
  const relayCount = activeRelay?.lastTest?.count ?? (activeRelay?.lastTest?.models || []).length;

  const doSwitch = async () => {
    if (!accountId || !relayId || switching) return;
    // 竞品工具状态顺手刷新(用户可能刚开了 CockpitTools)
    window.rs.detectRivals().then(r => setRivalWarn(r.running ? r.tools : null)).catch(() => {});
    // Codex 客户端若在运行,退出时会用内存态覆盖写入 — 先警告
    try {
      const d = await window.rs.detectCodex();
      if (d.running) {
        setCodexWarn({ pids: d.pids });
        return;
      }
    } catch { /* 检测失败不阻塞切换 */ }
    execSwitch();
  };

  // 一键止停(US-07): 帮用户强杀 Codex 进程树,复查通过后直接继续切换
  const killAndSwitch = async () => {
    setStopping(true);
    try {
      const r = await window.rs.stopCodex();
      if (r.ok) {
        setCodexWarn(null);
        toast('Codex 已关闭,继续切换', 'ok');
        execSwitch();
      } else toast('未能全部关闭(可能无权限),请手动退出后再切换', 'bad');
    } catch (e) { toast('关闭异常: ' + e.message, 'bad'); }
    finally { setStopping(false); }
  };

  const execSwitch = async () => {
    if (!accountId || !relayId || switching) return;
    setSwitching(true); setDone(null); setLog([]); setShowLog(false);
    try {
      const r = await window.rs.doSwitch({ accountId, relayId, catalogChoice, contextWindow: Number(ctx) || null });
      setDone(r.ok ? 'ok' : 'bad');
      if (r.ok) toast('切换完成 — 重启 Codex 客户端后生效', 'ok');
      else { toast('切换失败: ' + r.error, 'bad'); setShowLog(true); }
      await refresh(); await loadBackups();
    } catch (e) {
      setDone('bad'); setShowLog(true);
      toast('切换异常: ' + e.message, 'bad');
    } finally { setSwitching(false); }
  };

  const rollback = async backup => {
    if (!backup) return;
    try {
      await window.rs.restoreBackup(backup.id);
      toast('已回滚到 ' + backup.id + ' — 重启 Codex 客户端生效', 'ok');
      await refresh(); await loadBackups();
    } catch (e) { toast('回滚失败: ' + e.message, 'bad'); }
  };

  const lt = status.activeRelay?.lastTest;
  const plan = status.activeAccount ? planLabel(status.activeAccount.plan) : null;
  const life = status.tokenLife || {};
  const idExpired = life.idTokenMs != null && life.idTokenMs <= Date.now();
  const states = stageStates(log, switching);
  const extraLog = log.filter(l => !MAIN_STEPS.has(l.name) && !(l.name || '').startsWith('写入登录态'));
  const ctxIsPreset = CTX_PRESETS.includes(Number(ctx));
  const stateLabel = switching ? '切换中' : done === 'ok' ? '已完成' : done === 'bad' ? '已中止' : '等待新配置';
  const wired = !!(status.activeAccount && status.activeRelay);

  return (
    <div className="cg">
      <header className="cg-head">
        <div><h1>ChatGPT</h1><p>绑定登录态与流量出口，配置将在备份后写入 Codex。</p></div>
        <div className="cg-head-tools">
          <button className={'cg-icon-btn' + (refreshing ? ' spin' : '')} title="刷新状态" onClick={manualRefresh} disabled={refreshing}><Icon name="refresh" size={15} /></button>
          <button className="cg-icon-btn" title="账号管理" onClick={() => goto('accounts')}><Icon name="account" size={15} /></button>
          <button className="cg-icon-btn" title="ChatGPT 专属设置" onClick={() => goto('settings-chatgpt')}><Icon name="settings" size={15} /></button>
        </div>
      </header>

      {/* 竞品工具警告(FEAT-002): 回写类工具与切换互为覆盖 */}
      {rivalWarn && rivalWarn.length > 0 && (
        <div className="cg-banner" role="alert">
          <Icon name="alert" size={14} />
          <span>检测到 {rivalWarn.map(t => <b key={t.name}>{t.name}</b>)} 正在运行，可能回写 Codex 配置让切换失效，建议先退出再切换</span>
          <button className="cg-text-btn" onClick={() => setRivalWarn(null)}>知道了</button>
        </div>
      )}

      <div className="cg-grid">
        <div className="cg-col">
          <section className="cg-card cg-switch">
            <div className="cg-card-head"><div><h2>切换</h2><p>选择新的账号与出口，校验通过后生效</p></div>
              <span className={'cg-pill' + (done === 'bad' ? ' bad' : done === 'ok' ? ' ok' : '')}>{stateLabel}</span></div>
            <div className="cg-form">
              <span className="cg-flabel">账号</span>
              <div>
                <Select value={accountId} onChange={setAccountId} disabled={switching || !accounts.length}
                  options={accounts.map(a => ({ value: a.id, label: a.label + (a.plan ? ' · ' + (planLabel(a.plan) || a.plan) : '') }))}
                  emptyText="还没有账号 — 去「账号」页导入" placeholder="选择账号…" />
                {!accounts.length && <button className="cg-text-btn cg-inline-link" onClick={() => goto('accounts')}>去导入账号 →</button>}
              </div>
              <span className="cg-flabel">中转站</span>
              <div>
                <Select value={relayId} onChange={setRelayId} disabled={switching || !relays.length}
                  options={relays.map(r => ({ value: r.id, label: r.name + (r.lastTest?.ok ? ` · ${r.lastTest.ms} ms` : ''), desc: r.baseUrl }))}
                  emptyText="还没有中转站 — 去「中转站」页添加" placeholder="选择中转站…" />
                {!relays.length && <button className="cg-text-btn cg-inline-link" onClick={() => goto('relays')}>去添加中转站 →</button>}
              </div>
              <span className="cg-flabel">模型目录</span>
              <div className="cg-seg" role="radiogroup" aria-label="模型目录">
                {[['official', `官方目录 · ${state.catalogCounts?.official ?? '—'} 模型`, '从本机 Codex 提取的官方全套'],
                  ['relay', relayCount ? `中转目录 · ${relayCount} 模型` : '中转目录 · 实时拉取', '由中转站 /v1/models 生成']].map(([v, label, tip]) => (
                  <button key={v} type="button" role="radio" aria-checked={catalogChoice === v} title={tip}
                    className={'cg-seg-btn' + (catalogChoice === v ? ' on' : '')} disabled={switching} onClick={() => setCatalogChoice(v)}>{label}</button>))}
              </div>
              <span className="cg-flabel">上下文窗口</span>
              <div className="cg-ctx">
                <div className="cg-seg">
                  {CTX_PRESETS.map(p => <button key={p} type="button" className={'cg-seg-btn' + (Number(ctx) === p ? ' on' : '')}
                    disabled={switching} onClick={() => setCtx(p)}>{fmtK(p)}</button>)}
                </div>
                <label className={'cg-ctx-custom' + (ctxIsPreset ? '' : ' on')}>
                  <input type="text" inputMode="numeric" className="mono" value={ctxIsPreset ? '' : ctx} placeholder="自定义" disabled={switching}
                    onChange={e => setCtx(e.target.value.replace(/[^\d]/g, ''))} aria-label="自定义上下文窗口（tokens）" /><span>tokens</span></label>
              </div>
            </div>
            <button className={'cg-go' + (switching ? ' switching' : '')} disabled={switching || !accounts.length || !relays.length} onClick={doSwitch}>
              {switching ? <><Spinner size={14} /> 切换中…</> : <><Icon name="relay" size={15} /> 立即切换</>}
            </button>
            <p className="cg-go-hint">自动备份当前配置，完成后可回滚</p>

            <div className="cg-flow">
              <div className="cg-flow-head"><h3>切换流程</h3>
                <span>{switching ? '执行中…' : done === 'ok' ? '完成 · 重启 Codex 客户端后生效' : done === 'bad' ? '已中止 · 已自动回滚或可从备份恢复' : '空闲 · 等待执行'}</span></div>
              <ol className="cg-steps">
                {STAGES.map((s, i) => <li key={s.key} className={'cg-step ' + states[i]}><i />{s.label}</li>)}
              </ol>
              {log.length > 0 && <div className="cg-log">
                <button className="cg-text-btn" onClick={() => setShowLog(v => !v)}>
                  <Icon name="chevron" size={11} className={showLog ? 'up' : ''} /> 详细日志（{log.length} 条{log.some(l => l.ok === false) ? '，含失败项' : ''}）</button>
                {showLog && <ul>{log.map((l, i) => <li key={i} className={l.ok === false ? 'bad' : ''}>
                  <b>{l.ok === false ? '✗' : '✓'} {l.name}</b>{l.detail ? <span>{l.detail}</span> : null}</li>)}</ul>}
                {!showLog && extraLog.some(l => l.ok === false) && <p className="cg-log-warn">有 {extraLog.filter(l => l.ok === false).length} 项预检提示，展开查看</p>}
              </div>}
            </div>
          </section>

          <section className="cg-card cg-backups">
            <div className="cg-card-head"><h2>最近备份</h2><span className="cg-muted">每次切换前自动快照</span></div>
            {backups.slice(0, 3).map((b, i) => (
              <div key={b.id} className="cg-brow">
                <span className="mono">{backupWhen(b.id)}</span>
                <span className="cg-breason">{REASON[b.reason] || b.reason || '备份'}</span>
                <span className="cg-muted cg-bfiles">{(b.files || []).join(' + ')}</span>
                {i === 0
                  ? <button className="cg-btn" onClick={() => rollback(b)}><Icon name="undo" size={12} /> 一键回滚</button>
                  : <button className="cg-btn ghost" onClick={() => setConfirmRb(b)}>回滚</button>}
              </div>))}
            {!backups.length && <p className="cg-muted cg-empty">暂无备份 — 每次切换前会自动快照 auth.json 与 config.toml</p>}
            {backups.length > 3 && <button className="cg-text-btn cg-more" onClick={() => goto('backups')}>查看全部 {backups.length} 个备份 →</button>}
          </section>
        </div>

        <section className="cg-card cg-status">
          <div className="cg-card-head"><h2>当前状态</h2><span className={'cg-pill' + (wired ? ' ok' : '')}><i />{wired ? '已绑定' : '未绑定'}</span></div>
          <div className="cg-sgroup"><h3>登录态</h3>
            <StatusRow label="账号" onClick={() => goto('accounts')} title="管理账号">
              <span className={'cg-dot' + (status.hasTokens ? ' ok' : ' bad')} />
              <span className="mono cg-ellipsis">{status.activeAccount ? (status.activeAccount.email || status.activeAccount.label) : (status.authExists ? '未入库的账号' : '未登录')}</span>
              {status.hasTokens && <span className="cg-tag">OAuth 正常</span>}
            </StatusRow>
            <StatusRow label="计划">{plan || '—'}</StatusRow>
            <StatusRow label="令牌">
              <div className="cg-stack">
                <span className="mono">access token · {lifeStr(life.accessTokenMs)}</span>
                {life.idTokenMs != null && <span className={idExpired ? 'cg-warn' : 'cg-muted'}
                  title="id_token 寿命约 1 小时；切换时会自动预刷新">id_token {idExpired ? '已过期（切换时会自动刷新）' : lifeStr(life.idTokenMs)}</span>}
              </div>
            </StatusRow>
          </div>
          <div className="cg-sgroup"><h3>流量出口</h3>
            <StatusRow label="中转站" onClick={() => goto('relays')} title="管理中转站">
              <div className="cg-stack">
                <span>{status.activeRelay ? status.activeRelay.name : (status.baseUrl ? '未入库的中转站' : '未指向')}</span>
                <span className="mono cg-muted cg-ellipsis" title={status.baseUrl}>{status.baseUrl || '—'}</span>
              </div>
            </StatusRow>
            <StatusRow label="延迟">
              {lt ? <><span className={'cg-dot' + (lt.ok ? ' ok' : ' bad')} /><span className="mono">{lt.ok ? lt.ms + ' ms' : '不通'}</span>
                {lt.ok && <span className="cg-meter"><i style={{ width: Math.max(6, 100 - Math.min(100, lt.ms / 10)) + '%' }} /></span>}</> : <span className="cg-muted">未测速</span>}
            </StatusRow>
          </div>
          <div className="cg-sgroup"><h3>Codex</h3>
            <StatusRow label="模型"><span className="mono">{status.model || '—'}</span></StatusRow>
            <StatusRow label="目录">{status.catalog ? <><span>已部署</span><span className="cg-tag">目录已接管</span></> : <span className="cg-muted">未部署</span>}</StatusRow>
            <StatusRow label="窗口"><span className="mono">{status.contextWindow ? fmtK(status.contextWindow) : '—'}</span></StatusRow>
            <StatusRow label="Codex 目录"><span className="mono cg-ellipsis" title={status.home}>{status.home || '—'}</span></StatusRow>
          </div>
        </section>
      </div>

      <Modal open={!!codexWarn} bare width={460} onClose={() => setCodexWarn(null)} footer={null}>
        <div style={{ padding: '28px 30px 0' }}>
          <div className="warn-modal-head">
            <div className="warn-icon-box"><Icon name="alert" size={24} /></div>
            <div>
              <div className="warn-title">检测到 Codex 客户端</div>
              <div className="warn-subtitle">Environment Conflict</div>
            </div>
          </div>
        </div>
        <div style={{ padding: '16px 30px 22px' }}>
          <div className="warn-body">
            检测到 <b style={{ color: 'var(--txt-1)', fontWeight: 500 }}>Codex 桌面端/CLI</b> 正在运行({codexWarn?.pids?.length || '?'} 个进程)。
            它退出时可能用内存中的旧配置覆盖刚写入的切换结果。
          </div>
          <div className="warn-info-card">
            <Icon name="info" size={14} />
            <span>建议:先完全退出 Codex 客户端(含托盘图标),再回来继续切换,避免"切了又弹回去"。</span>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={() => setCodexWarn(null)} disabled={stopping}>我去手动退出</button>
          <button className="btn btn-ghost" onClick={() => { setCodexWarn(null); execSwitch(); }} disabled={stopping}>仍要切换</button>
          <button className="btn btn-primary" onClick={killAndSwitch} disabled={stopping}>
            {stopping ? <><Spinner size={12} /> 关闭中…</> : '帮我关闭并切换'}
          </button>
        </div>
      </Modal>
      <Confirm open={!!confirmRb} danger title="回滚到较早的备份"
        message={<span>确定回滚到 <b className="mono" style={{ color: 'var(--txt-1)' }}>{confirmRb?.id}</b> 吗？当前配置会先自动备份。</span>}
        confirmLabel="回滚" onCancel={() => setConfirmRb(null)} onConfirm={() => { const b = confirmRb; setConfirmRb(null); rollback(b); }} />
    </div>
  );
}
