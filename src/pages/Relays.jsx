import React, { useState } from 'react';
import { Icon, Spinner, Modal, Confirm, Empty, Field, fmtAgo } from '../components/ui.jsx';

export default function Relays({ state, refresh, toast }) {
  const { relays, status } = state;
  const [form, setForm] = useState(null); // null=关闭,{id:'',name...}=新增/编辑
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const openAdd = () => setForm({ id: '', name: '', baseUrl: '', apiKey: '' });
  const openEdit = (r) => setForm({ id: r.id, name: r.name, baseUrl: r.baseUrl, apiKey: '' });

  const save = async () => {
    setSaving(true);
    try {
      await window.rs.saveRelay({ ...form, baseUrl: form.baseUrl.trim().replace(/\/+$/, '') });
      toast('中转站已保存', 'ok');
      setForm(null);
      await refresh();
    } catch (e) { toast(e.message, 'bad'); }
    finally { setSaving(false); }
  };

  const del = async () => {
    try { await window.rs.deleteRelay(confirmDel.id); toast('已删除 ' + confirmDel.name, 'ok'); await refresh(); }
    catch (e) { toast(e.message, 'bad'); }
    finally { setConfirmDel(null); }
  };

  const importFromCodex = async () => {
    try {
      const r = await window.rs.importRelaysFromCodex();
      if (!r.ok) return toast(r.error, 'bad');
      if (r.imported === 0) return toast(`没有新中转站可导入(${r.skipped} 个已在库中)`, 'warn');
      toast(`已导入 ${r.imported} 个中转站:${r.names.join('、')}`, 'ok');
      await refresh();
    } catch (e) { toast('导入失败: ' + e.message, 'bad'); }
  };

  const test = async (id) => {
    setTesting(id); setExpanded(null);
    try {
      const r = await window.rs.testRelay(id);
      toast(r.ok ? `连通 ✓ ${r.ms}ms · ${r.count} 个模型` : '不通: ' + r.error, r.ok ? 'ok' : 'bad');
      if (r.ok) setExpanded(id);
      await refresh();
    } catch (e) { toast(e.message, 'bad'); }
    finally { setTesting(null); }
  };

  const editing = !!form?.id;

  return (
    <div>
      <div className="page-title">
        <h1>中转站</h1><span className="sub">Relay Stations</span>
        <span className="spacer" />
        <button className="btn btn-gold" onClick={openAdd}><Icon name="plus" size={13} /> 添加中转站</button>
      </div>

      {relays.length === 0
        ? <Empty icon="relay" title="还没有中转站"
            hint="添加你的自建中转站(base_url + API Key),一键切换时流量将指向它"
            action={<div className="row" style={{ justifyContent: 'center', gap: 10, marginTop: 6 }}>
              <button className="btn btn-gold btn-sm" onClick={openAdd} style={{ marginTop: 0 }}><Icon name="plus" size={12} /> 立即添加</button>
              <button className="btn btn-sm" onClick={importFromCodex}>
                <Icon name="download" size={12} /> 从本机 config.toml 导入
              </button>
            </div>} />
        : <div className="grid2">
            {relays.map(r => {
              const t = r.lastTest;
              return (
                <div key={r.id} className="card">
                  <div className="row">
                    <div className="grow">
                      <div className="stat-main" style={{ fontSize: 14 }}>
                        <span className="ellipsis">{r.name}</span>
                        {status.activeRelay?.id === r.id && <span className="badge ok">当前使用</span>}
                      </div>
                      <div className="stat-sub">
                        <span className="muted mono ellipsis" style={{ maxWidth: 210 }} title={r.baseUrl}>{r.baseUrl}</span>
                        <span className="badge" title="API Key">
                          <Icon name="key" size={10} /> {r.hasKey ? '已配置' : '无 Key'}
                        </span>
                      </div>
                    </div>
                    {testing === r.id
                      ? <Spinner size={15} style={{ color: 'var(--gold-light)' }} />
                      : t && <span className={'badge ' + (t.ok ? 'ok' : 'bad')} title={t.ok ? new Date(t.at).toLocaleString() : (t.error + ' @ ' + new Date(t.at).toLocaleString())}>
                          {t.ok ? `${t.ms}ms · ${t.count} 模型` : '不通'}
                        </span>}
                  </div>

                  {expanded === r.id && t?.models?.length > 0 && (
                    <div className="model-pop">
                      {t.models.slice(0, 40).map(m => (
                        <span key={m} className={'chip' + (m === status.model ? ' cur' : '')}>{m}</span>
                      ))}
                      {t.models.length > 40 && <span className="chip" style={{ cursor: 'default' }}>+{t.models.length - 40} 个</span>}
                    </div>
                  )}

                  <div className="row" style={{ marginTop: 13 }}>
                    <button className="btn btn-sm" disabled={testing === r.id} onClick={() => test(r.id)}>
                      {testing === r.id ? <><Spinner size={11} /> 测试中…</> : <><Icon name="bolt" size={12} /> 测试连通</>}
                    </button>
                    {t?.ok && t.models?.length > 0 && (
                      <button className="btn btn-sm" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                        <Icon name="chevron" size={12} className={expanded === r.id ? '' : undefined}
                          style={expanded === r.id ? { transform: 'rotate(180deg)' } : undefined} /> 模型
                      </button>
                    )}
                    <span className="spacer" style={{ flex: 1 }} />
                    {t && <span className="muted">{fmtAgo(t.at)}测试</span>}
                    <button className="icon-btn" title="编辑" onClick={() => openEdit(r)}><Icon name="edit" size={14} /></button>
                    <button className="icon-btn" title="删除" onClick={() => setConfirmDel(r)}><Icon name="trash" size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>}

      {/* 新增/编辑模态 */}
      <Modal open={!!form} title={<><Icon name="relay" size={15} /> {editing ? '编辑中转站' : '添加中转站'}</>}
        onClose={() => setForm(null)}
        footer={<>
          <button className="btn" onClick={() => setForm(null)} disabled={saving}>取消</button>
          <button className="btn btn-primary" disabled={saving || !form?.name || !form?.baseUrl} onClick={save}>
            {saving ? <><Spinner size={12} /> 保存中…</> : '保存'}
          </button>
        </>}>
        {form && <>
          <Field label="名称" hint="仅本地显示">
            <input type="text" placeholder="如 Sub2APIU" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
          </Field>
          <Field label="base_url" hint="填到 /v1 为止">
            <input type="text" placeholder="https://api.example.com/v1" value={form.baseUrl} onChange={e => setForm({ ...form, baseUrl: e.target.value })} />
          </Field>
          <Field label="API Key" hint={editing ? '留空 = 保持不变' : 'Bearer 方式发送'}>
            <input type="text" placeholder="sk-…" value={form.apiKey} onChange={e => setForm({ ...form, apiKey: e.target.value })} />
          </Field>
        </>}
      </Modal>

      <Confirm open={!!confirmDel} danger title="删除中转站"
        message={<span>确定删除 <b style={{ color: 'var(--txt-1)' }}>{confirmDel?.name}</b> 吗?已保存的 Key 将一并清除,CODEX_HOME 里已写入的配置不受影响。</span>}
        confirmLabel="删除" onCancel={() => setConfirmDel(null)} onConfirm={del} />
    </div>
  );
}
