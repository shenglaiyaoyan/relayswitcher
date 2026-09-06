import React, { useEffect, useRef, useState } from 'react';
import { Icon, Select, Spinner, Modal, fmtK, planLabel } from '../components/ui.jsx';

const QUICK_MODELS = ['gpt-6-astra', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'];
const DEFAULT_MODELS = ['gpt-6-astra', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.2'];
const CTX_PRESETS = [272000, 372000, 872000];

export default function Dashboard({ state, refresh, toast, goto }) {
  const { accounts, relays, settings, status } = state;
  const [accountId, setAccountId] = useState('');
  const [relayId, setRelayId] = useState('');
  const [model, setModel] = useState('gpt-6-astra');
  const [ctx, setCtx] = useState(872000);
  const [fastMode, setFastMode] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [done, setDone] = useState(null); // 'ok' | 'bad'
  const [codexWarn, setCodexWarn] = useState(null);
  const [log, setLog] = useState([]);
  const [lastBackup, setLastBackup] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const logRef = useRef(null);

  // 从当前状态同步默认值
  useEffect(() => {
    setModel(status.model || 'gpt-6-astra');
    setCtx(status.contextWindow || settings.contextWindow || 872000);
    setFastMode(status.serviceTier ? status.serviceTier === 'priority' : !!settings.fastMode);
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!accountId && accounts.length) setAccountId((status.activeAccount || accounts[0]).id);
    if (!relayId && relays.length) setRelayId((status.activeRelay || relays[0]).id);
  }, [accounts, relays]); // eslint-disable-line

  const loadBackup = async () => {
    try { const b = await window.rs.listBackups(); setLastBackup(b[0] || null); } catch { /* ignore */ }
  };
  useEffect(() => { loadBackup(); }, [status]);

  useEffect(() => {
    const off = window.rs.onSwitchStep((step) => {
      setLog(prev => [...prev, step]);
      requestAnimationFrame(() => logRef.current && logRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
    });
    return off;
  }, []);

  const manualRefresh = async () => {
    setRefreshing(true);
    await refresh(); await loadBackup();
    setTimeout(() => setRefreshing(false), 450);
  };

  const activeRelay = relays.find(r => r.id === relayId);
  const relayModels = (activeRelay?.lastTest?.models || []).filter(m => !DEFAULT_MODELS.includes(m));
  const modelOptions = [
    ...DEFAULT_MODELS.map(m => ({ value: m, label: m + ' · 官方' })),
    ...relayModels.map(m => ({ value: m, label: m + ' · 中转站' }))
  ];
  // 选项变化后,当前 model 不在列表里则回落官方默认,保证 state 与显示一致
  useEffect(() => {
    if (!modelOptions.some(o => o.value === model)) setModel(DEFAULT_MODELS[0]);
  }, [relayId, modelOptions.length]); // eslint-disable-line

  const doSwitch = async () => {
    if (!accountId || !relayId || switching) return;
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

  const execSwitch = async () => {
    if (!accountId || !relayId || switching) return;
    setSwitching(true); setDone(null); setLog([]);
    try {
      const r = await window.rs.doSwitch({ accountId, relayId, model: model.trim(), contextWindow: Number(ctx) || null, fastMode });
      setDone(r.ok ? 'ok' : 'bad');
      if (r.ok) toast('切换完成 — 重启 Codex 客户端后生效', 'ok');
      else toast('切换失败: ' + r.error, 'bad');
      await refresh(); await loadBackup();
    } catch (e) {
      setDone('bad');
      toast('切换异常: ' + e.message, 'bad');
    } finally { setSwitching(false); }
  };

  const rollback = async () => {
    if (!lastBackup) return;
    try {
      await window.rs.restoreBackup(lastBackup.id);
      toast('已回滚到 ' + lastBackup.id + ' — 重启 Codex 客户端生效', 'ok');
      await refresh(); await loadBackup();
    } catch (e) { toast('回滚失败: ' + e.message, 'bad'); }
  };

  const lt = status.activeRelay?.lastTest;
  const plan = status.activeAccount ? planLabel(status.activeAccount.plan) : null;

  return (
    <div>
      <div className="page-title">
        <h1>仪表盘</h1><span className="sub">Dashboard</span>
        <span className="spacer" />
        <span className="muted mono ellipsis" style={{ maxWidth: 260 }} title={status.home}>{status.home}</span>
        <button className={'icon-btn' + (refreshing ? ' spin' : '')} title="刷新状态" onClick={manualRefresh} disabled={refreshing}>
          <Icon name="refresh" size={15} />
        </button>
      </div>

      {/* 状态卡 */}
      <div className="stat-row">
        <div className="card clickable" onClick={() => goto('accounts')} title="管理账号">
          <div className="klabel"><Icon name="account" size={12} /> Account</div>
          <div className="stat-main ellipsis">
            {status.activeAccount ? (status.activeAccount.email || status.activeAccount.label) : (status.authExists ? '未入库的账号' : '未登录')}
          </div>
          <div className="stat-sub">
            {plan && <span className="badge gold">{plan}</span>}
            <span className="muted">{status.hasTokens ? 'OAuth 登录态 ✓' : '无 tokens'}</span>
          </div>
        </div>
        <div className="card clickable" onClick={() => goto('relays')} title="管理中转站">
          <div className="klabel"><Icon name="relay" size={12} /> Relay</div>
          <div className="stat-main ellipsis">{status.activeRelay ? status.activeRelay.name : (status.baseUrl || '未指向')}</div>
          <div className="stat-sub">
            {lt && <span className={'badge ' + (lt.ok ? 'ok' : 'bad')}>{lt.ok ? lt.ms + 'ms' : '不通'}</span>}
            <span className="muted mono ellipsis" style={{ maxWidth: 170 }} title={status.baseUrl}>{status.baseUrl || '—'}</span>
          </div>
        </div>
        <div className="card">
          <div className="klabel"><Icon name="bolt" size={12} /> Model</div>
          <div className="stat-main ellipsis">{status.model || '—'}</div>
          <div className="stat-sub"><span className="muted">档位由模型目录定义</span>
            {status.catalog && <span className="badge gold">目录已接管</span>}</div>
        </div>
        <div className="card">
          <div className="klabel"><Icon name="dash" size={12} /> Status</div>
          <div className="stat-main">
            <span className={'badge ' + (status.serviceTier === 'priority' ? 'ok' : '')} style={{ padding: '4px 11px' }}>
              <Icon name="bolt" size={11} /> 快速模式 {status.serviceTier === 'priority' ? 'ON' : 'OFF'}
            </span>
          </div>
          <div className="stat-sub"><span className="muted">窗口 {fmtK(status.contextWindow) || '默认'}</span></div>
        </div>
      </div>

      {/* 一键切换 */}
      <div className="card switch-panel">
        <div className="klabel"><Icon name="bolt" size={12} /> 一键切换 <small>登录态与流量出口,自由组合</small></div>
        <div className="switch-grid">
          <div className="step">
            <div className="step-head"><span className="step-num">01</span><span className="step-title">选择账号</span></div>
            <Select value={accountId} onChange={setAccountId} disabled={switching || !accounts.length}
              options={accounts.map(a => ({ value: a.id, label: a.label + (a.plan ? ' · ' + (planLabel(a.plan) || a.plan) : '') }))}
              emptyText="还没有账号 — 去「账号」页导入" placeholder="选择账号…" />
            {!accounts.length && <div className="muted" style={{ marginTop: 8 }}>
              <span style={{ color: 'var(--gold-hover)', cursor: 'pointer' }} onClick={() => goto('accounts')}>去导入账号 →</span>
            </div>}
          </div>
          <div className="step">
            <div className="step-head"><span className="step-num">02</span><span className="step-title">选择中转站</span></div>
            <Select value={relayId} onChange={setRelayId} disabled={switching || !relays.length}
              options={relays.map(r => ({ value: r.id, label: r.name + ' · ' + r.baseUrl }))}
              emptyText="还没有中转站 — 去「中转站」页添加" placeholder="选择中转站…" />
            {!relays.length && <div className="muted" style={{ marginTop: 8 }}>
              <span style={{ color: 'var(--gold-hover)', cursor: 'pointer' }} onClick={() => goto('relays')}>去添加中转站 →</span>
            </div>}
          </div>
          <div className="step">
            <div className="step-head"><span className="step-num">03</span><span className="step-title">模型</span></div>
            <Select value={modelOptions.some(m => m.value === model) ? model : modelOptions[0]?.value}
                    onChange={setModel} disabled={switching}
                    options={modelOptions} placeholder="选择模型…"
                    emptyText="暂无模型 — 先去「中转站」页测试连通" />
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {QUICK_MODELS.map(m => (
                <span key={m} className={'chip' + (model === m ? ' on' : '')} onClick={() => !switching && setModel(m)}>{m}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="opt-row">
          <div className="field-inline">
            上下文窗口
            <input type="number" style={{ width: 108 }} value={ctx} step={1000} disabled={switching}
                   onChange={e => setCtx(e.target.value)} />
            {CTX_PRESETS.map(p => (
              <span key={p} className={'chip' + (Number(ctx) === p ? ' on' : '')} onClick={() => !switching && setCtx(p)}>{fmtK(p)}</span>
            ))}
          </div>
          <div className="field-inline">
            快速模式 priority
            <div className={'switch-toggle' + (fastMode ? ' on' : '') + (switching ? ' disabled' : '')} onClick={() => setFastMode(!fastMode)} />
          </div>
        </div>

        <button className={'btn btn-primary btn-go' + (switching ? ' switching' : '')}
                disabled={switching || !accounts.length || !relays.length || !model.trim()} onClick={doSwitch}>
          {switching ? <><Spinner size={14} /> 切换中…</> : '立即切换'}
        </button>

        <Modal open={!!codexWarn} bare width={460} onClose={() => setCodexWarn(null)}
          footer={null}>
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
            <button className="btn" onClick={() => setCodexWarn(null)}>我去退出 Codex</button>
            <button className="btn btn-primary" onClick={() => { setCodexWarn(null); execSwitch(); }}>仍要切换</button>
          </div>
        </Modal>

        <div className="logbox" ref={logRef}>
          {log.length === 0 && !switching && (
            <span className="gold">$ 就绪 — 备份当前配置 → 写入登录态 → 流量指向中转站 → 部署模型目录 → 校验</span>
          )}
          {log.map((l, i) => (
            <div key={i} className="lstep">
              <span className={l.ok === false ? 'bad' : 'ok'}>{l.ok === false ? '✗' : '✓'}</span>{' '}
              <span className="gold">{l.name}</span>{l.detail ? ' — ' + l.detail : ''}
            </div>
          ))}
          {switching && <div><span className="log-cursor" /><span className="gold">处理中</span></div>}
          {done === 'ok' && <div className="lstep"><span className="ok">✓</span> <span className="gold">完成 — 请重启 Codex 客户端使新配置生效</span></div>}
          {done === 'bad' && <div className="lstep"><span className="bad">✗</span> 切换中止,可从备份页回滚到切换前状态</div>}
        </div>
      </div>

      {/* 备份条 */}
      <div className="card row">
        <span className="badge gold"><Icon name="backup" size={11} /> Backup</span>
        <div className="grow">
          {lastBackup
            ? <span>最近备份 <span className="mono">{lastBackup.id}</span> · {lastBackup.reason} · <span className="muted">{(lastBackup.files || []).join(' / ')}</span></span>
            : <span className="muted">暂无备份 — 每次切换前会自动快照 auth.json 与 config.toml</span>}
        </div>
        <span className="muted">切换前自动快照</span>
        <button className="btn btn-gold btn-sm" disabled={!lastBackup} onClick={rollback}>
          <Icon name="undo" size={12} /> 一键回滚
        </button>
      </div>
    </div>
  );
}
