import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// 渲染层全局错误兜底:任何未捕获异常在页面上可见(带原因),而不是黑屏无声死掉
const showErrorOverlay = (msg) => {
  let el = document.getElementById('rs-error-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'rs-error-overlay';
    el.style.cssText = 'position:fixed;inset:auto 16px 16px 16px;z-index:9999;background:rgba(80,20,20,.95);color:#fca5a5;border:1px solid #f87171;border-radius:12px;padding:14px 18px;font:12px/1.7 monospace;white-space:pre-wrap;max-height:40vh;overflow:auto';
    document.body.appendChild(el);
  }
  el.textContent = '⚠ 渲染异常(复制发给维护者):\n' + msg;
};
window.addEventListener('error', (e) => showErrorOverlay((e.error && e.error.stack) || e.message));
window.addEventListener('unhandledrejection', (e) => showErrorOverlay(String(e.reason && (e.reason.stack || e.reason.message) || e.reason)));

createRoot(document.getElementById('root')).render(<App />);
