import React from 'react';
import { Icon, Select } from '../../components/ui.jsx';
import { capState, fmtTokens } from './templates.mjs';

export const AUTO = '__auto__';
const STATE_TEXT = { yes: '支持', no: '不支持', unset: '未设置' };
// 亮 = 支持/开，暗 = 未设置，删除线 = 不支持/关
const capsOf = m => [
  ['推', '推理', capState(m.reasoning)],
  ['工', '工具调用', m.tool_call !== false ? 'yes' : 'no'],
  ['T', '温度参数', capState(m.temperature)]
];

export default function ModelTable({ rows, total, query, setQuery, batch, onToggleBatch, checked, setChecked,
  selected, onSelect, onAddManual, onTidyNames, defaultModelId, templates, batchTemplate, setBatchTemplate, onApplyBatch, busy }) {
  const toggle = i => setChecked(prev => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });
  const visible = rows.map(r => r.i);
  const allChecked = visible.length > 0 && visible.every(i => checked.has(i));
  const hidden = [...checked].filter(i => !visible.includes(i)).length;

  return (
    <section className="oce-table">
      <div className="oce-toolbar">
        <label className="oce-search"><Icon name="search" size={13} />
          <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索模型 ID 或名称" /></label>
        <span className="oce-spacer" />
        <span className="oce-muted">{total} 个模型</span>
        {rows.some(({ m }) => !m.name || m.name === m.id) && <button type="button" className="oce-tidy-btn" onClick={onTidyNames} disabled={busy} title="把显示名还是 ID 的模型整理成可读名称">
          整理名称</button>}
        <button type="button" className={'oce-text-btn' + (batch ? ' on' : '')} onClick={onToggleBatch} disabled={!total}>
          {batch ? '退出批量' : '批量'}</button>
        <button type="button" className="oce-text-btn" onClick={onAddManual}><Icon name="plus" size={11} /> 手动添加</button>
      </div>
      <div className={'oce-grid oce-grid-head' + (batch ? ' batch' : '')} role="row">
        {batch && <input type="checkbox" className="oce-check" aria-label="全选" checked={allChecked}
          onChange={() => setChecked(prev => {
            const next = new Set(prev);
            visible.forEach(i => (allChecked ? next.delete(i) : next.add(i)));
            return next;
          })} />}
        <span>模型 ID</span><span>名称</span><span>模板</span><span className="num">上下文</span><span className="num">输出</span><span className="oce-col-effort">默认档位</span><span>能力</span>
      </div>
      <div className="oce-table-body">
        {rows.map(({ m, i, t }) => (
          <div key={i} role="row" className={'oce-grid oce-row' + (batch ? ' batch' : '') + (!batch && i === selected ? ' on' : '') + (batch && checked.has(i) ? ' checked' : '')}
            onClick={() => (batch ? toggle(i) : onSelect(i))}>
            {batch && <input type="checkbox" className="oce-check" aria-label={`选择 ${m.id || '未命名模型'}`} checked={checked.has(i)}
              onClick={e => e.stopPropagation()} onChange={() => toggle(i)} />}
            <span className="mono oce-cell-id-text" title={m.id}>{m.id || '(未命名)'}{defaultModelId && m.id === defaultModelId && <i className="oce-default">默认</i>}</span>
            <span className="oce-ellipsis" title={m.name}>{m.name || '—'}</span>
            <span><span className={'oce-tag' + (t ? '' : ' none')}>{t ? t.name : '未匹配'}</span></span>
            <span className="mono num">{fmtTokens(m.limit?.context)}</span>
            <span className="mono num">{fmtTokens(m.limit?.output)}</span>
            <span className="mono oce-col-effort">{m.effort || '—'}</span>
            <span className="oce-caps">{capsOf(m).map(([short, label, s]) =>
              <i key={short} className={s === 'yes' ? 'on' : s === 'no' ? 'off' : ''} title={`${label}：${STATE_TEXT[s]}`}>{short}</i>)}</span>
          </div>
        ))}
        {!total && <div className="oce-empty"><b>还没有模型</b><span>点右上角「拉取模型」，或「手动添加」。</span></div>}
        {total > 0 && !rows.length && <div className="oce-empty"><span>没有符合搜索的模型</span></div>}
      </div>
      {batch && checked.size > 0 && <div className="oce-batch-bar">
        <b>已选 {checked.size} 个{hidden ? `（${hidden} 个未显示）` : ''}</b>
        <span className="oce-spacer" />
        <div className="oce-batch-select"><Select value={batchTemplate} onChange={setBatchTemplate} options={[
          { value: AUTO, label: '按名称自动匹配' }, ...templates.map(x => ({ value: x.id, label: x.name }))]} /></div>
        <button type="button" className="btn btn-sm btn-gold" disabled={busy} onClick={onApplyBatch}>套用</button>
        <button type="button" className="oce-text-btn" onClick={() => setChecked(new Set())}>取消</button>
      </div>}
    </section>
  );
}
