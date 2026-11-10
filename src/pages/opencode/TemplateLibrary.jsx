import React, { useEffect, useState } from 'react';
import { Icon, Toggle, Spinner, Confirm } from '../../components/ui.jsx';
import { blankTemplate, capState, fmtTokens, matchTemplate, resetBuiltins, resolveTemplates } from './templates.mjs';
import { EffortList, TriSeg } from './CapControls.jsx';

// 列表里的能力标签：亮 = 支持/开，暗 = 未设置，删除线 = 不支持/关
const capsOf = t => [
  ['推理', capState(t.reasoning)],
  ['工具', t.tool_call !== false ? 'yes' : 'no'],
  ['Temp', capState(t.temperature)]
];
const MODALITIES = ['text', 'image', 'audio', 'video', 'pdf'];
const parsePatterns = text => text.split(',').map(s => s.trim()).filter(Boolean);
const num = text => { const n = Number(String(text).replace(/[^\d]/g, '')); return Number.isFinite(n) ? n : 0; };

export default function TemplateLibrary({ toast }) {
  const [saved, setSaved] = useState(null);
  const [list, setList] = useState(() => resolveTemplates(null));
  const [selectedId, setSelectedId] = useState('');
  const [modelIds, setModelIds] = useState([]);
  const [newEffort, setNewEffort] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [patternText, setPatternText] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const stored = await window.rs.ocTemplatesGet();
        const resolved = resolveTemplates(stored);
        setSaved(resolved); setList(resolved); setSelectedId(resolved[0]?.id || '');
      } catch (e) {
        const fallback = resolveTemplates(null);
        setSaved(fallback); setList(fallback); setSelectedId(fallback[0]?.id || '');
        toast?.('读取模板失败，已显示内置模板：' + e.message, 'warn');
      }
      try {
        const r = await window.rs.ocList();
        setModelIds((r?.providers || []).flatMap(p => (p.models || []).map(m => m.id)).filter(Boolean));
      } catch { /* 命中数仅作参考 */ }
    })();
  }, []);

  const dirty = saved !== null && JSON.stringify(list) !== JSON.stringify(saved);
  const current = list.find(t => t.id === selectedId) || list[0];
  const update = patch => setList(l => l.map(t => t.id === current.id ? { ...t, ...patch } : t));
  useEffect(() => {
    const patterns = current?.patterns || [];
    if (parsePatterns(patternText).join('\n') !== patterns.join('\n')) setPatternText(patterns.join(', '));
  }, [current?.id, (current?.patterns || []).join('\n')]);
  const hits = current ? modelIds.filter(id => matchTemplate(list, id)?.id === current.id).length : 0;

  const addTemplate = () => {
    const t = blankTemplate('custom-' + Date.now().toString(36));
    setList(l => [t, ...l]); setSelectedId(t.id);
  };
  const removeTemplate = () => {
    const rest = list.filter(t => t.id !== current.id);
    setList(rest); setSelectedId(rest[0]?.id || '');
  };
  const addEffortValue = () => {
    const v = newEffort.trim();
    if (!v || current.efforts.includes(v)) { setNewEffort(''); return; }
    update({ efforts: [...current.efforts, v], effort: current.effort || v }); setNewEffort('');
  };
  const save = async () => {
    setSaving(true);
    try {
      const r = await window.rs.ocTemplatesSave(list);
      if (r?.ok) { setSaved(list); toast?.('模板已保存，之后拉取/套用时生效', 'ok'); }
      else toast?.(r?.error || '保存失败', 'bad');
    } finally { setSaving(false); }
  };

  return (
    <div className="oc-template-lib">
      <div className="oc-lib-head">
        <div><h2>模型模板</h2>
          <p>拉取模型时按名称自动匹配模板，一次性填入参数；套用后每项仍可修改，之后修改模板也不会改动已有模型。</p></div>
        <div className="oc-lib-tools">
          <button type="button" className="btn btn-sm" onClick={() => setConfirmReset(true)}>恢复内置模板</button>
          <button type="button" className="btn btn-sm btn-gold" onClick={addTemplate}><Icon name="plus" size={11} /> 新建模板</button>
        </div>
      </div>
      <div className="oc-lib-body">
        <div className="oc-lib-list">
          <div className="oc-lib-list-head"><b>模板列表</b><span>{list.length} 个模板</span></div>
          {list.map(t => <button type="button" key={t.id} className={'oc-lib-item' + (current?.id === t.id ? ' on' : '')} onClick={() => setSelectedId(t.id)}>
            <span className="oc-lib-item-top"><b>{t.name || '(未命名)'}</b><span className="badge">{t.builtin ? '内置' : '自定义'}</span></span>
            <span className="oc-lib-item-sub"><span className="mono">{(t.patterns || []).join(', ') || '无匹配规则'}</span>
              <span className="oc-lib-caps">{capsOf(t).map(([label, s]) => <i key={label} className={s === 'yes' ? 'on' : s === 'no' ? 'off' : ''}>{label}</i>)}</span>
              <span className="mono">{fmtTokens(t.limit?.context)} / {fmtTokens(t.limit?.output)} · {t.efforts?.length ? `${t.efforts.length} 档` : '思考开关'}</span></span>
          </button>)}
        </div>
        {current ? <div className="oc-lib-editor">
          <div className="oc-lib-editor-head"><div><small>正在编辑</small><h3>{current.name || '(未命名)'}</h3></div>
            {current.builtin ? <span className="badge">内置模板</span>
              : <button type="button" className="oc-del-model" onClick={removeTemplate}><Icon name="trash" size={12} /> 删除模板</button>}</div>
          <section><h4>匹配</h4><div className="oc-param-grid">
            <label className="oc-field span-4">模板名<input type="text" value={current.name} onChange={e => update({ name: e.target.value })} /></label>
            <label className="oc-field span-8">匹配规则 <span className="oc-field-hint">逗号分隔，* 为通配，如 claude-*</span>
              <input type="text" className="mono" value={patternText}
                onChange={e => { setPatternText(e.target.value); update({ patterns: parsePatterns(e.target.value) }); }} /></label>
          </div><p className="oc-lib-hits">命中 {hits} 个已保存模型</p></section>
          <section><h4>限制</h4><div className="oc-param-grid">
            <label className="oc-field span-6">上下文 <span className="oc-field-hint">tokens</span>
              <input type="text" inputMode="numeric" className="mono" value={current.limit?.context || ''}
                onChange={e => update({ limit: { ...current.limit, context: num(e.target.value) } })} /></label>
            <label className="oc-field span-6">最大输出 <span className="oc-field-hint">tokens</span>
              <input type="text" inputMode="numeric" className="mono" value={current.limit?.output || ''}
                onChange={e => update({ limit: { ...current.limit, output: num(e.target.value) } })} /></label>
          </div></section>
          <section><h4>能力</h4>
            <div className="oce-cap-rows oc-lib-caps-edit">
              <div className="oce-cap-row"><span>工具调用</span>
                <Toggle on={current.tool_call !== false} onChange={v => update({ tool_call: v })} /><small>写入 tools</small></div>
              <div className="oce-cap-row"><span>温度参数</span>
                <TriSeg value={capState(current.temperature)} onChange={v => update({ temperature: v })} label="温度参数" /><small>未设置 = 不写入</small></div>
            </div>
            {[['input', '输入'], ['output', '输出']].map(([dir, label]) => (
              <React.Fragment key={dir}>
                <div className="oc-modality"><span>{label}模态</span><div className="oc-chip-list">
                  {MODALITIES.map(mod => {
                    const cur = current.modalities?.[dir] || [];
                    const on = cur.includes(mod);
                    return <button type="button" key={mod} className={'chip' + (on ? ' on' : '')}
                      onClick={() => update({ modalities: { ...current.modalities, [dir]: on ? cur.filter(x => x !== mod) : [...cur, mod] } })}>{mod}</button>;
                  })}</div></div>
                {dir === 'input' && <p className="oc-lib-modality-hint">勾选 image / pdf 即可传附件</p>}
              </React.Fragment>))}
          </section>
          <section><h4>推理与思考档位 <span className="oc-field-hint">拖动排序 · 点击设为默认 · × 删除；无档位 = 仅思考开关</span></h4>
            <div className="oc-lib-efforts">
              <div className="oce-cap-row oce-reasoning-row"><span>推理</span>
                <TriSeg value={capState(current.reasoning)} onChange={v => update({ reasoning: v })} label="推理" />
                <small>选「支持」会把档位一并声明给 OpenCode</small></div>
              <EffortList efforts={current.efforts || []} effort={current.effort || ''} onChange={update}
                disabled={capState(current.reasoning) === 'no'} emptyText="无档位（仅思考开关）" />
              <span className="oc-effort-new"><input type="text" className="mono" value={newEffort} placeholder="新增档位"
                onChange={e => setNewEffort(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addEffortValue(); }} />
                <button type="button" className="btn btn-sm" onClick={addEffortValue}>添加</button></span>
            </div></section>
        </div> : <div className="oc-lib-editor oc-empty-models">没有模板，点「新建模板」或「恢复内置模板」。</div>}
      </div>
      <footer className="oc-savebar oc-lib-savebar"><p>{dirty ? '有未保存的修改 · ' : ''}修改只影响之后的套用，不改动已有模型。</p>
        <button type="button" className="btn btn-sm" disabled={!dirty || saving} onClick={() => { setList(saved); setSelectedId(s => saved.some(t => t.id === s) ? s : saved[0]?.id || ''); }}>取消</button>
        <button type="button" className="btn btn-sm btn-gold" disabled={!dirty || saving} onClick={save}>{saving ? <><Spinner size={11} /> 保存中…</> : '保存模板'}</button></footer>
      <Confirm open={confirmReset} title="恢复内置模板" message="内置模板恢复为默认值（未保存前可取消），自定义模板保留。"
        confirmLabel="恢复" onCancel={() => setConfirmReset(false)} onConfirm={() => {
          const next = resetBuiltins(list); setList(next); setSelectedId(next[0]?.id || ''); setConfirmReset(false);
        }} />
    </div>
  );
}
