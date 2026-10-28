import React, { useCallback, useEffect, useRef } from 'react';
import { Icon, Spinner, Select } from '../../components/ui.jsx';
import { providerFetchTarget, updateModel } from './draft.mjs';
import { DraftTextInput } from './fields.jsx';

export const PROTOCOLS = [
  { value: 'message', label: 'Anthropic Messages', desc: '@ai-sdk/anthropic(/v1/messages)' },
  { value: 'chat', label: 'OpenAI Chat', desc: '@ai-sdk/openai-compatible(/v1/chat/completions)' },
  { value: 'responses', label: 'OpenAI Responses', desc: '@ai-sdk/openai(/v1/responses)' }
];
export const protocolLabel = value => (PROTOCOLS.find(p => p.value === value) || {}).label || value;

export default function ProviderEditor({ data, setData, isNew, dirty, busy, fetching,
  onFetchModels, onSave, onCancel, registerFlush, registerInputFlush, registerModelInput, getDraft, editingRef, children }) {
  const models = data.models || [];
  const inputFlushes = useRef(new Map());
  const registerInput = useCallback((field, fn) => {
    if (fn) inputFlushes.current.set(field, fn);
    else inputFlushes.current.delete(field);
  }, []);
  useEffect(() => {
    registerModelInput(registerInput);
    return () => registerModelInput(null);
  }, []);
  const flushInputs = () => {
    if (!editingRef.current) return getDraft();
    let draft = getDraft();
    inputFlushes.current.forEach((flush, field) => {
      const value = flush();
      if (field.startsWith('model.')) {
        const [, index, key, nested] = field.split('.');
        const model = draft.models[Number(index)];
        draft = updateModel(draft, Number(index), nested
          ? { [key]: { ...(model[key] || {}), [nested]: value } }
          : { [key]: value });
      } else draft = { ...draft, [field]: value };
    });
    editingRef.current = draft;
    return draft;
  };
  useEffect(() => {
    registerInputFlush(flushInputs);
    return () => registerInputFlush(null);
  }, []);
  const save = () => {
    const draft = flushInputs();
    if (!draft.id.trim()) return;
    const next = registerFlush?.() || getDraft();
    editingRef.current = next;
    setData(next);
    onSave(next);
  };
  const cancel = () => { flushInputs(); onCancel(); };
  useEffect(() => {
    const onVisibilityFlush = () => { if (document.visibilityState === 'hidden') flushInputs(); };
    document.addEventListener('visibilitychange', onVisibilityFlush);
    return () => document.removeEventListener('visibilitychange', onVisibilityFlush);
  }, []);
  const fetchModels = () => {
    const draft = flushInputs();
    if (draft.baseUrl.trim()) onFetchModels(providerFetchTarget(draft));
  };

  return (
    <div className="oc-workspace" aria-busy={busy}>
      <div className="oc-editor-scroll">
        <div className="oc-editor-top">
          <button className="oc-back" onClick={cancel}><Icon name="chevron" size={13} /> 返回 Provider 列表</button>
          {dirty && <span className="oc-dirty">有未保存的修改</span>}
        </div>
        <div className="oc-editor-heading">
          <h1>OpenCode</h1>
          <div><h2 className="oc-editor-title">{isNew ? '新建 Provider' : '编辑 Provider'}</h2>
            <p>{data.name || data.id || '手动配置'} · {protocolLabel(data.protocol)}</p></div>
        </div>

        <section className="oc-panel oc-connection">
          <div className="oc-section-head"><h3>连接与身份</h3><p>全部手动输入，拉取时使用当前 Base URL 与 API Key。</p></div>
          <div className="oc-connection-grid">
            <label className="oc-field span-6">Base URL<DraftTextInput registerFlush={registerInput} field="baseUrl" type="text" className="mono" value={data.baseUrl}
              onCommit={value => setData(d => ({ ...d, baseUrl: value }))} placeholder="https://api.example.com/v1" /></label>
            <label className="oc-field span-6">API Key<span className="oc-field-hint">{isNew ? '随 Provider 保存' : '留空 = 保持不变'}</span>
              <DraftTextInput registerFlush={registerInput} field="apiKey" type="password" className="mono" value={data.apiKey} onCommit={value => setData(d => ({ ...d, apiKey: value }))} placeholder="sk-…" /></label>
            <fieldset className="oc-field span-3"><legend>协议类型</legend><div className="oc-protocol">
              {PROTOCOLS.map(p => <button type="button" key={p.value} className={data.protocol === p.value ? 'on' : ''}
                title={p.desc} onClick={() => setData(d => ({ ...d, protocol: p.value }))}>{p.value === 'message' ? 'Messages' : p.value === 'chat' ? 'Chat' : 'Responses'}</button>)}
            </div></fieldset>
            <label className="oc-field span-3">Provider ID<DraftTextInput registerFlush={registerInput} field="id" type="text" className="mono" value={data.id}
              onCommit={value => setData(d => ({ ...d, id: value }))} placeholder="my-relay" /></label>
            <label className="oc-field span-3">显示名称<DraftTextInput registerFlush={registerInput} field="name" type="text" value={data.name}
              onCommit={value => setData(d => ({ ...d, name: value }))} placeholder="My Relay" /></label>
            <div className="oc-field span-3"><span className="oc-field-label">模型清单</span>
              <button className="btn oc-fetch" disabled={fetching}
                onClick={fetchModels}>
                {fetching ? <Spinner size={11} /> : <Icon name="refresh" size={11} />} 从 /v1/models 拉取</button></div>
          </div>
        </section>
        {children}
        <div className="oc-default-model"><label className="oc-field">默认模型
          <Select value={data.defaultModel || ''} onChange={v => setData(d => ({ ...d, defaultModel: v }))}
            placeholder="不设默认" emptyText="先在上方添加模型"
            options={models.filter(m => m.id).map(m => ({ value: `${data.id}/${m.id}`, label: `${data.id}/${m.id}` }))} />
        </label></div>
      </div>
      <footer className="oc-savebar"><p>模型修改会随 Provider 一起保存；离开有修改的页面会先确认。</p>
        <button className="btn btn-sm" onClick={cancel} disabled={busy}>取消</button>
        <button className="btn btn-sm btn-gold" disabled={busy} onClick={save}>
          {busy ? <><Spinner size={11} /> 写入中…</> : '保存并写入 OpenCode 配置'}</button></footer>
    </div>
  );
}
