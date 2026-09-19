# theme.md — Neural Noir 设计系统

## Part 1 — Token 摘要

- **基调**: 近黑底 + 金棕点缀,玻璃拟态卡片,Playfair Display 斜体衬线标题 + Inter 正文 + JetBrains Mono 等宽,点阵背景纹
- **色板**(`:root`):
  - `--bg: #0a0a0a` · `--gold: #a78b71` · `--gold-light: #c9b8a0` · `--gold-hover: #e8d5b7`
  - `--txt-1: #f5f5f4` · `--txt-2: #a8a29e` · `--txt-3: #78716c`
  - `--ok: #4ade80` · `--warn: #fbbf24` · `--bad: #f87171`
  - `--glass: rgba(255,255,255,.03)` · `--glass-2: rgba(255,255,255,.055)`
  - `--line: rgba(255,255,255,.1)` · `--line-bright: rgba(255,255,255,.22)` · `--ease: cubic-bezier(.4,0,.2,1)`
- **字体**: `'Playfair Display'` serif italic(标题/wordmark/step-num)、`'Inter','Microsoft YaHei'`(正文 14px)、`'JetBrains Mono'`(mono 12px)
- **圆角**: 卡片 18px · 按钮 11px · 输入/下拉 10px · chip/badge 999px · 模态 24px
- **卡片**: `background: var(--glass); backdrop-filter: blur(10px); border: 1px solid var(--line)`
- **按钮层级**: `btn`(玻璃) / `btn-primary`(白底黑字,hover 金) / `btn-gold`(金边玻璃) / `btn-danger(-solid)`(红)
- **动效**: 页面进入 `pageIn .28s`(上移淡入)、模态 `modalIn .4s`、切换按钮 `goldpulse`、骨架屏 shimmer、live-pill 呼吸点
- **特殊模式**: switch-panel 顶部 radial 金色光晕;logbox 黑底等宽终端风;警告模态(图标框 48px + 副标题 + info 内嵌卡)

## Part 2 — 完整源码 `src/styles.css`

