import React, { useEffect, useState } from 'react';
import { Icon, Spinner, Confirm, Empty, fmtAgo } from '../components/ui.jsx';

const REASON_STYLE = {
  switch: { label: '切换前', cls: 'gold' },
  'pre-restore': { label: '回滚前', cls: 'warn' },
  manual: { label: '手动', cls: '' }
};

export default function Backups({ refresh, toast }) {
  const [backups, setBackups] = useState(null);
  const [busy, setBusy] = useState('');
  const [confirmRb, setConfirmRb] = useState(null);

  const load = async () => { try { setBackups(await window.rs.listBackups()); } catch { setBackups([]); } };
  useEffect(() => { load(); }, []);

  const doRestore = async () => {
    setBusy(confirmRb.id);
    try {
      const r = await window.rs.restoreBackup(confirmRb.id);
      toast('已回滚(' + r.restored.join(' / ') + ')— 重启 Codex 客户端生效', 'ok');
      await load(); await refresh();
    } catch (e) { toast('回滚失败: ' + e.message, 'bad'); }
    finally { setBusy(''); setConfirmRb(null); }
  };

  return (
    <div>
      <div className="page-title">
        <h1>备份</h1><span className="sub">Backups & Rollback</span>
        <span className="spacer" />
        <button className="icon-btn" title="刷新" onClick={load}><Icon name="refresh" size={15} /></button>
      </div>

      <div className="empty" style={{ flexDirection: 'row', gap: 14, padding: '22px 20px', textAlign: 'left' }}>
        <Icon name="info" size={18} className="empty-icon" />
        <div>
          每次切换 / 回滚前自动快照 <span className="mono">auth.json + config.toml</span>(连带模型目录文件),最多保留最近 20 份。
          <div className="muted" style={{ marginTop: 3 }}>回滚本身也会先快照当前状态 — 双向可退。</div>
        </div>
      </div>

      {backups === null
        ? <div className="skeleton" style={{ height: 140 }} />
        : backups.length === 0
          ? <Empty icon="backup" title="暂无备份" hint="去仪表盘执行一次切换,这里就会出现第一份快照" />
          : <div className="tl">
              {backups.map(b => {
                const rs = REASON_STYLE[b.reason] || { label: b.reason, cls: '' };
                return (
                  <div key={b.id} className="tl-item card">
                    <div className="row">
                      <div className="grow">
                        <div className="stat-main" style={{ fontSize: 13 }}>
                          <span className="mono" style={{ color: 'var(--gold-light)' }}>{b.id}</span>
                          <span className={'badge ' + rs.cls}>{rs.label}</span>
                          <span className="muted" title={b.time}>{fmtAgo(b.time)}</span>
                        </div>
                        <div className="stat-sub" style={{ marginTop: 5 }}>
                          {(b.files || []).map(f => (
                            <span key={f} className="badge" style={{ cursor: 'default' }}><Icon name="file" size={10} /> {f}</span>
                          ))}
                        </div>
                      </div>
                      <button className="btn btn-gold btn-sm" disabled={busy === b.id} onClick={() => setConfirmRb(b)}>
                        {busy === b.id ? <><Spinner size={11} /> 回滚中…</> : <><Icon name="undo" size={12} /> 回滚到此份</>}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>}

      <Confirm open={!!confirmRb} title="回滚确认"
        message={<span>将把 <span className="mono">auth.json / config.toml</span> 恢复到 <b style={{ color: 'var(--txt-1)' }} className="mono">{confirmRb?.id}</b> 时点。<br />当前状态会先自动快照,可再次回滚回来。回滚后需重启 Codex 客户端生效。</span>}
        confirmLabel="确认回滚" busy={busy === confirmRb?.id}
        onCancel={() => setConfirmRb(null)} onConfirm={doRestore} />
    </div>
  );
}
