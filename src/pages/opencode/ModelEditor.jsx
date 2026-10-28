import React, { memo, useEffect, useRef, useState } from 'react';
import { Icon, Toggle } from '../../components/ui.jsx';
import { addEffort, updateModel } from './draft.mjs';
import { DraftTextInput, DraftNumberInput } from './fields.jsx';

const RECOMMENDED_EFFORTS = ['low', 'medium', 'high', 'max'];

export default memo(function ModelEditor({ model, modelIndex, onChange, onDelete, busy, registerFlush, registerInput }) {
  const [adding, setAdding] = useState(false);
  const [newEffort, setNewEffort] = useState('');
  const set = (key, value) => onChange({ [key]: value });
  const latest = useRef({ model, newEffort, onChange });
  latest.current = { model, modelIndex, newEffort, onChange };
  const commit = () => {
    if (busy) return;
    onChange(addEffort(model, newEffort));
    setNewEffort(''); setAdding(false);
  };
  useEffect(() => {
    registerFlush?.(provider => {
      const current = latest.current;
      const baseModel = provider.models[current.modelIndex] || current.model;
      if (!current.newEffort.trim() || baseModel.efforts.includes(current.newEffort.trim())) return provider;
      const updated = addEffort(baseModel, current.newEffort);
      const nextProvider = updateModel(provider, current.modelIndex, updated);
      current.onChange(updated);
      setNewEffort(''); setAdding(false);
      return nextProvider;
    });
    return () => registerFlush?.(null);
  }, []);

  return (
    <div className="oc-model-params">
      <div className="oc-section-head"><div><h3>模型参数</h3><span className="mono">{model.id || '(未命名)'}</span></div>
        <button className="oc-del-model" onClick={onDelete}><Icon name="trash" size={12} /> 删除模型</button></div>
      <div className="oc-param-grid">
        <label className="oc-field span-6">模型 ID<DraftTextInput registerFlush={registerInput} field={`model.${modelIndex}.id`} type="text" className="mono" value={model.id}
          onCommit={value => onChange({ id: value })} placeholder="model-id" /></label>
        <label className="oc-field span-6">显示名<DraftTextInput registerFlush={registerInput} field={`model.${modelIndex}.name`} type="text" value={model.name || ''}
          onCommit={value => onChange({ name: value })} placeholder="留空 = 用模型 ID" /></label>
        <label className="oc-field span-6">上下文窗口 <span className="oc-field-hint">tokens，0 = 不写入</span>
          <DraftNumberInput registerFlush={registerInput} field={`model.${modelIndex}.limit.context`} type="text" inputMode="numeric" className="mono" value={model.limit?.context} placeholder="如 1000000"
            onCommit={v => onChange({ limit: { ...(model.limit || {}), context: v } })} /></label>
        <label className="oc-field span-6">最大输出 <span className="oc-field-hint">tokens，0 = 不写入</span>
          <DraftNumberInput registerFlush={registerInput} field={`model.${modelIndex}.limit.output`} type="text" inputMode="numeric" className="mono" value={model.limit?.output} placeholder="如 128000"
            onCommit={v => onChange({ limit: { ...(model.limit || {}), output: v } })} /></label>
      </div>
      <div className="oc-cap-grid">
        {[['reasoning', '推理'], ['attachment', '附件'], ['tool_call', '工具'], ['temperature', 'Temp']].map(([key, label]) => (
          <div key={key} className="oc-cap-cell" onClick={() => set(key, !model[key])}><span>{label}</span>
            <Toggle on={!!model[key]} onChange={() => {}} /></div>
        ))}
      </div>
      {[['input', '输入'], ['output', '输出']].map(([dir, label]) => (
        <div className="oc-modality" key={dir}><span>{label}模态</span><div className="oc-chip-list">
          {['text', 'image', 'audio', 'video', 'pdf'].map(mod => {
            const current = model.modalities?.[dir] || [];
            const selected = current.includes(mod);
            return <button type="button" key={mod} className={'chip' + (selected ? ' on' : '')}
              onClick={() => set('modalities', { ...(model.modalities || {}),
                [dir]: selected ? current.filter(x => x !== mod) : [...current, mod] })}>{mod}</button>;
          })}
        </div></div>
      ))}
      <div className="oc-effort-section"><div className="oc-field-label">思考强度 <span className="oc-field-hint">点击选择默认档位</span></div>
        <div className="oc-efforts">{(model.efforts || []).map(effort => (
          <span key={effort} className={'oc-effort-card' + (model.effort === effort ? ' on' : '')}>
            <button type="button" className="oc-effort-select mono"
              onClick={() => set('effort', model.effort === effort ? '' : effort)}>{effort}</button>
            <button type="button" className="oc-effort-x" title="删除该档位"
              onClick={() => onChange({ efforts: model.efforts.filter(e => e !== effort),
                ...(model.effort === effort ? { effort: '' } : {}) })}><Icon name="x" size={11} /></button>
          </span>
        ))}
        {!adding ? <button type="button" className="oc-effort-add" onClick={() => setAdding(true)}>
          <Icon name="plus" size={11} /> 新增档位</button> : <span className="oc-effort-card adding">
          <input type="text" autoFocus className="mono" value={newEffort} onChange={e => setNewEffort(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setNewEffort(''); setAdding(false); } }}
            onBlur={commit} placeholder="ultra" /></span>}
        </div>
      </div>
      <button className="oc-link-btn oc-recommend" onClick={() => onChange({
        limit: { context: 1000000, output: 128000 }, reasoning: true, attachment: true, tool_call: true,
        modalities: { input: ['text', 'image'], output: ['text'] },
        efforts: model.efforts?.length ? model.efforts : [...RECOMMENDED_EFFORTS]
      })}><Icon name="sparkles" size={11} /> 套用推荐参数</button>
    </div>
  );
});
