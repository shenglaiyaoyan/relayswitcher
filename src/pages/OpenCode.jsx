'use strict';
import React, { useEffect, useState } from 'react';
import { Icon, Spinner, Toggle, Select, Modal, Confirm, Empty, Field } from '../components/ui.jsx';

const PROTOCOLS = [
  { value: 'message', label: 'Anthropic Messages', desc: '@ai-sdk/anthropic(/v1/messages)' },
  { value: 'chat', label: 'OpenAI Chat', desc: '@ai-sdk/openai-compatible(/v1/chat/completions)' },
  { value: 'responses', label: 'OpenAI Responses', desc: '@ai-sdk/openai(/v1/responses)' }
];

const slugify = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/^-+|-+$/g, '');
const protocolLabel = (v) => (PROTOCOLS.find(p => p.value === v) || {}).label || v;
const NEW_PROVIDER = () => ({ id: '', name: '', protocol: 'chat', baseUrl: '', apiKey: '', relayId: '', models: [], defaultModel: '' });

export default function OpenCode({ state, toast, goto }) {
  const [providers, setProviders] = useState([]);
  const [editing, setEditing] = useState(null); // null=关闭,{...}=新建/编辑(isNew 区分)
  const [isNew, setIsNew] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [relayModels, setRelayModels] = useState(null); // /v1/models 拉取结果(null=未拉)
  const [confirmDel, setConfirmDel] = useState(null);

  const load = async () => {
    try { setProviders(await window.rs.ocList()); } catch (e) { toast(e.message, 'bad'); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  const openAdd = () => { setRelayModels(null); setIsNew(true); setEditing(NEW_PROVIDER()); };
  const openEdit = (p) => { setRelayModels(null); setIsNew(false); setEditing(p); };

  const save = async () => {
    setBusy(true);
    try {
      // 过滤空 id 的模型条目(手动添加后未填名的行不落盘)
      const payload = { ...editing, models: (editing.models || []).filter(m => m.id && m.id.trim()) };
      const r = await window.rs.ocSave(payload);
      if (r.ok) {
        toast(`Provider「${editing.id}」已写入 ~/.config/opencode/opencode.json — 重启 opencode 生效`, 'ok');
        if (r.hasComments) toast('原配置文件含注释,写回后注释已丢失', 'warn');
        setEditing(null); await load();
      } else toast(r.error, 'bad');
    } finally { setBusy(false); }
  };

  const remove = async () => {
    const id = confirmDel;
    setConfirmDel(null);
    const r = await window.rs.ocRemove(id);
    if (r.ok) { toast(`已移除 ${id}(备份已保留)`, 'ok'); await load(); }
    else toast(r.error, 'bad');
  };

  // 拉模型清单(选站自动触发 / 手动点按;fetching 锁单飞,不并发重复请求)
  const fetchModels = async (relayId) => {
    if (!relayId || fetching) return;
    setFetching(true); setRelayModels(null);
    try {
      const r = await window.rs.ocFetchModels(relayId);
      if (r.ok) setRelayModels(r.models);
      else toast(r.error, 'warn');
    } catch (e) { toast(e.message, 'warn'); }
    finally { setFetching(false); }
  };

  return (
    <div>
      <div className="page-title">
        <h1>OpenCode</h1><span className="sub">Providers</span>
        <span className="spacer" />
        <button className="header-icon-btn" title="OpenCode 专属设置" onClick={() => goto && goto('settings-opencode')}>
          <Icon name="settings" size={14} />
        </button>
      </div>

      {/* Provider 列表 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <div className="klabel"><Icon name="bolt" size={12} style={{ color: 'var(--gold)' }} /> OpenCode Providers <small>写入 opencode.json + auth.json</small></div>
          <button className="btn btn-sm btn-gold" onClick={openAdd}>
            <Icon name="plus" size={11} /> 新建 Provider
          </button>
        </div>
        {providers.length === 0 && (
          <Empty icon="bolt" title="尚无 Provider"
            hint="从你的中转站库选一个站,RS 自动拉取模型清单并填入参数"
            action={<button className="btn btn-gold btn-sm" style={{ marginTop: 8 }} onClick={openAdd}>
              <Icon name="plus" size={12} /> 新建 Provider
            </button>} />
        )}
        {providers.map(p => (
          <div key={p.id} className="parse-preview" style={{ marginBottom: 8 }}>
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div className="row" style={{ gap: 8, alignItems: 'center', minWidth: 0 }}>
                <b className="ellipsis">{p.name || p.id}</b>
                <span className="badge">{protocolLabel(p.protocol)}</span>
                <span className="muted" style={{ fontSize: 11 }}>{(p.models || []).length} 模型</span>
                {p.defaultModel && <span className="muted ellipsis" style={{ fontSize: 11, maxWidth: 220 }} title={p.defaultModel}>默认 {p.defaultModel}</span>}
              </div>
              <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                <button className="btn btn-sm" onClick={() => openEdit(p)}>编辑</button>
                <button className="btn btn-sm" onClick={() => setConfirmDel(p.id)}>移除</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 新建/编辑 Modal */}
      <Modal open={!!editing} width={720}
        title={<><Icon name="bolt" size={15} /> {isNew ? '新建 Provider' : '编辑 Provider'}</>}
        onClose={() => setEditing(null)}
        footer={<>
          <button className="btn btn-sm" onClick={() => setEditing(null)} disabled={busy}>取消</button>
          <button className="btn btn-sm btn-gold" disabled={busy || !editing?.id} onClick={save}>
            {busy ? <><Spinner size={11} /> 写入中…</> : '写入 opencode.json'}
          </button>
        </>}>
        {editing && <ProviderForm data={editing} setData={setEditing}
          relays={state.relays || []} relayModels={relayModels} fetching={fetching}
          onFetchModels={fetchModels} isNew={isNew} />}
      </Modal>

      <Confirm open={!!confirmDel} danger title="移除 Provider"
        message={<span>确定移除 <b style={{ color: 'var(--txt-1)' }}>{confirmDel}</b> 吗?将同步清理 opencode.json 与 auth.json 中的对应区块(写前已自动备份)。</span>}
        confirmLabel="移除" onCancel={() => setConfirmDel(null)} onConfirm={remove} />
    </div>
  );
}

function ProviderForm({ data, setData, relays, relayModels, fetching, onFetchModels, isNew }) {
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));
  // 从库里选中转站:一键填充 baseUrl/name(+首次自动补 id),并自动拉模型清单
  const pickRelay = (v) => {
    const r = relays.find(x => x.id === v);
    if (r) {
      set('relayId', r.id); set('baseUrl', r.baseUrl); set('name', r.name);
      if (!data.id) { const slug = slugify(r.name); if (slug) set('id', slug); }
      onFetchModels(r.id);
    } else set('relayId', '');
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label="中转站(选库自动填充,或手写)">
        <div className="row" style={{ gap: 8 }}>
          <Select style={{ flex: 1, minWidth: 0 }} value={data.relayId || ''} onChange={pickRelay}
            placeholder="— 手写 —" emptyText="中转站库为空 — 去「中转站」页添加"
            options={[{ value: '', label: '手写(清空关联)' }].concat(
              relays.map(r => ({ value: r.id, label: r.name, desc: r.baseUrl })))} />
          {data.relayId && (
            <button className="btn btn-sm" disabled={fetching} onClick={() => onFetchModels(data.relayId)}>
              {fetching ? <Spinner size={11} /> : <Icon name="refresh" size={11} />} 拉 /v1/models
            </button>
          )}
        </div>
      </Field>
      <Field label="Base URL" hint="填到 /v1 为止">
        <input type="text" value={data.baseUrl} onChange={e => set('baseUrl', e.target.value)} placeholder="https://api.example.com/v1" style={{ width: '100%' }} />
      </Field>
      <Field label="协议类型" hint="决定 opencode 用哪个 ai-sdk 适配器">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {PROTOCOLS.map(p => (
            <span key={p.value} className={'chip' + (data.protocol === p.value ? ' on' : '')}
              onClick={() => set('protocol', p.value)} title={p.desc}>{p.label}</span>
          ))}
        </div>
      </Field>
      <Field label="Provider ID" hint="opencode.json 里 provider 的键名">
        <input type="text" value={data.id} onChange={e => set('id', e.target.value)} placeholder="my-relay" style={{ width: 200 }} />
      </Field>
      <Field label="API Key" hint={isNew ? '写入 auth.json,不进 opencode.json' : '留空 = 保持不变'}>
        <input type="password" value={data.apiKey} onChange={e => set('apiKey', e.target.value)} placeholder="sk-…" style={{ width: '100%' }} />
      </Field>
      <ModelEntries data={data} setData={setData} relayModels={relayModels} fetching={fetching} />
      <Field label="默认模型">
        <Select value={data.defaultModel || ''} onChange={v => set('defaultModel', v)}
          placeholder="不设默认" emptyText="先在上方添加模型"
          options={(data.models || []).filter(m => m.id).map(m => ({ value: `${data.id}/${m.id}`, label: `${data.id}/${m.id}` }))} />
      </Field>
    </div>
  );
}

