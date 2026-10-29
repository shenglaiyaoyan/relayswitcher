import React, { useEffect, useRef, useState } from 'react';

/* ---------------- 图标系统(24 viewBox 线性描边) ---------------- */
const ICONS = {
  dash: <><path d="M4.5 19a9 9 0 1 1 15 0" /><path d="M12 14.5L16 9.5" /><circle cx="12" cy="14.5" r="1.3" /></>,
  account: <><circle cx="12" cy="8" r="3.4" /><path d="M5 20c1.4-3.4 4-5 7-5s5.6 1.6 7 5" /></>,
  relay: <><path d="M4 8h13" /><path d="M14 4.5L17.5 8 14 11.5" /><path d="M20 16H7" /><path d="M10 12.5L6.5 16l3.5 3.5" /></>,
  backup: <><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" /><path d="M4.5 4v3.5H8" /><path d="M12 8.5v4l2.6 1.7" /></>,
  settings: <><path d="M5 7.5h14" /><circle cx="9.5" cy="7.5" r="2.2" /><path d="M5 16.5h14" /><circle cx="14.5" cy="16.5" r="2.2" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <><path d="M4.5 7h15" /><path d="M9.5 7V4.5h5V7" /><path d="M7 7l1 13h8l1-13" /></>,
  edit: <path d="M15 5l4 4L8 20H4v-4L15 5z" />,
  bolt: <path d="M13 3L5.5 13.5H11l-1 7.5L17.5 10.5H12l1-7.5z" />,
  refresh: <><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" /><path d="M19.5 4v3.5H16" /></>,
  check: <path d="M5 13l4 4L19 7" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  chevron: <path d="M6 9.5l6 6 6-6" />,
  download: <><path d="M12 4v10" /><path d="M8 10.5l4 4 4-4" /><path d="M5 19.5h14" /></>,
  undo: <><path d="M9 14.5L4.5 10 9 5.5" /><path d="M4.5 10h9a6 6 0 0 1 0 12H10" /></>,
  key: <><circle cx="8" cy="15" r="3.8" /><path d="M10.8 12.2L20 3" /><path d="M16 4.5l3 3" /></>,
  alert: <><path d="M12 4l9 16H3l9-16z" /><path d="M12 10.5v4" /><circle cx="12" cy="17.2" r="0.4" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5" /><path d="M12 7.8h.01" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  file: <><path d="M7 3.5h7l4 4v13H7z" /><path d="M14 3.5v4h4" /></>,
  logo: <><path d="M5 9h9.5" /><path d="M13 5.5L16.5 9 13 12.5" /><path d="M19 15H9.5" /><path d="M11 11.5L7.5 15l3.5 3.5" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  plug: <><path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" /><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" /></>,
  tag: <><path d="M12.6 2.6a2 2 0 0 0-1.4-.6H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4Z" /><circle cx="7.5" cy="7.5" r="1" /></>,
  layers: <><path d="m12.8 2.2a2 2 0 0 0-1.7 0L2.6 6.1a1 1 0 0 0 0 1.8l8.6 3.9a2 2 0 0 0 1.7 0l8.6-3.9a1 1 0 0 0 0-1.8Z" /><path d="m22 17.7-9.2 4.1a2 2 0 0 1-1.7 0L2 17.7" /><path d="m22 12.7-9.2 4.1a2 2 0 0 1-1.7 0L2 12.7" /></>,
  star: <path d="M11.5 3.2a.6.6 0 0 1 1 0l2.4 4.9 5.4.8a.6.6 0 0 1 .3 1l-3.9 3.8.9 5.4a.6.6 0 0 1-.9.6l-4.8-2.5-4.8 2.5a.6.6 0 0 1-.9-.6l.9-5.4-3.9-3.8a.6.6 0 0 1 .3-1l5.4-.8Z" />,
  box: <><path d="M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.4 3.2" /><path d="M6.5 6.6C3.9 8.3 2.5 12 2.5 12S6 18.5 12 18.5c1.8 0 3.3-.5 4.6-1.3" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /><path d="M3 3l18 18" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.4-4.4" /></>,
  sparkles: <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
};

export function Icon({ name, size = 16, style, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }} className={className}>
      {ICONS[name]}
    </svg>
  );
}

/* ---------------- 工具 ---------------- */
export function fmtK(n) {
  if (n == null) return '—';
  return n >= 1000 ? Math.round(n / 1000) + 'K' : String(n);
}

export function fmtAgo(iso) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return '刚刚';
  if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
  if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
  return Math.floor(s / 86400) + ' 天前';
}

