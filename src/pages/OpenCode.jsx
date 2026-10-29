import React, { useEffect, useRef, useState } from 'react';
import { Icon, Confirm, Empty } from '../components/ui.jsx';
import ProviderEditor, { protocolLabel } from './opencode/ProviderEditor.jsx';
import ModelEditor from './opencode/ModelEditor.jsx';
import ModelTable, { AUTO } from './opencode/ModelTable.jsx';
import FetchPopover from './opencode/FetchPopover.jsx';
import { newProvider, newModel, updateModel, normalizeDefaultModel, renameModelDefault } from './opencode/draft.mjs';
import { providerFetchTarget } from './opencode/draft.mjs';
import { setNavigationGuard } from './opencode/navigationGuard.js';
import { applyTemplate, matchTemplate, resolveTemplates, templateFromModel } from './opencode/templates.mjs';

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
  const [templates, setTemplates] = useState(() => resolveTemplates(null));
  const [query, setQuery] = useState('');
  const [batch, setBatch] = useState(false);
  const [fetchOpen, setFetchOpen] = useState(false);
  const [checked, setChecked] = useState(() => new Set());
  const [batchTemplate, setBatchTemplate] = useState(AUTO);
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
  const loadTemplates = async () => {
    try { setTemplates(resolveTemplates(await window.rs.ocTemplatesGet?.())); } catch { /* 回退内置 */ }
  };
  useEffect(() => { loadTemplates(); }, []);
  const saveAsTemplate = async model => {
    const t = templateFromModel(model, 'custom-' + Date.now().toString(36));
    const next = [t, ...templates];
    const r = await window.rs.ocTemplatesSave(next);
    if (r?.ok) { setTemplates(next); toast(`已存为自定义模板「${t.name}」，可在 OpenCode 专属设置中修改匹配规则`, 'ok'); }
    else toast(r?.error || '保存模板失败', 'bad');
  };

  useEffect(() => {
    const applyDemo = () => {
      const h = window.location.hash || '';
      if (!h.includes('demo-')) return;
      sessionRef.current++;
      setRelayModels(null); setProviders([]);
      const base = { ...newProvider(), id: 'my-relay', name: 'My Relay', baseUrl: 'https://api.example.com/v1' };
      const rows = h.includes('demo-rows') || h.includes('demo-dialog');
      if (rows) {
        const builtins = resolveTemplates(null);
        const opus = applyTemplate({ ...newModel('claude-opus-5-5'), name: 'Opus 5.5' }, builtins[0], Date.now());
        base.models = [
          { ...opus, limit: { ...opus.limit, output: 64000 } },
          applyTemplate({ ...newModel('claude-sonnet-5-5'), name: 'Sonnet 5.5' }, builtins[0], Date.now()),
          applyTemplate({ ...newModel('gpt-6.1-sol'), name: 'GPT 6.1 Sol' }, builtins[1], Date.now()),
          { ...newModel('acme-internal-x'), name: 'Internal X' }
        ];
        base.defaultModel = 'my-relay/claude-opus-5-5';
        if (h.includes('demo-dialog')) {
          setRelayModels(['claude-opus-5-5', 'claude-sonnet-5-5', 'gpt-6.1-sol', 'gemini-4-argon', 'deepseek-v4-pro', 'acme-internal-x']);
          setBatch(h.includes('batch'));
          setChecked(new Set(h.includes('batch') ? [0, 2] : []));
          setFetchOpen(h.includes('fetch'));
        }
        setProviders([{ ...base, protocol: 'chat', relayId: undefined }]);
      }
      setDemoRows(rows && !h.includes('demo-dialog'));
      setIsNew(false); setEditing(base); setBaseline(JSON.stringify(base)); setSelectedModel(0);
    };
    applyDemo(); window.addEventListener('hashchange', applyDemo);
    return () => window.removeEventListener('hashchange', applyDemo);
  }, []);

  const resetListUi = () => { setQuery(''); setBatch(false); setChecked(new Set()); setBatchTemplate(AUTO); setFetchOpen(false); };
  const openAdd = () => { sessionRef.current++; resetListUi(); const p = newProvider(); setRelayModels(null); setIsNew(true); setEditing(p); setBaseline(JSON.stringify(p)); setSelectedModel(0); };
  const openEdit = p => { sessionRef.current++; resetListUi(); setRelayModels(null); setIsNew(false); setEditing(p); setBaseline(JSON.stringify(p)); setSelectedModel(0); };
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
      if (!source.id?.trim()) { toast('请先填写 Provider ID', 'warn'); return; }
      const base = JSON.parse(baselineRef.current || '{}');
      const payload = normalizeDefaultModel({ ...source, models: (source.models || []).filter(m => m.id?.trim()) });
      if (!payload.defaultModel && (base.defaultModel || source.defaultModel)) payload.clearDefaultModel = true;
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
      if (r.ok) { setRelayModels(r.models); setFetchOpen(true); } else toast(r.error, 'warn');
    } catch (e) {
      if (sessionRef.current === session) toast(e.message, 'warn');
    } finally {
      if (sessionRef.current === session) setFetching(false);
    }
  };

  const addModels = ids => {
    const draft = currentDraft();
    const known = new Set(draft.models.map(m => m.id));
    const added = ids.filter(id => !known.has(id)).map(id => {
      const matched = matchTemplate(templates, id);
      return matched ? applyTemplate(newModel(id), matched) : newModel(id);
    });
    if (!added.length) return;
    setEditing({ ...draft, models: [...draft.models, ...added] });
    setFetchOpen(false);
    if (!batch) setSelectedModel(draft.models.length);
    toast(`已加入 ${added.length} 个模型` + (added.some(m => !m.template) ? '，未匹配模板的请手动填写参数' : '，已套用匹配模板'), 'ok');
  };
  const addManual = () => {
    const draft = currentDraft();
    setEditing({ ...draft, models: [...draft.models, newModel()] });
    setBatch(false); setChecked(new Set());
    setSelectedModel(draft.models.length);
  };
  const toggleBatch = () => {
    currentDraft();
    setChecked(new Set());
    setSelectedModel(-1);
    setBatch(b => !b);
  };
  const applyBatch = () => {
    const draft = currentDraft();
    let applied = 0, skipped = 0;
    const models = draft.models.map((m, i) => {
      if (!checked.has(i)) return m;
      const t = batchTemplate === AUTO ? matchTemplate(templates, m.id) : templates.find(x => x.id === batchTemplate);
      if (!t) { skipped++; return m; }
      applied++;
      return applyTemplate(m, t);
    });
    setEditing({ ...draft, models });
    setChecked(new Set());
    toast(`已套用到 ${applied} 个模型` + (skipped ? `，${skipped} 个未匹配到模板已跳过` : ''), applied ? 'ok' : 'warn');
  };

  if (editing && !demoRows) {
    const model = batch ? null : editing.models[selectedModel];
    const defaultModelId = editing.defaultModel && editing.id && editing.defaultModel.startsWith(editing.id + '/')
      ? editing.defaultModel.slice(editing.id.length + 1) : '';
    const rows = editing.models.map((m, i) => ({ m, i, t: m.template
      ? templates.find(x => x.id === m.template.id) || { id: m.template.id, name: m.template.name }
      : matchTemplate(templates, m.id) }));
    const q = query.trim().toLowerCase();
    const visibleRows = rows.filter(({ m }) =>
      !q || (m.id || '').toLowerCase().includes(q) || (m.name || '').toLowerCase().includes(q));
    const fetchPopover = fetchOpen && relayModels ? <FetchPopover ids={relayModels}
      existing={new Set(editing.models.map(m => m.id))} templates={templates}
      onAdd={addModels} onClose={() => setFetchOpen(false)} /> : null;
    return <ProviderEditor data={editing} setData={setEditing} isNew={isNew} dirty={dirty} busy={busy}
      fetching={fetching} onFetchModels={fetchModels} onSave={save} fetchPopover={fetchPopover}
      registerFlush={() => flushEffortRef.current?.(editingRef.current)}
      registerInputFlush={fn => { flushInputsRef.current = fn || (() => {}); }}
      registerModelInput={fn => { providerInputRef.current = fn; }}
      getDraft={() => editingRef.current} editingRef={editingRef}
      onCancel={() => requestClose()}>
      <div className={'oce-split' + (model ? ' with-drawer' : '')}>
        <ModelTable rows={visibleRows} total={editing.models.length} query={query} setQuery={setQuery}
          batch={batch} onToggleBatch={toggleBatch} checked={checked} setChecked={setChecked}
          selected={model ? selectedModel : -1} onSelect={i => { currentDraft(); setSelectedModel(i); }}
          onAddManual={addManual} defaultModelId={defaultModelId} templates={templates}
          batchTemplate={batchTemplate} setBatchTemplate={setBatchTemplate} onApplyBatch={applyBatch} busy={busy} />
        {model && <ModelEditor key={selectedModel} model={model} modelIndex={selectedModel} busy={busy}
          registerFlush={fn => { flushEffortRef.current = fn; }}
          registerInput={(field, fn) => providerInputRef.current?.(field, fn)}
          onChange={patch => setEditing(d => {
            const next = updateModel(d, selectedModel, patch);
            return patch.id !== undefined ? renameModelDefault(next, d.models[selectedModel]?.id, patch.id) : next;
          })}
          onDelete={() => { currentDraft(); setConfirmDeleteModel(selectedModel); }}
          onClose={() => { currentDraft(); setSelectedModel(-1); }}
          isDefault={!!model.id && model.id === defaultModelId}
          onToggleDefault={() => setEditing(d => ({ ...d,
            defaultModel: model.id === defaultModelId ? '' : `${d.id}/${model.id}` }))}
          templates={templates} onSaveAsTemplate={saveAsTemplate} />}
      </div>
      <Confirm open={!!pendingClose} danger title="放弃未保存的修改"
        message="Provider 或模型参数尚未保存，确定放弃本次修改吗？"
        confirmLabel="放弃修改" onCancel={() => setPendingClose(null)} onConfirm={() => {
          const resume = pendingClose; setPendingClose(null); close(); resume();
        }} />
      <Confirm open={confirmDeleteModel !== null} danger title="删除模型" message="从当前 Provider 草稿删除这个模型？最终保存前仍可取消。"
        confirmLabel="删除" onCancel={() => setConfirmDeleteModel(null)} onConfirm={() => {
          setEditing(d => ({ ...d, models: d.models.filter((_, i) => i !== confirmDeleteModel) })); setChecked(new Set());
          setSelectedModel(-1); setConfirmDeleteModel(null);
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
