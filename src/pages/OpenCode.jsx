import React, { useEffect, useRef, useState } from 'react';
import { Icon, Confirm, Empty, fmtK } from '../components/ui.jsx';
import ProviderEditor, { protocolLabel } from './opencode/ProviderEditor.jsx';
import ModelEditor from './opencode/ModelEditor.jsx';
import { newProvider, newModel, updateModel } from './opencode/draft.mjs';
import { providerFetchTarget } from './opencode/draft.mjs';
import { setNavigationGuard } from './opencode/navigationGuard.js';

export default function OpenCode({ toast, goto }) {
  const [providers, setProviders] = useState([]);
  const [editing, setEditing] = useState(null);
  const [isNew, setIsNew] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [relayModels, setRelayModels] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [confirmDeleteModel, setConfirmDeleteModel] = useState(null);
  const [selectedModel, setSelectedModel] = useState(0);
  const [demoRows, setDemoRows] = useState(false);
  const [baseline, setBaseline] = useState('');
  const [pendingClose, setPendingClose] = useState(null);
  const dirty = !!editing && JSON.stringify(editing) !== baseline;
  const sessionRef = useRef(0);
  const editingRef = useRef(editing);
  const baselineRef = useRef(baseline);
  const busyRef = useRef(busy);
  const flushEffortRef = useRef(null);
  const flushInputsRef = useRef(() => {});
  const providerInputRef = useRef(null);
  editingRef.current = editing;
  baselineRef.current = baseline;
  useEffect(() => { busyRef.current = busy; }, [busy]);
  const currentDraft = () => {
    const inputs = flushInputsRef.current();
    const draft = flushEffortRef.current?.(inputs || editingRef.current) || inputs || editingRef.current;
    editingRef.current = draft;
    return draft;
  };
  useEffect(() => () => { sessionRef.current++; }, []);

  const load = async () => {
    try {
      const r = await window.rs.ocList() || {};
      setProviders(r.providers || []);
      if (r.imported > 0) toast(`已从配置文件导入 ${r.imported} 个现有 Provider(接管前原文件零改动)`, 'ok');
    } catch (e) { toast(e.message, 'bad'); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  useEffect(() => {
    const applyDemo = () => {
      const h = window.location.hash || '';
      if (!h.includes('demo-')) return;
      sessionRef.current++;
      setRelayModels(null); setProviders([]);
      const base = { ...newProvider(), id: 'my-relay', name: 'My Relay', baseUrl: 'https://api.example.com/v1' };
      const rows = h.includes('demo-rows') || h.includes('demo-dialog');
      if (rows) {
        base.models = [
          { ...newModel('claude-sonnet-4-5'), name: 'Sonnet 4.5', limit: { context: 200000, output: 64000 }, reasoning: true, attachment: true, effort: 'high', efforts: ['low', 'high', 'max'] },
          { ...newModel('gpt-4o'), name: 'GPT-4o', limit: { context: 128000, output: 16384 }, temperature: true }
        ];
        base.defaultModel = 'my-relay/claude-sonnet-4-5';
        setProviders([{ ...base, protocol: 'chat', relayId: undefined }]);
      }
      setDemoRows(rows && !h.includes('demo-dialog'));
      setIsNew(false); setEditing(base); setBaseline(JSON.stringify(base)); setSelectedModel(0);
    };
    applyDemo(); window.addEventListener('hashchange', applyDemo);
    return () => window.removeEventListener('hashchange', applyDemo);
  }, []);

  const openAdd = () => { sessionRef.current++; const p = newProvider(); setRelayModels(null); setIsNew(true); setEditing(p); setBaseline(JSON.stringify(p)); setSelectedModel(0); };
  const openEdit = p => { sessionRef.current++; setRelayModels(null); setIsNew(false); setEditing(p); setBaseline(JSON.stringify(p)); setSelectedModel(0); };
  const close = () => {
    sessionRef.current++;
    busyRef.current = false;
    setBusy(false); setFetching(false);
    setEditing(null); setBaseline(''); setRelayModels(null); setDemoRows(false);
  };
  const requestClose = (resume) => {
    currentDraft();
    if (busyRef.current) { toast('正在保存 Provider，请等待写入完成', 'warn'); return; }
    const draft = currentDraft();
    const isDirty = JSON.stringify(draft) !== baselineRef.current;
    if (!isDirty) { (resume || close)(); return; }
    setPendingClose(() => resume || close);
  };
  const requestCloseRef = useRef(requestClose);
  useEffect(() => { requestCloseRef.current = requestClose; });
  useEffect(() => {
    setNavigationGuard(editingRef.current ? resume => requestCloseRef.current(resume) : null);
    return () => setNavigationGuard(null);
  }, [!!editing]);

  const save = async draft => {
    currentDraft();
    if (busyRef.current) return;
    const session = sessionRef.current;
    busyRef.current = true;
    setBusy(true);
    try {
      const source = currentDraft();
      const payload = { ...source, models: (source.models || []).filter(m => m.id?.trim()) };
      const r = await window.rs.ocSave(payload);
      if (sessionRef.current !== session) return;
      if (r.ok) {
        toast(`Provider「${payload.id}」已写入 opencode 配置 — 重启 opencode 生效`, 'ok');
        if (r.hasComments) toast('原配置文件含注释,写回后注释已丢失', 'warn');
        close(); await load();
      } else toast(r.error, 'bad');
    } catch (e) {
      if (sessionRef.current === session) toast(e.message, 'bad');
    } finally {
      if (sessionRef.current === session) { busyRef.current = false; setBusy(false); }
    }
  };

  const remove = async () => {
    const id = confirmDel; setConfirmDel(null);
    const r = await window.rs.ocRemove(id);
    if (r.ok) { toast(`已移除 ${id}(备份已保留)`, 'ok'); await load(); }
    else toast(r.error, 'bad');
  };

  const fetchModels = async () => {
    currentDraft();
    if (fetching) return;
    const session = sessionRef.current;
    setFetching(true); setRelayModels(null);
    try {
      const r = await window.rs.ocFetchModels(providerFetchTarget(editingRef.current));
      if (sessionRef.current !== session) return;
      if (r.ok) setRelayModels(r.models); else toast(r.error, 'warn');
    } catch (e) {
      if (sessionRef.current === session) toast(e.message, 'warn');
    } finally {
      if (sessionRef.current === session) setFetching(false);
    }
  };

  const toggleModel = id => {
    const draft = currentDraft();
    const index = draft.models.findIndex(m => m.id === id);
    const models = index >= 0 ? draft.models.filter((_, i) => i !== index) : [...draft.models, newModel(id)];
    setEditing({ ...draft, models });
    setSelectedModel(index >= 0 ? 0 : draft.models.length);
  };

  if (editing && !demoRows) {
    const model = editing.models[selectedModel];
    return <ProviderEditor data={editing} setData={setEditing} isNew={isNew} dirty={dirty} busy={busy}
      fetching={fetching} relayModels={relayModels} onFetchModels={fetchModels} onSave={save}
      registerFlush={() => flushEffortRef.current?.(editingRef.current)}
      registerInputFlush={fn => { flushInputsRef.current = fn || (() => {}); }}
      registerModelInput={fn => { providerInputRef.current = fn; }}
      getDraft={() => editingRef.current} editingRef={editingRef}
      onCancel={() => requestClose()}>
      <section className="oc-panel oc-model-workspace">
        <div className="oc-model-sidebar"><div className="oc-section-head"><h3>模型清单 <span>{editing.models.length}</span></h3>
          <button className="oc-add-model" onClick={() => { currentDraft(); setEditing(d => ({ ...d, models: [...d.models, newModel()] })); setSelectedModel(editing.models.length); }}><Icon name="plus" size={11} /> 添加模型</button></div>
          {fetching && <div className="oc-fetch-status"><Icon name="refresh" size={11} /> 拉取模型中…</div>}
          {!fetching && relayModels?.length > 0 && <div className="oc-fetched-models">{relayModels.map(id =>
            <button type="button" key={id} className={'chip' + (editing.models.some(m => m.id === id) ? ' on' : '')} onClick={() => toggleModel(id)}>{id}</button>)}</div>}
          {editing.models.map((m, i) => <button type="button" key={i} className={'oc-model-choice' + (i === selectedModel ? ' on' : '')} onClick={() => { currentDraft(); setSelectedModel(i); }}>
            <span className="mono">{m.id || '(未命名)'}</span><small>{m.name || '未设置名称'}{m.limit?.context ? ` · ${fmtK(m.limit.context)} ctx` : ''}{m.effort ? ` · ${m.effort}` : ''}</small></button>)}
          {!editing.models.length && <p className="oc-empty-models">手动添加模型，或填写连接信息后拉取。</p>}
        </div>
        {model ? <ModelEditor key={selectedModel} model={model} modelIndex={selectedModel} busy={busy}
          registerFlush={fn => { flushEffortRef.current = fn; }}
          registerInput={(field, fn) => providerInputRef.current?.(field, fn)}
          onChange={patch => setEditing(d => updateModel(d, selectedModel, patch))}
          onDelete={() => { currentDraft(); setConfirmDeleteModel(selectedModel); }} /> :
          <div className="oc-no-model"><Empty icon="layers" title="先添加一个模型" hint="参数将在同一页面编辑，随 Provider 统一保存。" /></div>}
      </section>
      <Confirm open={!!pendingClose} danger title="放弃未保存的修改"
        message="Provider 或模型参数尚未保存，确定放弃本次修改吗？"
        confirmLabel="放弃修改" onCancel={() => setPendingClose(null)} onConfirm={() => {
          const resume = pendingClose; setPendingClose(null); close(); resume();
        }} />
      <Confirm open={confirmDeleteModel !== null} danger title="删除模型" message="从当前 Provider 草稿删除这个模型？最终保存前仍可取消。"
        confirmLabel="删除" onCancel={() => setConfirmDeleteModel(null)} onConfirm={() => {
          setEditing(d => ({ ...d, models: d.models.filter((_, i) => i !== confirmDeleteModel) }));
          setSelectedModel(0); setConfirmDeleteModel(null);
        }} />
    </ProviderEditor>;
  }

  return <div>
    <div className="page-title"><h1>OpenCode</h1><span className="sub">Providers</span><span className="spacer" />
      <button className="header-icon-btn" title="OpenCode 专属设置" onClick={() => goto?.('settings-opencode')}><Icon name="settings" size={14} /></button></div>
    <section className="oc-provider-directory">
      <div className="oc-directory-head"><div><h2>Provider 列表</h2><p>手动填写连接与标识；Provider 和模型在同一页统一保存。</p></div>
        <div className="oc-directory-tools"><span>{providers.length} 个 Provider · {providers.reduce((n, p) => n + (p.models || []).length, 0)} 个模型</span>
          <button className="btn btn-sm btn-gold" onClick={openAdd}><Icon name="plus" size={11} /> 新建 Provider</button></div></div>
      {!providers.length && <Empty icon="bolt" title="尚无 Provider" hint="手动填写 Base URL / API Key 后拉取模型清单"
        action={<button className="btn btn-gold btn-sm" style={{ marginTop: 8 }} onClick={openAdd}><Icon name="plus" size={12} /> 新建 Provider</button>} />}
      {!!providers.length && <div className="oc-provider-table"><div className="oc-provider-header"><span>名称 / Provider ID</span><span>协议</span><span>模型</span><span>默认模型</span><span>操作</span></div>
        {providers.map(p => <div className="oc-provider-row" key={p.id}>
          <div className="oc-provider-identity"><b>{p.name || p.id}</b><span className="mono">{p.id}</span></div>
          <span className="badge">{protocolLabel(p.protocol)}</span><span className="oc-model-count">{p.models?.length || 0} 个模型</span>
          <span className="mono oc-provider-default" title={p.defaultModel}>{p.defaultModel || '未设置默认模型'}</span>
          <div className="oc-provider-actions"><button className="btn btn-sm" onClick={() => openEdit(p)}>编辑</button>
            <button className="btn btn-sm" onClick={() => setConfirmDel(p.id)}>移除</button></div>
        </div>)}</div>}
    </section>
    <Confirm open={!!confirmDel} danger title="移除 Provider"
      message={<span>确定移除 <b style={{ color: 'var(--txt-1)' }}>{confirmDel}</b> 吗?将同步清理 opencode 配置文件与 auth.json 中的对应区块(写前已自动备份)。</span>}
      confirmLabel="移除" onCancel={() => setConfirmDel(null)} onConfirm={remove} />
  </div>;
}
