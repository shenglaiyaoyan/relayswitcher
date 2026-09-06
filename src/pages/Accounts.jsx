import React, { useMemo, useRef, useState } from 'react';
import { Icon, Spinner, Confirm, Empty, fmtAgo, planLabel } from '../components/ui.jsx';

/** 前端实时解析粘贴的 JSON,给出预览/错误(importAccount 在主进程里还有同样的归一化兜底) */
function parsePreview(text) {
  const t = text.trim();
  if (!t) return null;
  if (t.length > 1024 * 1024) return { tooLarge: true }; // >1MB 跳过实时解析,导入时仍会校验
  try {
    const o = JSON.parse(t);
    if (Array.isArray(o)) {
      if (!o.length) return { err: '数组为空' };
      return { batchCount: o.length };
    }
    const tok = o.tokens && typeof o.tokens === 'object' ? o.tokens : o;
    const claims = (() => {
      try {
        const p = String(tok.id_token || '').split('.')[1];
        return p ? JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/'))) : {};
      } catch { return {}; }
    })();
    const has = tok.access_token || tok.refresh_token;
    if (!has) return { err: '未找到 access_token / refresh_token 字段' };
    return {
      email: claims.email || '—',
      plan: claims['chatgpt_plan_type'] || claims.chatgpt_account_type || '',
      accountId: tok.account_id || claims['https://api.openai.com/auth']?.chatgpt_account_id || '—',
      hasId: !!tok.id_token, hasRefresh: !!tok.refresh_token
    };
  } catch (e) { return { err: 'JSON 解析失败: ' + e.message }; }
}

