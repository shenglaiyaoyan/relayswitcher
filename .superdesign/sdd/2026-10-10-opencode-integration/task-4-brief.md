### Task 4: OpenCode 页面(Provider 管理 UI)

**Files:**
- Create: `src/pages/OpenCode.jsx`

**Interfaces:**
- Consumes: `window.rs.ocList` / `ocSave` / `ocRemove` / `ocFetchModels` / `ocReadConfig`
- Consumes: `window.rs.listRelays`(现有,拿中转站列表)

- [ ] **Step 1: 创建 OpenCode.jsx**

```javascript
'use strict';
import React, { useEffect, useState } from 'react';
import { Icon, Spinner, Toggle, Modal, Field } from '../components/ui.jsx';

const PROTOCOLS = [
  { value: 'message', label: 'Anthropic Messages', desc: '@ai-sdk/anthropic(/v1/messages)' },
  { value: 'chat', label: 'OpenAI Chat', desc: '@ai-sdk/openai-compatible(/v1/chat/completions)' },
  { value: 'responses', label: 'OpenAI Responses', desc: '@ai-sdk/openai(/v1/responses)' }
];

export default function OpenCode({ state, refresh, toast, goto }) {
  const [providers, setProviders] = useState([]);
  const [editing, setEditing] = useState(null); // null=关闭 {}=新建 {...}=编辑
  const [busy, setBusy] = useState(false);
  const [relayModels, setRelayModels] = useState(null); // /v1/models 拉取结果

  const load = async () => {
    try { setProviders(await window.rs.ocList()); } catch (e) { toast(e.message, 'bad'); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setBusy(true);
    try {
      const r = await window.rs.ocSave(editing);
      if (r.ok) {
        toast(`Provider「${editing.id}」已写入 ~/.config/opencode/opencode.json — 重启 opencode 生效`, 'ok');
        if (r.hasComments) toast('原配置文件含注释,写回后注释已丢失', 'warn');
        setEditing(null); await load();
      } else toast(r.error, 'bad');
    } finally { setBusy(false); }
  };

  const remove = async (id) => {
    const r = await window.rs.ocRemove(id);
    if (r.ok) { toast(`已移除 ${id}(备份已保留)`, 'ok'); await load(); }
    else toast(r.error, 'bad');
  };

  return (
    <div>
      {/* Provider 列表 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <div className="klabel"><Icon name="bolt" size={12} style={{ color: 'var(--gold)' }} /> OpenCode Providers</div>
          <button className="btn btn-sm btn-gold" onClick={() => setEditing({ id: '', name: '', protocol: 'chat', baseUrl: '', apiKey: '', models: [], defaultModel: '' })}>
            <Icon name="plus" size={11} /> 新建 Provider
          </button>
        </div>
        {providers.length === 0 && (
          <div className="muted" style={{ padding: '20px 0', textAlign: 'center' }}>
            尚无 provider — 从你的中转站库选一个站,RS 自动拉取模型清单并填入参数
          </div>
        )}
        {providers.map(p => (
          <div key={p.id} className="parse-preview" style={{ marginBottom: 8 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <b>{p.name || p.id}</b>
                <span className="badge" style={{ marginLeft: 8 }}>{p.protocol}</span>
                <span className="muted" style={{ marginLeft: 8, fontSize: 11 }}>{p.models.length} 模型</span>
                {p.defaultModel && <span className="muted" style={{ marginLeft: 8, fontSize: 11 }}>默认 {p.defaultModel}</span>}
              </div>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn btn-sm" onClick={() => setEditing(p)}>编辑</button>
                <button className="btn btn-sm" onClick={() => remove(p.id)}>移除</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 新建/编辑 Modal */}
      <Modal open={!!editing} width={720} onClose={() => setEditing(null)}
        footer={<>
          <button className="btn btn-sm" onClick={() => setEditing(null)}>取消</button>
          <button className="btn btn-sm btn-gold" disabled={busy} onClick={save}>
            {busy ? <><Spinner size={11} /> 写入中…</> : '写入 opencode.json'}
          </button>
        </>}>
        {editing && <ProviderForm data={editing} setData={setEditing}
          relays={state.relays || []} relayModels={relayModels}
          onFetchModels={async (relayId) => {
            setRelayModels(null);
            const r = await window.rs.ocFetchModels(relayId);
            if (r.ok) setRelayModels(r.models);
            else toast(r.error, 'warn');
          }} />}
      </Modal>
    </div>
  );
}

function ProviderForm({ data, setData, relays, relayModels, onFetchModels }) {
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label="中转站(选库或手写)">
        <select value={data.relayId || ''} onChange={e => {
          const r = relays.find(x => x.id === e.target.value);
          if (r) { set('relayId', r.id); set('baseUrl', r.baseUrl); set('name', r.name); set('id', r.name.toLowerCase().replace(/[^a-z0-9]/g, '-')); }
          else set('relayId', '');
        }}>
          <option value="">— 手写 —</option>
          {relays.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        {data.relayId && <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => onFetchModels(data.relayId)}>
          <Icon name="refresh" size={11} /> 拉 /v1/models
        </button>}
      </Field>
      <Field label="Base URL">
        <input type="text" value={data.baseUrl} onChange={e => set('baseUrl', e.target.value)} placeholder="https://api.example.com/v1" style={{ width: '100%' }} />
      </Field>
      <Field label="协议类型">
        <div className="row" style={{ gap: 8 }}>
          {PROTOCOLS.map(p => (
            <span key={p.value} className={'chip' + (data.protocol === p.value ? ' on' : '')}
              onClick={() => set('protocol', p.value)} title={p.desc}>{p.label}</span>
          ))}
        </div>
      </Field>
      <Field label="Provider ID">
        <input type="text" value={data.id} onChange={e => set('id', e.target.value)} placeholder="my-relay" style={{ width: 200 }} />
      </Field>
      <Field label="API Key(写入 auth.json,不进 opencode.json)">
        <input type="password" value={data.apiKey} onChange={e => set('apiKey', e.target.value)} style={{ width: '100%' }} />
      </Field>
      <ModelEntries data={data} setData={setData} relayModels={relayModels} />
      <Field label="默认模型">
        <select value={data.defaultModel} onChange={e => set('defaultModel', e.target.value)}>
          <option value="">— 不设默认 —</option>
          {data.models.map(m => <option key={m.id} value={`${data.id}/${m.id}`}>{data.id}/{m.id}</option>)}
        </select>
      </Field>
    </div>
  );
}

function ModelEntries({ data, setData, relayModels }) {
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));
  const toggleModel = (modelId) => {
    const exists = data.models.find(m => m.id === modelId);
    if (exists) set('models', data.models.filter(m => m.id !== modelId));
    else set('models', [...data.models, { id: modelId, name: modelId, limit: { context: 0, output: 0 }, reasoning: false, options: {} }]);
  };
  const updateModel = (modelId, field, value) => {
    set('models', data.models.map(m => m.id === modelId ? { ...m, [field]: value } : m));
  };
  return (
    <div>
      <div className="klabel">模型条目(勾选 / 手动添加)</div>
      {relayModels && (
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {relayModels.map(id => (
            <span key={id} className={'chip' + (data.models.find(m => m.id === id) ? ' on' : '')}
              onClick={() => toggleModel(id)}>{id}</span>
          ))}
        </div>
      )}
      {data.models.length === 0 && <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>从上面勾选,或在下方手动添加</div>}
      {data.models.map(m => (
        <div key={m.id} className="parse-preview" style={{ marginBottom: 8, padding: '8px 12px' }}>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <b style={{ fontSize: 12 }}>{m.id}</b>
            <input type="text" value={m.name} onChange={e => updateModel(m.id, 'name', e.target.value)}
              placeholder="显示名" style={{ width: 140, fontSize: 11 }} />
            <input type="number" value={m.limit.context} onChange={e => updateModel(m.id, 'limit', { ...m.limit, context: Number(e.target.value) })}
              placeholder="ctx" style={{ width: 90, fontSize: 11 }} />
            <input type="number" value={m.limit.output} onChange={e => updateModel(m.id, 'limit', { ...m.limit, output: Number(e.target.value) })}
              placeholder="out" style={{ width: 90, fontSize: 11 }} />
            <label className="muted" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={m.reasoning} onChange={e => updateModel(m.id, 'reasoning', e.target.checked)} /> 推理
            </label>
            <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => toggleModel(m.id)}>×</button>
          </div>
        </div>
      ))}
      <button className="btn btn-sm" onClick={() => set('models', [...data.models, { id: '', name: '', limit: { context: 0, output: 0 }, reasoning: false, options: {} }])}>
        <Icon name="plus" size={10} /> 手动添加模型
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Build + lint**

Run: `npx vite build && node lint-imports.js`
Expected: 无报错

- [ ] **Step 3: 冒烟(现有场景)+ 手动测试**

Run: `npm run smoke`
Expected: 39/39

- [ ] **Step 4: Commit**

```bash
git add src/pages/OpenCode.jsx
git commit -m "feat: OpenCode 页面 — Provider 管理 UI(列表+表单+模型勾选+协议三选一)"
```

---