export const PLAN_LABEL = { free: 'Free', plus: 'Plus', pro: 'Pro', team: 'Team', business: 'Business', edu: 'Edu' };
export const planLabel = (p) => p ? (PLAN_LABEL[p] || p.toUpperCase()) : null;

/* ---------------- 加载指示 ---------------- */
export function Spinner({ size = 14, color }) {
  return <span className="spinner" style={{ width: size, height: size, borderColor: color || undefined }} />;
}

/* ---------------- 自定义下拉(深色主题 + 键盘导航) ---------------- */
export function Select({ value, onChange, options, placeholder = '请选择…', disabled, emptyText = '暂无选项', style }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (open) setHi(Math.max(0, options.findIndex(o => o.value === value)));
  }, [open]); // eslint-disable-line

  const selected = options.find(o => o.value === value);
  const pick = (v) => { onChange(v); setOpen(false); };

  const onKey = (e) => {
    if (!open && (e.key === 'Enter' || e.key === 'ArrowDown')) { setOpen(true); e.preventDefault(); return; }
    if (!open) return;
    if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'ArrowDown') { setHi(h => Math.min(h + 1, options.length - 1)); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { setHi(h => Math.max(h - 1, 0)); e.preventDefault(); }
    else if (e.key === 'Enter' && options[hi]) { pick(options[hi].value); e.preventDefault(); }
  };

  return (
    <div className={'rs-select' + (open ? ' open' : '') + (disabled ? ' disabled' : '')} ref={ref} style={style} tabIndex={disabled ? -1 : 0} onKeyDown={onKey}>
      <button type="button" className="rs-select-btn" disabled={disabled} onClick={() => setOpen(o => !o)}>
        {selected ? (
          <span className="rs-select-label">
            {selected.label}
            {selected.desc && <span className="rs-select-desc">{selected.desc}</span>}
          </span>
        ) : <span className="rs-select-ph">{placeholder}</span>}
        <Icon name="chevron" size={14} className={'rs-select-chev' + (open ? ' up' : '')} />
      </button>
      {open && (
        <div className="rs-select-pop">
          {options.length === 0 && <div className="rs-select-empty">{emptyText}</div>}
          {options.map((o, i) => (
            <div key={o.value} className={'rs-select-opt' + (o.value === value ? ' sel' : '') + (i === hi ? ' hi' : '')}
                 onMouseEnter={() => setHi(i)} onClick={() => pick(o.value)}>
              <span className="rs-select-label">
                {o.label}
                {o.desc && <span className="rs-select-desc">{o.desc}</span>}
              </span>
              {o.value === value && <Icon name="check" size={13} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- 模态框 ---------------- */
export function Modal({ open, title, onClose, children, footer, width = 460, bare }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  if (bare) {
    return (
      <div className="modal-mask" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}>
        <div className="modal" style={{ width }}>
          {children}
        </div>
      </div>
    );
  }
  return (
    <div className="modal-mask" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}>
      <div className="modal" style={{ width }}>
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={15} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------------- 确认框 ---------------- */
export function Confirm({ open, title, message, confirmLabel = '确认', danger, busy, onCancel, onConfirm }) {
  return (
    <Modal open={open} title={title} onClose={busy ? undefined : onCancel} width={420}
      footer={<>
        <button className="btn" onClick={onCancel} disabled={busy}>取消</button>
        <button className={'btn ' + (danger ? 'btn-danger-solid' : 'btn-primary')} onClick={onConfirm} disabled={busy}>
          {busy ? <><Spinner size={12} /> 处理中…</> : confirmLabel}
        </button>
      </>}>
      <div className="confirm-msg">
        {danger && <Icon name="alert" size={20} className="confirm-icon" />}
        <div>{message}</div>
      </div>
    </Modal>
  );
}

/* ---------------- 空状态 ---------------- */
export function Empty({ icon = 'info', title, hint, action }) {
  return (
    <div className="empty">
      <Icon name={icon} size={26} className="empty-icon" />
      <div className="empty-title">{title}</div>
      {hint && <div>{hint}</div>}
      {action}
    </div>
  );
}

/* ---------------- 表单行 ---------------- */
export function Field({ label, hint, children }) {
  return (
    <div className="field">
      <div className="field-label">{label}{hint && <span className="field-hint">{hint}</span>}</div>
      {children}
    </div>
  );
}

export function Toggle({ on, onChange, disabled }) {
  return <div className={'switch-toggle' + (on ? ' on' : '') + (disabled ? ' disabled' : '')}
              onClick={() => !disabled && onChange(!on)} />;
}
