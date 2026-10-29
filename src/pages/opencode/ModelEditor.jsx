import React, { memo, useEffect, useRef, useState } from 'react';
import { Icon, Toggle } from '../../components/ui.jsx';
import { addEffort, updateModel } from './draft.mjs';
import { DraftTextInput, DraftNumberInput } from './fields.jsx';
import { applyTemplate, fmtTokens, matchTemplate, templateDiff } from './templates.mjs';

const CAPS = [['reasoning', '推理'], ['attachment', '附件'], ['tool_call', '工具'], ['temperature', 'Temp']];
const MODALITIES = ['text', 'image', 'audio', 'video', 'pdf'];
const Modified = ({ on }) => on ? <span className="oce-modified" title="与套用时的模板值不同">已修改</span> : null;
const fmtTime = ts => {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const templateSummary = t => `${fmtTokens(t.limit?.context)} / ${fmtTokens(t.limit?.output)} · ${t.efforts?.length ? t.efforts.length + ' 档' : '思考开关'}`;

function TemplateMenu({ model, templates, onApply, onSaveAsTemplate, busy }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const matched = matchTemplate(templates, model.id);
  const current = model.template?.name || (matched ? matched.name : '无');
  const ordered = matched ? [matched, ...templates.filter(t => t.id !== matched.id)] : templates;
  return (
    <div className="oce-menu" ref={ref}>
      <button type="button" className="oce-menu-btn" disabled={busy} onClick={() => setOpen(o => !o)} aria-expanded={open}>
        模板 · {current} <Icon name="chevron" size={11} /></button>
      {open && <div className="oce-menu-pop" role="menu">
        <div className="oce-menu-label">套用模板（覆盖参数，之后仍可改）</div>
        {ordered.map(t => <button type="button" role="menuitem" key={t.id} className="oce-menu-item"
          onClick={() => { setOpen(false); onApply(t); }}>
          <span>{t.name}{matched?.id === t.id && <i className="oce-rec">推荐</i>}</span>
          <small className="mono">{templateSummary(t)}</small></button>)}
        <div className="oce-menu-sep" />
        <button type="button" role="menuitem" className="oce-menu-item" onClick={() => { setOpen(false); onSaveAsTemplate?.(model); }}>
          <span><Icon name="plus" size={11} /> 存为新模板</span><small>用当前参数新建自定义模板</small></button>
      </div>}
    </div>
  );
}

export default memo(function ModelEditor({ model, modelIndex, onChange, onDelete, onClose, busy, registerFlush, registerInput,
  templates = [], onSaveAsTemplate, isDefault, onToggleDefault }) {
  const [newEffort, setNewEffort] = useState('');
  const changed = new Set(templateDiff(model));
  const set = (key, value) => onChange({ [key]: value });
  const latest = useRef({ model, newEffort, onChange });
  latest.current = { model, modelIndex, newEffort, onChange };
  const commit = () => {
    if (busy) return;
    onChange(addEffort(model, newEffort));
    setNewEffort('');
  };
  useEffect(() => {
    registerFlush?.(provider => {
      const current = latest.current;
      const baseModel = provider.models[current.modelIndex] || current.model;
      if (!current.newEffort.trim() || baseModel.efforts.includes(current.newEffort.trim())) return provider;
      const updated = addEffort(baseModel, current.newEffort);
      const nextProvider = updateModel(provider, current.modelIndex, updated);
      current.onChange(updated);
      setNewEffort('');
      return nextProvider;
    });
    return () => registerFlush?.(null);
  }, []);

  return (
    <aside className="oce-drawer" aria-label="模型参数">
      <div className="oce-drawer-head">
        <div className="oce-drawer-title"><b>{model.name || model.id || '未命名模型'}</b><span className="mono">{model.id || '填写模型 ID'}</span></div>
        <TemplateMenu model={model} templates={templates} onApply={t => onChange(applyTemplate(model, t))} onSaveAsTemplate={onSaveAsTemplate} busy={busy} />
        <button type="button" className={'oce-icon-btn' + (isDefault ? ' star-on' : '')} disabled={!model.id}
          onClick={onToggleDefault} title={isDefault ? '默认模型（点击取消）' : '设为默认模型'} aria-label={isDefault ? '取消默认模型' : '设为默认模型'}>
          <Icon name="star" size={14} /></button>
        <button type="button" className="oce-icon-btn" onClick={onClose} aria-label="关闭参数面板"><Icon name="x" size={14} /></button>
      </div>
      <div className="oce-drawer-body">
        <p className="oce-source">{model.template
          ? `来自 ${model.template.name} 模板 · ${fmtTime(model.template.appliedAt)} · 之后的修改只属于此模型`
          : '未套用模板 · 可从右上角「模板」选择'}{isDefault ? ' · 默认模型' : ''}</p>

        <section className="oce-sec"><h4>基本</h4>
          <div className="oce-fields">
            <label className="oce-field full">模型 ID<DraftTextInput registerFlush={registerInput} field={`model.${modelIndex}.id`} type="text" className="mono" value={model.id}
              onCommit={value => onChange({ id: value })} placeholder="model-id" /></label>
            <label className="oce-field full">名称<DraftTextInput registerFlush={registerInput} field={`model.${modelIndex}.name`} type="text" value={model.name || ''}
              onCommit={value => onChange({ name: value })} placeholder="留空 = 用模型 ID" /></label>
            <label className="oce-field"><span>上下文 <Modified on={changed.has('limit.context')} /></span>
              <DraftNumberInput registerFlush={registerInput} field={`model.${modelIndex}.limit.context`} type="text" inputMode="numeric" className="mono" value={model.limit?.context} placeholder="0 = 不写入"
                onCommit={v => onChange({ limit: { ...(model.limit || {}), context: v } })} /></label>
            <label className="oce-field"><span>最大输出 <Modified on={changed.has('limit.output')} /></span>
              <DraftNumberInput registerFlush={registerInput} field={`model.${modelIndex}.limit.output`} type="text" inputMode="numeric" className="mono" value={model.limit?.output} placeholder="0 = 不写入"
                onCommit={v => onChange({ limit: { ...(model.limit || {}), output: v } })} /></label>
          </div>
        </section>

        <section className="oce-sec"><h4>能力</h4>
          <div className="oce-caps-grid">{CAPS.map(([key, label]) => (
            <div key={key} className="oce-cap" onClick={() => set(key, !model[key])}>
              <span>{label}{changed.has(key) && <i className="oce-dot-mod" title="已修改" />}</span>
              <Toggle on={!!model[key]} onChange={() => {}} /></div>))}
          </div>
        </section>

        <section className="oce-sec"><h4>模态</h4>
          {[['input', '输入'], ['output', '输出']].map(([dir, label]) => (
            <div className="oce-modality" key={dir}><span>{label} <Modified on={changed.has('modalities.' + dir)} /></span><div className="oce-chips">
              {MODALITIES.map(mod => {
                const current = model.modalities?.[dir] || [];
                const selected = current.includes(mod);
                return <button type="button" key={mod} className={'oce-chip' + (selected ? ' on' : '')}
                  onClick={() => set('modalities', { ...(model.modalities || {}),
                    [dir]: selected ? current.filter(x => x !== mod) : [...current, mod] })}>{mod}</button>;
              })}
            </div></div>))}
        </section>

        <section className="oce-sec"><h4>思考档位 <Modified on={changed.has('efforts') || changed.has('effort')} /><small>点击设为默认，× 删除</small></h4>
          <div className="oce-efforts">{(model.efforts || []).map(effort => (
            <span key={effort} className={'oce-effort' + (model.effort === effort ? ' on' : '')}>
              <button type="button" className="mono" onClick={() => set('effort', model.effort === effort ? '' : effort)}>
                {effort}{model.effort === effort && <i>默认</i>}</button>
              <button type="button" className="oce-effort-x" title="删除该档位"
                onClick={() => onChange({ efforts: model.efforts.filter(e => e !== effort),
                  ...(model.effort === effort ? { effort: '' } : {}) })}><Icon name="x" size={10} /></button>
            </span>))}
            {!(model.efforts || []).length && <span className="oce-muted">无档位（仅思考开关）</span>}
          </div>
          <div className="oce-effort-add">
            <input type="text" className="mono" value={newEffort} onChange={e => setNewEffort(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setNewEffort(''); }} placeholder="添加档位，如 ultra" />
            <button type="button" className="btn btn-sm" disabled={!newEffort.trim() || busy} onClick={commit}>添加</button>
          </div>
        </section>

        <button type="button" className="oce-danger-link" onClick={onDelete}><Icon name="trash" size={12} /> 删除此模型</button>
      </div>
    </aside>
  );
});