export default function Accounts({ state, refresh, toast }) {
  const { accounts, status } = state;
  const [json, setJson] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshingId, setRefreshingId] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [batchResults, setBatchResults] = useState(null); // [{index, ok, label?, error?}]
  const fileRef = useRef(null);

  const pv = useMemo(() => parsePreview(json), [json]);

  const onFile = async (f) => {
    if (!f) return;
    try { setJson(await f.text()); }
    catch (e) { toast('读取文件失败: ' + e.message, 'bad'); }
  };

  /** 批量导入(US-03):多文件 → 逐文件文本;textarea 粘贴 JSON 数组 → 逐条拆分 */
  const runBatch = async (texts) => {
    setBatchResults(null);
    const results = await window.rs.importAccountsBatch(texts);
    setBatchResults(results);
    const ok = results.filter(r => r.ok).length;
    toast(`批量导入完成:${ok} 成功 / ${results.length - ok} 失败`, ok ? 'ok' : 'bad');
    setJson(''); setLabel('');
    await refresh();
  };

  const onFiles = async (files) => {
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length) return;
    if (list.length === 1) return onFile(list[0]); // 单文件仍走预览编辑流
    const texts = [];
    for (const f of list) { try { texts.push(await f.text()); } catch { texts.push(JSON.stringify({})); } }
    await runBatch(texts);
  };

  const onDrop = async (e) => {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length) return onFiles(e.dataTransfer.files);
    return onFile(null);
  };

  const doImport = async () => {
    const t = json.trim();
    if (!t) return toast('请粘贴 JSON', 'bad');
    // JSON 数组 → 批量路径
    if (t.startsWith('[')) {
      try {
        const arr = JSON.parse(t);
        if (Array.isArray(arr)) return runBatch(arr.map(x => JSON.stringify(x)));
      } catch (e) { return toast('数组解析失败: ' + e.message, 'bad'); }
    }
    setBusy(true);
    try {
      const a = await window.rs.importAccount(t, label.trim() || undefined);
      toast('已导入: ' + a.label + (a.plan ? ' (' + (planLabel(a.plan) || a.plan) + ')' : ''), 'ok');
      setJson(''); setLabel('');
      await refresh();
    } catch (e) { toast('导入失败: ' + e.message, 'bad'); }
    finally { setBusy(false); }
  };

  const doRefresh = async (a) => {
    setRefreshingId(a.id);
    try {
      const r = await window.rs.refreshAccount(a.id);
      if (r.ok) {
        toast(`刷新成功:新 access_token 约 ${r.expiresInDays} 天${r.rotated ? ',refresh_token 已轮换并保存' : ''}`, 'ok');
        await refresh();
      } else {
        toast('刷新失败: ' + r.error, 'bad');
      }
    } catch (e) { toast('刷新异常: ' + e.message, 'bad'); }
    finally { setRefreshingId(null); }
  };

  const importFromCodexAccount = async () => {
    try {
      const r = await window.rs.importAccountFromCodex();
      if (r.skipped) { toast(r.message, 'warn'); return; }
      if (r.ok) {
        toast(`已从本机导入:${r.account.label}${r.account.plan ? ' (' + (planLabel(r.account.plan) || r.account.plan) + ')' : ''}`, 'ok');
        await refresh();
      } else toast(r.error, 'bad');
    } catch (e) { toast('导入失败: ' + e.message, 'bad'); }
  };

  const del = async () => {
    try { await window.rs.deleteAccount(confirmDel.id); toast('已删除 ' + confirmDel.label, 'ok'); await refresh(); }
    catch (e) { toast(e.message, 'bad'); }
    finally { setConfirmDel(null); }
  };

  return (
    <div>
      <div className="page-title"><h1>账号</h1><span className="sub">Account Vault</span></div>

      <div className={'card dropzone' + (dragOver ? ' dragover' : '')} style={{ marginBottom: 16 }}>
        <div className="klabel"><Icon name="download" size={12} /> 导入账号 <small>支持 auth.json / Sub2API(k12) 格式 · tokens 经 DPAPI 加密存储</small></div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <input type="text" placeholder="备注名(可选,默认取邮箱)" value={label} onChange={e => setLabel(e.target.value)} disabled={busy} />
          <button className="btn btn-sm" onClick={() => fileRef.current && fileRef.current.click()} disabled={busy}>
            <Icon name="file" size={13} /> 选择文件
          </button>
          <input ref={fileRef} type="file" accept=".json,.txt" multiple style={{ display: 'none' }} onChange={e => onFiles(e.target.files)} />
        </div>
        <textarea
          placeholder={'粘贴 JSON,或把 .json 文件拖进来…\n{"tokens":{"id_token":"…","access_token":"…","refresh_token":"…","account_id":"…"}}'}
          value={json} onChange={e => setJson(e.target.value)} disabled={busy}
          className={pv ? (pv.err ? 'err' : 'ok') : ''}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop} />

        {pv && pv.tooLarge && (
          <div className="parse-preview">
            <div className="pv-title" style={{ color: 'var(--warn)' }}><Icon name="info" size={14} /> 文本超过 1MB,已跳过实时预览</div>
            <div className="pv-line muted">点「导入账号」时会完整校验;建议粘贴 JSON 数组分批</div>
          </div>
        )}
        {pv && !pv.err && pv.batchCount && (
          <div className="parse-preview">
            <div className="pv-title"><Icon name="check" size={14} style={{ color: 'var(--ok)' }} /> 批量模式:识别到 {pv.batchCount} 个账号</div>
            <div className="pv-line muted">点「导入账号」逐条导入,单条失败不影响其余</div>
          </div>
        )}
        {pv && !pv.err && !pv.batchCount && !pv.tooLarge && (
          <div className="parse-preview">
            <div className="pv-title"><Icon name="check" size={14} style={{ color: 'var(--ok)' }} /> 识别成功</div>
            <div className="pv-line">邮箱 <b>{pv.email}</b>
              {pv.plan && <span className="badge gold">{planLabel(pv.plan) || pv.plan}</span>}</div>
            <div className="pv-line">account_id <b className="mono">{pv.accountId}</b></div>
            <div className="pv-line muted">字段: {pv.hasId ? 'id_token ✓' : 'id_token ✗'} · {pv.hasRefresh ? 'refresh_token ✓' : 'refresh_token ✗'}</div>
            {!pv.hasRefresh && (
              <div className="pv-line" style={{ color: 'var(--bad)', marginTop: 6, fontWeight: 600 }}>
                ⚠ 没有 refresh_token:access_token 过期(通常数小时~一天)后即失效,无法续期
              </div>
            )}
          </div>
        )}
        {pv && pv.err && (
          <div className="parse-preview err">
            <div className="pv-title" style={{ color: 'var(--bad)' }}><Icon name="alert" size={14} /> {pv.err}</div>
          </div>
        )}

        {batchResults && (
          <div className="parse-preview">
            <div className="pv-title">
              <Icon name="check" size={14} style={{ color: batchResults.every(r => r.ok) ? 'var(--ok)' : 'var(--warn)' }} />
              批量导入结果:{batchResults.filter(r => r.ok).length} 成功 / {batchResults.filter(r => !r.ok).length} 失败
            </div>
            {batchResults.map(r => (
              <div key={r.index} className="pv-line">
                <span style={{ color: r.ok ? 'var(--ok)' : 'var(--bad)' }}>{r.ok ? '✓' : '✗'}</span>
                <b>{r.ok ? r.label : `第 ${r.index + 1} 条`}</b>
                {!r.ok && <span style={{ color: 'var(--bad)' }}>{r.error}</span>}
                {r.ok && r.plan && <span className="badge gold">{planLabel(r.plan) || r.plan}</span>}
              </div>
            ))}
          </div>
        )}

        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btn-gold" disabled={busy || !pv || !!pv.err} onClick={doImport}>
            {busy ? <><Spinner size={12} /> 导入中…</> : <><Icon name="plus" size={13} /> 导入账号</>}
          </button>
          {json && !busy && <button className="btn" onClick={() => { setJson(''); setLabel(''); }}>清空</button>}
        </div>
      </div>

      {accounts.length === 0
        ? <Empty icon="account" title="账号库为空" hint="导入第一个账号后,即可在仪表盘参与一键切换"
            action={<div className="row" style={{ justifyContent: 'center', gap: 10, marginTop: 6 }}>
              <button className="btn btn-gold btn-sm" onClick={importFromCodexAccount}>
                <Icon name="download" size={12} /> 从本机 Codex 导入登录账号
              </button>
            </div>} />
        : <div className="grid2">
            {accounts.map(a => (
              <div key={a.id} className="card">
                <div className="row">
                  <div className="grow">
                    <div className="stat-main" style={{ fontSize: 14 }}>
                      <span className="ellipsis">{a.label}</span>
                      {status.activeAccount?.id === a.id && <span className="badge ok">当前使用</span>}
                    </div>
                    <div className="stat-sub">
                      {a.plan && <span className="badge gold">{planLabel(a.plan) || a.plan}</span>}
                      {a.hasRefreshToken
                        ? <span className="badge ok" title="带 refresh_token,可一键刷新续期">可续期</span>
                        : <span className="badge bad" title="没有 refresh_token,access_token 到期即失效">一次性</span>}
                      <span className="muted mono">{a.accountId ? a.accountId.slice(0, 8) + '…' : '—'}</span>
                      <span className="muted">{fmtAgo(a.addedAt)}导入</span>
                    </div>
                  </div>
                  <span className="muted" title="tokens 加密存储"><Icon name="lock" size={14} /></span>
                  {a.hasRefreshToken && (
                    <button className="btn btn-sm" disabled={refreshingId === a.id} onClick={() => doRefresh(a)} title="用 refresh_token 换新 access_token(走系统代理)">
                      {refreshingId === a.id ? <><Spinner size={11} /> 刷新中…</> : <><Icon name="refresh" size={12} /> 刷新</>}
                    </button>
                  )}
                  <button className="icon-btn" title="删除账号" onClick={() => setConfirmDel(a)}><Icon name="trash" size={15} /></button>
                </div>
                {a.tokenExp && (
                  <div className="muted" style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="info" size={12} /> token 过期 {a.tokenExp.slice(0, 10)}
                  </div>
                )}
              </div>
            ))}
          </div>}

      <Confirm open={!!confirmDel} danger busy={false} title="删除账号"
        message={<span>确定删除账号 <b style={{ color: 'var(--txt-1)' }}>{confirmDel?.label}</b> 吗?该操作只删除本地凭证库里的记录,不会改动 CODEX_HOME 下的 auth.json。</span>}
        confirmLabel="删除" onCancel={() => setConfirmDel(null)} onConfirm={del} />
    </div>
  );
}
