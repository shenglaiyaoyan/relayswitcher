import React, { Fragment, useRef, useState } from 'react';
import { Icon } from '../../components/ui.jsx';
import { moveEffort } from './draft.mjs';

const TRI = [['unset', '未设置'], ['yes', '支持'], ['no', '不支持']];

/** 推理/温度三选一:未设置 = 不写入配置 */
export function TriSeg({ value, onChange, disabled, label }) {
  return (
    <span className="oce-seg" role="radiogroup" aria-label={label}>
      {TRI.map(([v, text]) => (
        <button type="button" key={v} role="radio" aria-checked={value === v} disabled={disabled}
          className={'oce-seg-btn' + (value === v ? ' on' : '')} onClick={() => value !== v && onChange(v)}>{text}</button>
      ))}
    </span>
  );
}

const Grip = () => (
  <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor" aria-hidden="true">
    <circle cx="2" cy="2" r="1.15" /><circle cx="6" cy="2" r="1.15" /><circle cx="2" cy="6" r="1.15" />
    <circle cx="6" cy="6" r="1.15" /><circle cx="2" cy="10" r="1.15" /><circle cx="6" cy="10" r="1.15" />
  </svg>
);

/** 思考档位:按住左侧把手拖动排序(把手聚焦后 ← → 也能移动),点档位名设为默认,× 删除。
    onChange 收到 { efforts } / { effort } / 两者都有 的补丁。 */
export function EffortList({ efforts = [], effort = '', onChange, disabled, emptyText = '无档位' }) {
  const [drag, setDrag] = useState(null); // 正在拖的下标
  const [drop, setDrop] = useState(null); // 插入位置 0..length
  const armed = useRef(false); // 只有从把手按下才允许拖动,点档位名、× 不触发
  const finish = () => { setDrag(null); setDrop(null); armed.current = false; };
  const commit = () => {
    if (drag == null || drop == null) return finish();
    const next = moveEffort(efforts, drag, drop > drag ? drop - 1 : drop);
    finish();
    if (next !== efforts) onChange({ efforts: next });
  };
  const nudge = (i, delta) => {
    const next = moveEffort(efforts, i, i + delta);
    if (next !== efforts) onChange({ efforts: next });
  };
  // 落点提示画在档位边框外侧(不插入元素):插入占位会把档位挤开,松手时鼠标下的目标变了浏览器就取消放下
  const moving = drag != null && drop != null && drop !== drag && drop !== drag + 1;
  const dropClass = i => !moving ? '' : drop === i ? ' drop-before' : (drop === efforts.length && i === efforts.length - 1 ? ' drop-after' : '');

  return (
    <div className={'oce-efforts' + (disabled ? ' disabled' : '')} aria-disabled={disabled || undefined}
      onDragOver={e => { if (drag != null) e.preventDefault(); }} onDrop={e => { e.preventDefault(); commit(); }}>
      {efforts.map((e, i) => (
        <Fragment key={e}>
          <span className={'oce-effort' + (effort === e ? ' on' : '') + (drag === i ? ' dragging' : '') + dropClass(i)}
            draggable={!disabled}
            onDragStart={ev => {
              if (!armed.current) { ev.preventDefault(); return; }
              ev.dataTransfer.effectAllowed = 'move';
              ev.dataTransfer.setData('text/plain', e);
              setDrag(i);
            }}
            onDragOver={ev => {
              if (drag == null) return;
              ev.preventDefault();
              const r = ev.currentTarget.getBoundingClientRect();
              setDrop(ev.clientX < r.left + r.width / 2 ? i : i + 1);
            }}
            onDragEnd={finish}>
            <span className="oce-grip" role="button" tabIndex={disabled ? -1 : 0} aria-label={`调整 ${e} 的顺序`}
              title="拖动调整顺序（也可用 ← → 键）"
              onPointerDown={() => { armed.current = true; }} onPointerUp={() => { armed.current = false; }}
              onKeyDown={ev => {
                if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') { ev.preventDefault(); nudge(i, ev.key === 'ArrowLeft' ? -1 : 1); }
              }}><Grip /></span>
            <button type="button" className="mono" disabled={disabled}
              onClick={() => onChange({ effort: effort === e ? '' : e })}>{e}{effort === e && <i>默认</i>}</button>
            <button type="button" className="oce-effort-x" title="删除该档位" disabled={disabled}
              onClick={() => onChange({ efforts: efforts.filter(x => x !== e), ...(effort === e ? { effort: '' } : {}) })}>
              <Icon name="x" size={10} /></button>
          </span>
        </Fragment>
      ))}
      {!efforts.length && <span className="oce-muted">{emptyText}</span>}
    </div>
  );
}
