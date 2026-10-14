'use strict';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, Spinner, Toggle, Select, Modal, Confirm, Empty, fmtK } from '../components/ui.jsx';

const PROTOCOLS = [
  { value: 'message', label: 'Anthropic Messages', desc: '@ai-sdk/anthropic(/v1/messages)' },
  { value: 'chat', label: 'OpenAI Chat', desc: '@ai-sdk/openai-compatible(/v1/chat/completions)' },
  { value: 'responses', label: 'OpenAI Responses', desc: '@ai-sdk/openai(/v1/responses)' }
];

const slugify = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/^-+|-+$/g, '');
const protocolLabel = (v) => (PROTOCOLS.find(p => p.value === v) || {}).label || v;
const NEW_PROVIDER = () => ({ id: '', name: '', protocol: 'chat', baseUrl: '', apiKey: '', relayId: '', models: [], defaultModel: '' });

// RS 推荐配置(「跟随推荐配置」开关 ON 时套用;设计稿 byok ffc4ad1b + ZCode 参照)
const RECOMMENDED = (id) => ({
  name: id || '',
  limit: { context: 0, output: 0 },
  reasoning: false, attachment: false, tool_call: true, temperature: false,
  modalities: { input: ['text'], output: ['text'] },
  efforts: ['low', 'medium', 'high', 'max'],
  effort: '',
  options: {}
});
const NEW_MODEL = (id) => ({ id: id || '', ...RECOMMENDED(id) });

export default function OpenCode({ state, toast, goto }) {
  const [providers, setProviders] = useState([]);
  const [editing, setEditing] = useState(null); // null=关闭,{...}=新建/编辑(isNew 区分)
  const [isNew, setIsNew] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [relayModels, setRelayModels] = useState(null); // /v1/models 拉取结果(null=未拉)
  const [confirmDel, setConfirmDel] = useState(null);
  const [demoDialog, setDemoDialog] = useState(false); // 截图管线:强制打开首个模型的编辑弹窗

  const load = async () => {
    try { setProviders(await window.rs.ocList()); } catch (e) { toast(e.message, 'bad'); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  // 截图/设计管线专用:#opencode-demo-* 强制展示(正常运行不可达)
  useEffect(() => {
    const applyDemo = () => {
      const h = window.location.hash || '';
      if (!h.includes('demo-')) return;
      setRelayModels(null); setIsNew(true); setProviders([]);
      const base = { ...NEW_PROVIDER(), id: 'my-relay', name: 'My Relay', baseUrl: 'https://api.example.com/v1' };
      if (h.includes('demo-rows') || h.includes('demo-dialog')) {
        base.models = [
          { ...NEW_MODEL('claude-sonnet-4-5'), name: 'Sonnet 4.5', limit: { context: 200000, output: 64000 }, reasoning: true, attachment: true, effort: 'high' },
          { ...NEW_MODEL('gpt-4o'), name: 'GPT-4o', limit: { context: 128000, output: 16384 }, temperature: true, effort: '' }
        ];
        base.defaultModel = 'my-relay/claude-sonnet-4-5';
      }
      setDemoDialog(h.includes('demo-dialog'));
      setEditing(base);
    };
    applyDemo();
    window.addEventListener('hashchange', applyDemo);
    return () => window.removeEventListener('hashchange', applyDemo);
  }, []);

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

      {/* 新建/编辑 Modal(第一层:只管连接 + 模型清单;参数在嵌套「编辑模型」弹窗) */}
      <Modal open={!!editing} width={680}
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
          onFetchModels={fetchModels} isNew={isNew} autoDialog={demoDialog} />}
      </Modal>

      <Confirm open={!!confirmDel} danger title="移除 Provider"
        message={<span>确定移除 <b style={{ color: 'var(--txt-1)' }}>{confirmDel}</b> 吗?将同步清理 opencode.json 与 auth.json 中的对应区块(写前已自动备份)。</span>}
        confirmLabel="移除" onCancel={() => setConfirmDel(null)} onConfirm={remove} />
    </div>
  );
}

