import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icon, Spinner, Select } from '../../components/ui.jsx';
import { providerFetchTarget, updateModel } from './draft.mjs';
import { DraftTextInput } from './fields.jsx';

export const PROTOCOLS = [
  { value: 'message', label: 'Anthropic Messages', desc: '@ai-sdk/anthropic(/v1/messages)' },
  { value: 'chat', label: 'OpenAI Chat', desc: '@ai-sdk/openai-compatible(/v1/chat/completions)' },
  { value: 'responses', label: 'OpenAI Responses', desc: '@ai-sdk/openai(/v1/responses)' }
];
export const protocolLabel = value => (PROTOCOLS.find(p => p.value === value) || {}).label || value;
const SHORT = { message: 'Messages', chat: 'Chat', responses: 'Responses' };

export default function ProviderEditor({ data, setData, isNew, dirty, busy, fetching,
  onFetchModels, onSave, onCancel, registerFlush, registerInputFlush, registerModelInput, getDraft, editingRef,
  fetchPopover, children }) {
  const [showKey, setShowKey] = useState(false);
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
        if (!model) return;
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
    flushInputs();
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
    <div className="oce" aria-busy={busy}>
      <header className="oce-head">
        <div className="oce-head-main">
          <button type="button" className="oce-back" onClick={cancel}><Icon name="chevron" size={12} /> Provider 列表</button>
          <span className="oce-eyebrow">{isNew ? '新建 OpenCode 提供商' : 'OpenCode 提供商'}</span>
          <DraftTextInput registerFlush={registerInput} field="name" type="text" className="oce-title" value={data.name}
            onCommit={value => setData(d => ({ ...d, name: value }))} placeholder="显示名称" aria-label="显示名称" />
        </div>
        <div className="oce-fetch-anchor">
          <button type="button" className="btn btn-sm oce-fetch" disabled={fetching || busy} onClick={fetchModels}
            title={data.baseUrl?.trim() ? '用当前 Base URL 与 API Key 拉取 /v1/models' : '先填写 Base URL'}>
            {fetching ? <Spinner size={11} /> : <Icon name="download" size={13} />} 拉取模型</button>
          {fetchPopover}
        </div>
      </header>

      <div className="oce-conn">
        <div className="oce-cell oce-cell-protocol"><span className="oce-cell-label">协议</span>
          <Select value={data.protocol} onChange={v => setData(d => ({ ...d, protocol: v }))}
            options={PROTOCOLS.map(p => ({ value: p.value, label: SHORT[p.value], desc: p.label }))} /></div>
        <label className="oce-cell oce-cell-url"><span className="oce-cell-label">Base URL</span>
          <DraftTextInput registerFlush={registerInput} field="baseUrl" type="text" className="mono" value={data.baseUrl}
            onCommit={value => setData(d => ({ ...d, baseUrl: value }))} placeholder="https://api.example.com/v1" /></label>
        <div className="oce-cell oce-cell-key"><label htmlFor="oc-api-key" className="oce-cell-label"
          title={isNew ? '随 Provider 保存' : data.apiKey ? '已保存 · 留空保持不变' : '留空 = 保持不变'}>API Key</label>
          <DraftTextInput id="oc-api-key" registerFlush={registerInput} field="apiKey" type={showKey ? 'text' : 'password'} className="mono" value={data.apiKey}
            onCommit={value => setData(d => ({ ...d, apiKey: value }))} placeholder={isNew ? 'sk-…' : '留空 = 保持不变'} autoComplete="off" spellCheck={false} />
          <button type="button" className="oce-eye" onClick={() => setShowKey(v => !v)}
            aria-label={showKey ? '隐藏 API Key' : '显示 API Key'} title={showKey ? '隐藏 API Key' : '显示 API Key'}>
            <Icon name={showKey ? 'eyeOff' : 'eye'} size={15} /></button></div>
        <label className="oce-cell oce-cell-id"><span className="oce-cell-label">Provider ID</span>
          <DraftTextInput registerFlush={registerInput} field="id" type="text" className="mono" value={data.id}
            onCommit={value => setData(d => ({ ...d, id: value }))} placeholder="my-relay" /></label>
      </div>

      <div className="oce-body">{children}</div>

      <footer className="oce-savebar">
        <p>{dirty ? <><i className="oce-dirty-dot" /> 有未保存的修改</> : '模型修改随 Provider 一起保存'}</p>
        <button className="btn btn-sm oce-ghost" onClick={cancel} disabled={busy}>取消</button>
        <button className="btn btn-sm btn-gold" disabled={busy} onClick={save}>
          {busy ? <><Spinner size={11} /> 写入中…</> : '保存并写入 OpenCode 配置'}</button>
      </footer>
    </div>
  );
}
