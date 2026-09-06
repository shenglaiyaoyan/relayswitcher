import React from 'react';
import { Icon } from './ui.jsx';

/** 自绘标题栏:可拖拽,双击最大化,右侧窗口控制按钮(按 Superdesign 设计稿对齐) */
export default function TitleBar({ title }) {
  return (
    <div className="titlebar">
      <div className="tb-brand">
        <Icon name="logo" size={15} style={{ color: 'var(--gold)' }} />
        <span className="tb-name">{title}</span>
        <span className="tb-ver">v2.0</span>
      </div>
      <div className="tb-controls">
        <button className="tb-btn min" title="最小化" onClick={() => window.rs.windowMinimize()}>
          <svg width="11" height="11" viewBox="0 0 11 11"><path d="M1 5.5h9" stroke="currentColor" strokeWidth="1.1" /></svg>
        </button>
        <button className="tb-btn max" title="最大化/还原" onClick={() => window.rs.windowMaximize()}>
          <svg width="10" height="10" viewBox="0 0 11 11"><rect x="1.5" y="1.5" width="8" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.1" /></svg>
        </button>
        <button className="tb-btn tb-close" title="关闭" onClick={() => window.rs.windowClose()}>
          <svg width="11" height="11" viewBox="0 0 11 11"><path d="M1.5 1.5l8 8M9.5 1.5l-8 8" stroke="currentColor" strokeWidth="1.1" /></svg>
        </button>
      </div>
    </div>
  );
}
