---
name: Neural Noir
colors:
  background: '#0a0a0a'
  on-background: '#f5f5f4'
  surface: '#111110'
  surface-container: '#161513'
  surface-container-high: '#1c1b19'
  on-surface: '#f5f5f4'
  on-surface-variant: '#a8a29e'
  outline: '#2c2a27'
  outline-variant: '#464240'
  primary: '#a78b71'
  on-primary: '#0a0a0a'
  primary-container: '#2b241d'
  on-primary-container: '#e8d5b7'
  secondary: '#c9b8a0'
  tertiary: '#e8d5b7'
  error: '#f87171'
  on-error: '#0a0a0a'
  success: '#4ade80'
  warning: '#fbbf24'
  inverse-surface: '#f5f5f4'
  inverse-on-surface: '#0a0a0a'
typography:
  display:
    fontFamily: Playfair Display
    fontSize: 26px
    fontWeight: '600'
    fontStyle: italic
    lineHeight: '1.2'
  h1:
    fontFamily: Inter
    fontSize: 19px
    fontWeight: '600'
    lineHeight: '1.3'
  h2:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '600'
    lineHeight: '1.4'
  body-md:
    fontFamily: Inter
    fontSize: 13.5px
    fontWeight: '400'
    lineHeight: '1.7'
  label-md:
    fontFamily: Inter
    fontSize: 10.5px
    fontWeight: '600'
    letterSpacing: 0.15em
    lineHeight: '1.2'
  mono:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.8'
rounded:
  sm: 0.5rem
  DEFAULT: 0.625rem
  md: 0.75rem
  lg: 1.125rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
---

## Brand & Style

Neural Noir 是一个深色黑金"驾驶舱"设计系统,为桌面级开发者工具(RelaySwitcher — Codex 账号×中转站切换器)打造。个性:**克制、精密、高端仪器感**。避免花哨渐变与插画,靠材质与层级表达质感。

## Visual Language

- **玻璃拟态卡片**:surface 用 rgba(255,255,255,0.03) 半透明 + backdrop-blur,边框 rgba(255,255,255,0.1),悬停边框提亮。信息浮在点阵背景(radial dot grid, 32px 网格, 白 8%)之上。
- **金色克制使用**:primary 金(#a78b71)只用于强调 — 小号大写标签(letter-spacing 0.15em)、选中态、主按钮;大面积永远是近黑表面。
- **状态色仅作语义**:success 绿、warning 黄、error 红,只出现在徽章、圆点、边框,不做大面积填充。
- **层级**:无重阴影;用表面明度梯度(background → surface → container)与 1px 细边框分层;焦点元素可用金色柔光(box-shadow 0 0 60px rgba(167,139,113,0.2))。

## Components

- **侧边栏**(220px):顶部 Playfair Display Italic 品牌字,导航项图标+文字,选中项金色左边框+金字;底部状态胶囊(呼吸圆点+主文案+副文案)。
- **状态卡**:网格布局,顶部小号大写金色标签(如 ACCOUNT / RELAY / MODEL)+ 中文副标,主值 600 字重,次行徽章+灰字。
- **主行动按钮**:近白(#f5f5f4)实心、深色文字、全宽、13px 字距;悬停金色柔光脉动。
- **日志区**:等宽字体(JetBrains Mono),深一档背景(rgba(0,0,0,0.35)),步骤流 ✓/✗ 着色,金色步骤名。
- **徽章**:全圆角胶囊,10.5px,边框语义色 35% 透明度。
- **模态**:24px 大圆角 + blur(24px) 深毛玻璃,入场 translateY(20px) 上滑。