function ModelEntries({ data, setData, relayModels, fetching }) {
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));
  const models = data.models || [];
  const toggleModel = (modelId) => {
    const exists = models.find(m => m.id === modelId);
    if (exists) set('models', models.filter(m => m.id !== modelId));
    else set('models', [...models, { id: modelId, name: modelId, limit: { context: 0, output: 0 }, reasoning: false, options: {} }]);
  };
  // 按下标更新:手动添加的行 id 可能为空,按 id 定位会串行
  const updateModel = (i, field, value) => {
    set('models', models.map((m, j) => j === i ? { ...m, [field]: value } : m));
  };
  const removeModel = (i) => set('models', models.filter((_, j) => j !== i));
  return (
    <div>
      <div className="klabel">模型条目(勾选 / 手动添加)</div>
      {fetching && <div className="muted row" style={{ gap: 6, margin: '10px 0', fontSize: 12 }}><Spinner size={11} /> 拉取模型清单中…</div>}
      {!fetching && relayModels && relayModels.length > 0 && (
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', margin: '10px 0' }}>
          {relayModels.map(id => (
            <span key={id} className={'chip' + (models.find(m => m.id === id) ? ' on' : '')}
              onClick={() => toggleModel(id)}>{id}</span>
          ))}
        </div>
      )}
      {!fetching && relayModels && relayModels.length === 0 && (
        <div className="muted" style={{ fontSize: 11, margin: '10px 0' }}>该站 /v1/models 返回空,在下方手动添加</div>
      )}
      {!fetching && !relayModels && models.length === 0 && (
        <div className="muted" style={{ fontSize: 11, margin: '10px 0' }}>选中中转站后自动拉取清单,或在下方手动添加</div>
      )}
      {models.map((m, i) => (
        <div key={i} className="parse-preview" style={{ marginBottom: 8, padding: '8px 12px' }}>
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="text" className="mono" value={m.id} onChange={e => updateModel(i, 'id', e.target.value)}
              placeholder="model id" title="模型 ID(必填)" style={{ width: 210, fontSize: 11 }} />
            <input type="text" value={m.name} onChange={e => updateModel(i, 'name', e.target.value)}
              placeholder="显示名" style={{ width: 130, fontSize: 11 }} />
            <input type="number" value={m.limit.context} onChange={e => updateModel(i, 'limit', { ...m.limit, context: Number(e.target.value) })}
              placeholder="ctx" title="上下文窗口(0 = 不写入)" style={{ width: 110, fontSize: 11 }} />
            <input type="number" value={m.limit.output} onChange={e => updateModel(i, 'limit', { ...m.limit, output: Number(e.target.value) })}
              placeholder="out" title="输出上限(0 = 不写入)" style={{ width: 110, fontSize: 11 }} />
            <label className="muted" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
              推理 <Toggle on={!!m.reasoning} onChange={v => updateModel(i, 'reasoning', v)} />
            </label>
            <button className="icon-btn" title="移除该模型" onClick={() => removeModel(i)}>
              <Icon name="x" size={13} />
            </button>
          </div>
          <div className="row" style={{ gap: 8, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="muted" style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
              附件 <Toggle on={!!m.attachment} onChange={v => updateModel(i, 'attachment', v)} />
            </label>
            <label className="muted" style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
              工具调用 <Toggle on={!!m.tool_call} onChange={v => updateModel(i, 'tool_call', v)} />
            </label>
            <label className="muted" style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
              支持 temperature <Toggle on={!!m.temperature} onChange={v => updateModel(i, 'temperature', v)} />
            </label>
          </div>
          <div className="row" style={{ gap: 8, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="muted" style={{ fontSize: 10, minWidth: 52 }}>输入模态</span>
            {['text', 'image', 'audio', 'video', 'pdf'].map(mod => (
              <span key={mod} className={'chip' + ((m.modalities && m.modalities.input || []).includes(mod) ? ' on' : '')}
                onClick={() => {
                  const cur = (m.modalities && m.modalities.input || []);
                  const next = cur.includes(mod) ? cur.filter(x => x !== mod) : [...cur, mod];
                  updateModel(i, 'modalities', { ...(m.modalities || {}), input: next });
                }} style={{ fontSize: 10, padding: '2px 8px' }}>{mod}</span>
            ))}
            <span className="muted" style={{ fontSize: 10, marginLeft: 8 }}>输出模态</span>
            {['text', 'image', 'audio', 'video', 'pdf'].map(mod => (
              <span key={mod} className={'chip' + ((m.modalities && m.modalities.output || []).includes(mod) ? ' on' : '')}
                onClick={() => {
                  const cur = (m.modalities && m.modalities.output || []);
                  const next = cur.includes(mod) ? cur.filter(x => x !== mod) : [...cur, mod];
                  updateModel(i, 'modalities', { ...(m.modalities || {}), output: next });
                }} style={{ fontSize: 10, padding: '2px 8px' }}>{mod}</span>
            ))}
          </div>
          <div className="row" style={{ gap: 8, marginTop: 6, alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 10, minWidth: 52 }}>options</span>
            <input type="text" className="mono" value={m.optionsText || ''} onChange={e => {
              const raw = e.target.value;
              try { const parsed = raw.trim() ? JSON.parse(raw) : {}; updateModel(i, 'options', parsed); updateModel(i, 'optionsText', raw); }
              catch { updateModel(i, 'optionsText', raw); } // JSON 不完整时暂存原文
            }} placeholder='{"reasoningEffort":"high"}(透传给 API,留空不写入)' style={{ flex: 1, fontSize: 10 }} />
            {m.optionsText && !/^\s*\{.*\}\s*$/.test(m.optionsText) && <span style={{ color: 'var(--bad)', fontSize: 10 }}>JSON 不完整</span>}
          </div>
        </div>
      ))}
      <button className="btn btn-sm" onClick={() => set('models', [...models, { id: '', name: '', limit: { context: 0, output: 0 }, reasoning: false, options: {} }])}>
        <Icon name="plus" size={10} /> 手动添加模型
      </button>
    </div>
  );
}