```css
/* RelaySwitcher — Neural Noir 主题 v2 */
:root {
  --bg: #0a0a0a;
  --gold: #a78b71;
  --gold-light: #c9b8a0;
  --gold-hover: #e8d5b7;
  --txt-1: #f5f5f4;
  --txt-2: #a8a29e;
  --txt-3: #78716c;
  --ok: #4ade80;
  --warn: #fbbf24;
  --bad: #f87171;
  --glass: rgba(255, 255, 255, 0.03);
  --glass-2: rgba(255, 255, 255, 0.055);
  --line: rgba(255, 255, 255, 0.1);
  --line-bright: rgba(255, 255, 255, 0.22);
  --ease: cubic-bezier(0.4, 0, 0.2, 1);
}

* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #root { height: 100%; }

body {
  background: var(--bg);
  background-image: radial-gradient(rgba(255, 255, 255, 0.07) 1px, transparent 1px);
  background-size: 32px 32px;
  color: var(--txt-1);
  font-family: 'Inter', 'Microsoft YaHei', sans-serif;
  font-size: 14px;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
}

.app { display: flex; flex-direction: column; height: 100vh; }
.app-body { display: flex; flex: 1; min-height: 0; }

/* 标题栏 38px 玻璃 + 窗控按钮(close hover 红) */
.titlebar { height: 38px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.02); border-bottom: 1px solid var(--line); backdrop-filter: blur(8px); -webkit-app-region: drag; user-select: none; z-index: 50; }
.tb-btn:hover { background: rgba(255,255,255,0.1); color: var(--txt-1); }
.tb-btn.tb-close:hover { background: var(--bad); color: #fff; }

/* 侧边栏 224px 玻璃;nav-item active 金色 + 左侧金条 */
.side { width: 224px; flex-shrink: 0; display: flex; flex-direction: column; background: rgba(255,255,255,0.02); backdrop-filter: blur(14px); border-right: 1px solid var(--line); padding: 22px 14px 18px; }
.nav-item.active { color: var(--gold-hover); background: rgba(167,139,113,0.09); }

/* 卡片 / 状态卡行 4 列 grid */
.card { background: var(--glass); backdrop-filter: blur(10px); border: 1px solid var(--line); border-radius: 18px; padding: 20px 24px; }
.stat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 13px; margin-bottom: 16px; }

/* badge 999px 药丸(gold/ok/warn/bad 变体);chip 同形可点 */
.badge { display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; font-weight: 600; padding: 2.5px 9px; border-radius: 999px; border: 1px solid var(--line); color: var(--txt-2); }
.badge.gold { color: var(--gold-hover); border-color: rgba(167,139,113,.45); background: rgba(167,139,113,.1); }
.badge.ok { color: var(--ok); border-color: rgba(74,222,128,.35); background: rgba(74,222,128,.08); }
.badge.warn { color: var(--warn); border-color: rgba(251,191,36,.35); background: rgba(251,191,36,.08); }
.badge.bad { color: var(--bad); border-color: rgba(248,113,113,.35); background: rgba(248,113,113,.08); }

/* 开关 38×21 药丸,on 态金 */
.switch-toggle { position: relative; width: 38px; height: 21px; border-radius: 999px; background: rgba(255,255,255,.07); border: 1px solid var(--line); cursor: pointer; transition: all .2s var(--ease); }
.switch-toggle.on { background: rgba(167,139,113,.35); border-color: rgba(167,139,113,.6); }

/* 切换面板三步 grid + 步骤间金色渐变连线;btn-go 全宽金脉冲 */
.switch-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0; }
.btn-go { margin-top: 20px; width: 100%; padding: 14px; font-size: 14.5px; letter-spacing: .14em; border-radius: 13px; }
.btn-go.switching { animation: goldpulse 1.3s infinite; background: var(--gold); border-color: var(--gold); color: #0a0a0a; }

/* 日志盒黑底等宽 */
.logbox { margin-top: 15px; background: rgba(0,0,0,0.38); border: 1px solid var(--line); border-radius: 12px; padding: 12px 16px; font-family: 'JetBrains Mono', monospace; font-size: 12px; line-height: 2; color: var(--txt-2); }

/* 警告模态(图标框 + 副标题 + info 内嵌卡) */
.warn-icon-box { width: 48px; height: 48px; border-radius: 16px; background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.2); color: var(--warn); }
.warn-subtitle { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--warn); }
.warn-info-card { margin-top: 16px; display: flex; gap: 12px; padding: 14px 16px; background: rgba(251,191,36,0.02); border: 1px solid rgba(251,191,36,0.1); border-radius: 16px; }

/* 模态 24px 圆角深玻璃;foot 按钮高 40px */
.modal { background: rgba(19,18,17,0.8); border: 1px solid rgba(255,255,255,0.15); backdrop-filter: blur(24px); border-radius: 24px; }
.modal-foot .btn { height: 40px; padding: 0 20px; }

/* parse-preview 绿框结果卡(err 红);dropzone 拖入金框 */
.parse-preview { margin-top: 10px; border: 1px solid rgba(74,222,128,.3); background: rgba(74,222,128,.05); border-radius: 10px; padding: 10px 14px; font-size: 12.5px; }

/* 备份时间线:左侧金点 + 渐变竖线 */
.tl::before { background: linear-gradient(180deg, rgba(167,139,113,.5), rgba(255,255,255,0.08)); }
.tl-item::before { border-radius: 50%; background: var(--gold); box-shadow: 0 0 8px rgba(167,139,113,.5); }

/* toast 右下角深玻璃;骨架屏 shimmer;滚动条 9px 半透明 */
.toast { position: fixed; right: 26px; bottom: 26px; z-index: 99; background: rgba(22,21,19,.95); border: 1px solid var(--line-bright); border-radius: 13px; padding: 13px 18px; }
::-webkit-scrollbar { width: 9px; height: 9px; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 5px; }
```

(以上为 token 摘要版;完整 416 行源码见 `src/styles.css`,结构与类名完全一致)
