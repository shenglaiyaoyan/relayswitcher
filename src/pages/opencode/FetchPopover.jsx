import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/ui.jsx';
import { matchTemplate } from './templates.mjs';

/** 拉取结果锚定弹层：已添加置灰，勾选新模型后一次加入（加入时由调用方套用匹配模板）。 */
export default function FetchPopover({ ids, existing, templates, onAdd, onClose }) {
  const [picked, setPicked] = useState(() => new Set());
  const ref = useRef(null);
  useEffect(() => {
    const onDoc = e => { if (ref.current && !ref.current.contains(e.target) && !e.target.closest?.('.oce-fetch')) onClose(); };
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [onClose]);
  const fresh = ids.filter(id => !existing.has(id));
  const toggle = id => setPicked(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allPicked = fresh.length > 0 && fresh.every(id => picked.has(id));

  return (
    <div className="oce-pop" ref={ref} role="dialog" aria-label="拉取到的模型">
      <div className="oce-pop-head">
        <b>从 /v1/models 拉取到 {ids.length} 个</b>
        <button type="button" className="oce-icon-btn" onClick={onClose} aria-label="关闭"><Icon name="x" size={13} /></button>
      </div>
      {fresh.length > 1 && <label className="oce-pop-all">
        <input type="checkbox" className="oce-check" checked={allPicked}
          onChange={() => setPicked(allPicked ? new Set() : new Set(fresh))} /> 全选未添加的 {fresh.length} 个</label>}
      <div className="oce-pop-list">
        {ids.map(id => {
          const added = existing.has(id);
          const t = matchTemplate(templates, id);
          return <label key={id} className={'oce-pop-row' + (added ? ' added' : '')}>
            <input type="checkbox" className="oce-check" disabled={added} checked={added || picked.has(id)} onChange={() => toggle(id)} />
            <span className="mono">{id}</span>
            <span className={'oce-tag' + (t ? '' : ' none')}>{t ? t.name : '未匹配'}</span>
            {added && <span className="oce-pop-added">已添加</span>}
          </label>;
        })}
        {!ids.length && <p className="oce-muted">没有拉取到模型</p>}
      </div>
      <div className="oce-pop-foot">
        <span>加入时自动套用匹配模板</span>
        <button type="button" className="btn btn-sm btn-gold" disabled={!picked.size}
          onClick={() => onAdd([...picked])}>{picked.size ? `加入 ${picked.size} 个` : '加入'}</button>
      </div>
    </div>
  );
}
