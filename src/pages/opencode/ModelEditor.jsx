import React, { memo, useEffect, useRef, useState } from 'react';
import { Icon, Toggle, Select } from '../../components/ui.jsx';
import { addEffort, updateModel } from './draft.mjs';
import { DraftTextInput, DraftNumberInput } from './fields.jsx';
import { applyTemplate, fmtTokens, matchTemplate, templateDiff } from './templates.mjs';

const Modified = ({ on }) => on ? <span className="oc-modified" title="与套用时的模板值不同">已修改</span> : null;
const fmtTime = ts => {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const templateSummary = t => `${fmtTokens(t.limit?.context)} / ${fmtTokens(t.limit?.output)} · ${t.efforts?.length ? t.efforts.length + ' 档' : '思考开关'}`;

export default memo(function ModelEditor({ model, modelIndex, onChange, onDelete, busy, registerFlush, registerInput,
  templates = [], onSaveAsTemplate }) {
  const [adding, setAdding] = useState(false);
  const [newEffort, setNewEffort] = useState('');
  const matched = matchTemplate(templates, model.id);
  const [picked, setPick] = useState(model.template?.id || '');
  const pick = picked || matched?.id || '';
  // 同一实例换了模型(删除后索引复用)或被批量套用时，下拉跟随当前模型而不是沿用旧选择。
  useEffect(() => { setPick(model.template?.id || ''); }, [model.id, model.template?.id, model.template?.appliedAt]);
  const changed = new Set(templateDiff(model));
  const set = (key, value) => onChange({ [key]: value });
  const applyPicked = () => {
    const t = templates.find(x => x.id === pick);
    if (t) onChange(applyTemplate(model, t));
  };
  const templateOptions = [
    ...(matched ? [{ value: matched.id, label: matched.name, desc: '推荐 · ' + templateSummary(matched) }] : []),
    ...templates.filter(t => t.id !== matched?.id).map(t => ({ value: t.id, label: t.name, desc: templateSummary(t) }))
  ];
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
      <div className="oc-template-row">
        <span className="oc-field-label">参数模板</span>
        <div className="oc-template-select"><Select value={pick} onChange={setPick} options={templateOptions}
          placeholder={matched ? matched.name : '未匹配，选择模板'} emptyText="尚无模板" /></div>
        {matched && pick === matched.id && <span className="badge oc-auto-badge">自动匹配</span>}
        <button type="button" className="btn btn-sm" disabled={!pick || busy} onClick={applyPicked}>套用</button>
        <button type="button" className="oc-link-btn" disabled={busy} onClick={() => onSaveAsTemplate?.(model)}>
          <Icon name="plus" size={11} /> 存为新模板</button>
      </div>
      <p className="oc-template-source">{model.template
        ? `来自 ${model.template.name} 模板 · 套用于 ${fmtTime(model.template.appliedAt)} · 之后的修改只属于此模型`
        : matched ? `按名称匹配到 ${matched.name} 模板，点「套用」填入参数` : '未匹配到模板，可手动填写或选择模板套用'}</p>
      <div className="oc-param-grid">
        <label className="oc-field span-6">模型 ID<DraftTextInput registerFlush={registerInput} field={`model.${modelIndex}.id`} type="text" className="mono" value={model.id}
          onCommit={value => onChange({ id: value })} placeholder="model-id" /></label>
        <label className="oc-field span-6">显示名<DraftTextInput registerFlush={registerInput} field={`model.${modelIndex}.name`} type="text" value={model.name || ''}
          onCommit={value => onChange({ name: value })} placeholder="留空 = 用模型 ID" /></label>
        <label className="oc-field span-6">上下文窗口 <Modified on={changed.has('limit.context')} /><span className="oc-field-hint">tokens，0 = 不写入</span>
          <DraftNumberInput registerFlush={registerInput} field={`model.${modelIndex}.limit.context`} type="text" inputMode="numeric" className="mono" value={model.limit?.context} placeholder="如 1000000"
            onCommit={v => onChange({ limit: { ...(model.limit || {}), context: v } })} /></label>
        <label className="oc-field span-6">最大输出 <Modified on={changed.has('limit.output')} /><span className="oc-field-hint">tokens，0 = 不写入</span>
          <DraftNumberInput registerFlush={registerInput} field={`model.${modelIndex}.limit.output`} type="text" inputMode="numeric" className="mono" value={model.limit?.output} placeholder="如 128000"
            onCommit={v => onChange({ limit: { ...(model.limit || {}), output: v } })} /></label>
      </div>
      <div className="oc-cap-grid">
        {[['reasoning', '推理'], ['attachment', '附件'], ['tool_call', '工具'], ['temperature', 'Temp']].map(([key, label]) => (
          <div key={key} className="oc-cap-cell" onClick={() => set(key, !model[key])}><span>{label} <Modified on={changed.has(key)} /></span>
            <Toggle on={!!model[key]} onChange={() => {}} /></div>
        ))}
      </div>
      {[['input', '输入'], ['output', '输出']].map(([dir, label]) => (
        <div className="oc-modality" key={dir}><span>{label}模态 <Modified on={changed.has('modalities.' + dir)} /></span><div className="oc-chip-list">
          {['text', 'image', 'audio', 'video', 'pdf'].map(mod => {
            const current = model.modalities?.[dir] || [];
            const selected = current.includes(mod);
            return <button type="button" key={mod} className={'chip' + (selected ? ' on' : '')}
              onClick={() => set('modalities', { ...(model.modalities || {}),
                [dir]: selected ? current.filter(x => x !== mod) : [...current, mod] })}>{mod}</button>;
          })}
        </div></div>
      ))}
      <div className="oc-effort-section"><div className="oc-field-label">思考强度 <Modified on={changed.has('efforts') || changed.has('effort')} /><span className="oc-field-hint">点击选择默认档位，× 删除</span></div>
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
    </div>
  );
});