/* ---------------- 表单分组外壳(设计稿:11px 金色系大写小字 + 细线图标) ---------------- */
function Group({ icon, label, hint, actions, children }) {
  return (
    <section>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <div className="oc-group-label">
          <Icon name={icon} size={12} /> {label}
          {hint && <span className="oc-group-hint">{hint}</span>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function ProviderForm({ data, setData, relays, relayModels, fetching, onFetchModels, isNew, autoDialog }) {
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));
  const models = data.models || [];
  const [dlg, setDlg] = useState(null); // { i: 下标|null, m: 草稿, isNew }
  const autoDone = useRef(false);

  // 截图管线:#opencode-demo-dialog 强制打开首个模型的编辑弹窗
  useEffect(() => {
    if (autoDialog && !autoDone.current && models.length > 0) {
      autoDone.current = true;
      setDlg({ i: 0, m: { ...models[0] }, isNew: false });
    }
  }, [autoDialog, models]);

  // 从库里选中转站:一键填充 baseUrl/name(+首次自动补 id),并自动拉模型清单
  const pickRelay = (v) => {
    const r = relays.find(x => x.id === v);
    if (r) {
      set('relayId', r.id); set('baseUrl', r.baseUrl); set('name', r.name);
      if (!data.id) { const slug = slugify(r.name); if (slug) set('id', slug); }
      onFetchModels(r.id);
    } else set('relayId', '');
  };

  const openModel = (i) => setDlg({ i, m: { ...models[i] }, isNew: false });
  const addModel = () => setDlg({ i: null, m: NEW_MODEL(''), isNew: true });
  const saveModel = (m) => {
    set('models', dlg.i == null ? [...models, m] : models.map((x, j) => j === dlg.i ? m : x));
    setDlg(null);
  };
  const deleteModel = () => { set('models', models.filter((_, j) => j !== dlg.i)); setDlg(null); };
  const removeModelRow = (i) => set('models', models.filter((_, j) => j !== i));

  const toggleModel = (modelId) => {
    const exists = models.find(m => m.id === modelId);
    if (exists) set('models', models.filter(m => m.id !== modelId));
    else set('models', [...models, NEW_MODEL(modelId)]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* 接入 */}
      <Group icon="plug" label="接入">
        <div className="row" style={{ gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Select style={{ width: '100%' }} value={data.relayId || ''} onChange={pickRelay}
              placeholder="— 手写 —" emptyText="中转站库为空 — 去「中转站」页添加"
              options={[{ value: '', label: '手写(清空关联)' }].concat(
                relays.map(r => ({ value: r.id, label: r.name, desc: r.baseUrl })))} />
          </div>
          {data.relayId && (
            <button className="oc-link-btn" style={{ marginBottom: 2, flexShrink: 0 }} disabled={fetching} onClick={() => onFetchModels(data.relayId)}>
              {fetching ? <Spinner size={11} /> : <Icon name="refresh" size={11} />} 从 /v1/models 拉取
            </button>
          )}
        </div>
        <div className="row" style={{ gap: 12, marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="oc-flabel">Base URL <span className="oc-fhint">填到 /v1 为止</span></div>
            <input type="text" className="mono" value={data.baseUrl} onChange={e => set('baseUrl', e.target.value)} placeholder="https://api.example.com/v1" style={{ width: '100%' }} />
          </div>
          <div style={{ flexShrink: 0 }}>
            <div className="oc-flabel">协议类型</div>
            <div className="row" style={{ gap: 6 }}>
              {PROTOCOLS.map(p => (
                <span key={p.value} className={'chip' + (data.protocol === p.value ? ' on' : '')}
                  onClick={() => set('protocol', p.value)} title={p.desc}>{p.label}</span>
              ))}
            </div>
          </div>
        </div>
        <div>
          <div className="oc-flabel">API Key <span className="oc-fhint">{isNew ? '仅写入 auth.json,不进 opencode.json' : '留空 = 保持不变'}</span></div>
          <input type="password" className="mono" value={data.apiKey} onChange={e => set('apiKey', e.target.value)} placeholder="sk-…" style={{ width: '100%' }} />
        </div>
      </Group>

      {/* 标识 */}
      <Group icon="tag" label="标识">
        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="oc-flabel">Provider ID <span className="oc-fhint">opencode.json 里 provider 的键名</span></div>
            <input type="text" className="mono" value={data.id} onChange={e => set('id', e.target.value)} placeholder="my-relay" style={{ width: '100%' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="oc-flabel">Provider 名称 <span className="oc-fhint">显示用</span></div>
            <input type="text" value={data.name} onChange={e => set('name', e.target.value)} placeholder="My Relay" style={{ width: '100%' }} />
          </div>
        </div>
      </Group>

      {/* 模型清单(参数编辑在嵌套「编辑模型」弹窗) */}
      <Group icon="layers" label="模型清单" hint="点击行编辑参数"
        actions={<div className="row" style={{ gap: 12 }}>
          <button className="oc-add-model" onClick={addModel}><Icon name="plus" size={11} /> 添加模型</button>
        </div>}>
        {fetching && <div className="muted row" style={{ gap: 6, marginBottom: 8, fontSize: 12 }}><Spinner size={11} /> 拉取模型清单中…</div>}
        {!fetching && relayModels && relayModels.length > 0 && (
          <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {relayModels.map(id => (
              <span key={id} className={'chip' + (models.find(m => m.id === id) ? ' on' : '')}
                onClick={() => toggleModel(id)}>{id}</span>
            ))}
          </div>
        )}
        {!fetching && relayModels && relayModels.length === 0 && (
          <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>该站 /v1/models 返回空,点右上「添加模型」手动加</div>
        )}
        {!fetching && !relayModels && models.length === 0 && (
          <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>选中中转站后自动拉取清单,或点右上「添加模型」</div>
        )}
        {models.length > 0 && (
          <div className="oc-model-list">
            {models.map((m, i) => (
              <div key={i} className="oc-model-row" onClick={() => openModel(i)}>
                <span className="mono oc-model-id">{m.id || '(未命名)'}</span>
                <span className="oc-model-name">{m.name || ''}</span>
                {!!m.limit?.context && <span className="mono oc-model-badge">{fmtK(m.limit.context)} ctx</span>}
                {m.effort && <span className="mono oc-model-badge">{m.effort}</span>}
                <span style={{ flex: 1 }} />
                <button className="ghost-ibtn" title="编辑模型" onClick={(e) => { e.stopPropagation(); openModel(i); }}>
                  <Icon name="edit" size={13} />
                </button>
                <button className="ghost-ibtn danger" title="移除该模型" onClick={(e) => { e.stopPropagation(); removeModelRow(i); }}>
                  <Icon name="x" size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Group>

      {/* 默认模型 */}
      <Group icon="star" label="默认模型">
        <Select style={{ width: '100%' }} value={data.defaultModel || ''} onChange={v => set('defaultModel', v)}
          placeholder="不设默认" emptyText="先在上方添加模型"
          options={models.filter(m => m.id).map(m => ({ value: `${data.id}/${m.id}`, label: `${data.id}/${m.id}` }))} />
      </Group>

      {/* 第二层:编辑模型弹窗(portal 挂 body,叠于主 Modal 之上) */}
      {dlg && createPortal(
        <ModelDialog draft={dlg.m} isNew={dlg.isNew}
          onSave={saveModel} onDelete={deleteModel} onClose={() => setDlg(null)} />,
        document.body)}
    </div>
  );
}

/* ---------------- 第二层:编辑模型弹窗(设计稿 byok ffc4ad1b) ---------------- */
function ModelDialog({ draft, isNew, onSave, onDelete, onClose }) {
  const [m, setM] = useState(draft);
  const [follow, setFollow] = useState(true); // 跟随推荐配置:ON=字段用推荐值(禁改)
  const [adding, setAdding] = useState(false); // 新增档位的内联输入态
  const [newEffort, setNewEffort] = useState('');
  const set = (k, v) => setM(d => ({ ...d, [k]: v }));
  const recommended = RECOMMENDED(m.id);
  // 展示/保存用的有效值:follow=ON 时套推荐(id 始终用草稿的)
  const eff = follow ? { ...recommended, id: m.id } : m;

  const commitModel = () => onSave(follow ? { ...m, ...recommended, id: m.id } : m);

  const removeEffort = (e) => {
    const next = m.efforts.filter(x => x !== e);
    set('efforts', next);
    if (m.effort === e) set('effort', '');
  };
  const commitNewEffort = () => {
    const v = newEffort.trim();
    if (v && !m.efforts.includes(v)) {
      set('efforts', [...m.efforts, v]);
      if (!follow) set('effort', v);
      else { setFollow(false); set('effort', v); } // 选中新档位 = 脱离推荐
    }
    setNewEffort(''); setAdding(false);
  };

  const body = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {follow && (
        <div className="oc-follow-bar">
          <Icon name="check" size={14} /> 已应用推荐配置 · 关闭开关可自定义全部字段
        </div>
      )}
      {/* 基本 */}
      <Group icon="box" label="基本">
        <div className="row" style={{ gap: 12, marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="oc-flabel">模型 ID</div>
            <input type="text" className={'mono' + (follow ? ' oc-ro' : '')} value={m.id} onChange={e => set('id', e.target.value)} placeholder="model-id" style={{ width: '100%' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="oc-flabel">显示名</div>
            <input type="text" className={follow ? ' oc-ro' : ''} value={eff.name} disabled={follow}
              onChange={e => set('name', e.target.value)} placeholder="显示名" style={{ width: '100%' }} />
          </div>
        </div>
        <div className="row" style={{ gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="oc-flabel">上下文窗口 <span className="oc-fhint">0 = 不写入</span></div>
            <input type="number" className={'mono' + (follow ? ' oc-ro' : '')} value={eff.limit.context} disabled={follow}
              onChange={e => set('limit', { ...eff.limit, context: Number(e.target.value) })} placeholder="0" style={{ width: '100%' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="oc-flabel">最大输出 <span className="oc-fhint">0 = 不写入</span></div>
            <input type="number" className={'mono' + (follow ? ' oc-ro' : '')} value={eff.limit.output} disabled={follow}
              onChange={e => set('limit', { ...eff.limit, output: Number(e.target.value) })} placeholder="0" style={{ width: '100%' }} />
          </div>
        </div>
      </Group>
      {/* 能力 */}
      <Group icon="sparkles" label="能力">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 12 }}>
          {[['reasoning', '推理'], ['attachment', '附件'], ['tool_call', '工具'], ['temperature', 'Temp']].map(([f, label]) => (
            <div key={f} className="oc-cap-cell" onClick={() => follow ? undefined : set(f, !eff[f])}
              style={follow ? { opacity: 0.7, cursor: 'default' } : undefined}>
              <span>{label}</span>
              <Toggle on={!!eff[f]} onChange={(v) => { if (!follow) set(f, v); }} />
            </div>
          ))}
        </div>
        {[['input', '输入'], ['output', '输出']].map(([dir, label]) => (
          <div key={dir} className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <span className="muted" style={{ fontSize: 11, width: 52, flexShrink: 0 }}>{label}模态</span>
            {['text', 'image', 'audio', 'video', 'pdf'].map(mod => {
              const on = ((eff.modalities || {})[dir] || []).includes(mod);
              return (
                <span key={mod} className={'chip' + (on ? ' on' : '')} style={{ height: 24, fontSize: 10.5, padding: '0 10px', lineHeight: '22px' }}
                  onClick={() => {
                    if (follow) return;
                    const cur = (eff.modalities || {})[dir] || [];
                    set('modalities', { ...(eff.modalities || {}), [dir]: cur.includes(mod) ? cur.filter(x => x !== mod) : [...cur, mod] });
                  }}>{mod}</span>
              );
            })}
          </div>
        ))}
        {/* 思考强度档位卡片(设计稿:卡片可增删,选中写入 options.reasoningEffort) */}
        <div className="oc-flabel" style={{ marginBottom: 6 }}>思考强度档位 <span className="oc-fhint">选中档位将写入 options.reasoningEffort</span></div>
        <div className="oc-efforts">
          {(eff.efforts || []).map(e => (
            <span key={e} className={'oc-effort-card' + (eff.effort === e ? ' on' : '')}
              style={follow ? { opacity: 0.7 } : undefined}
              onClick={() => { if (!follow) set('effort', eff.effort === e ? '' : e); }}>
              <span className="mono">{e}</span>
              {!follow && (
                <button className="oc-effort-x" title="删除该档位"
                  onClick={(ev) => { ev.stopPropagation(); removeEffort(e); }}>
                  <Icon name="x" size={11} />
                </button>
              )}
            </span>
          ))}
          {!follow && !adding && (
            <span className="oc-effort-add" onClick={() => setAdding(true)}>
              <Icon name="plus" size={11} /> 新增档位
            </span>
          )}
          {!follow && adding && (
            <span className="oc-effort-card adding">
              <input autoFocus className="mono" value={newEffort} onChange={e => setNewEffort(e.target.value)}
                onKeyDown={(ev) => { if (ev.key === 'Enter') commitNewEffort(); if (ev.key === 'Escape') { setNewEffort(''); setAdding(false); } }}
                onBlur={commitNewEffort} placeholder="ultra" style={{ width: 64, fontSize: 11 }} />
            </span>
          )}
        </div>
      </Group>
    </div>
  );

  return (
    <Modal open width={640}
      title={<><span className="playfair" style={{ fontSize: 15 }}>{isNew ? '添加模型' : '编辑模型'}</span>
        {m.id && <span className="mono oc-model-id-badge">{m.id}</span>}</>}
      onClose={onClose}
      footer={<>
        {!isNew && <button className="oc-del-model" onClick={onDelete}><Icon name="trash" size={13} /> 删除模型</button>}
        <span style={{ flex: 1 }} />
        <div className="row" style={{ gap: 8, alignItems: 'center', marginRight: 12 }}>
          <span className="muted" style={{ fontSize: 12 }}>跟随推荐配置</span>
          <Toggle on={follow} onChange={setFollow} />
        </div>
        <button className="btn btn-sm" onClick={onClose}>取消</button>
        <button className="btn btn-sm btn-gold" disabled={!m.id?.trim()} onClick={commitModel}>保存模型</button>
      </>}>
      {body}
    </Modal>
  );
}
