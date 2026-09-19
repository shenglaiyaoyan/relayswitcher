# extractable-components.md — 可提取组件菜单

## Layout Components
### AppShell
- Source: `src/App.jsx`
- Category: layout
- Description: 标题栏 + 224px 玻璃侧边栏(品牌区/NAV/live-pill/更新提示)+ 主滚动区 + toast 的整页外壳
- Extractable props: activePage (string, default: "dash"), wired (boolean), updateStatus (string)
- Hardcoded: NAV 五项图标与文字、品牌 wordmark、Neural Noir 配色

### TitleBar
- Source: `src/components/TitleBar.jsx`
- Category: layout
- Description: 38px 自绘拖拽标题栏,右侧最小化/最大化/关闭窗控
- Extractable props: title (string)
- Hardcoded: logo 图标、"v2.0" 版本徽标、窗控 SVG

### SidebarNavItem
- Source: `src/App.jsx`(NAV 数组渲染处)
- Category: layout
- Description: 侧边栏导航项,active 态金色 + 左侧金条
- Extractable props: active (boolean), label (string), iconName (string)
- Hardcoded: 圆角/字号/过渡

## Basic Components
### GlassCard
- Source: `src/styles.css` `.card` + 各页使用
- Category: basic
- Description: 玻璃拟态卡片容器(blur 10px,18px 圆角,hover 边框提亮)
- Extractable props: clickable (boolean), flashOk (boolean)
- Hardcoded: 内边距 20px 24px

### StatusCard
- Source: `src/pages/Dashboard.jsx` 状态卡行
- Category: basic
- Description: klabel 小标 + 主值 + 副行徽章的统计卡
- Extractable props: label (string), value (string), badges (ReactNode), onClick
- Hardcoded: 四列 grid 布局由父级 stat-row 决定

### GoldBadge / StateBadge
- Source: `src/components/ui.jsx` 样式类 `.badge.gold/.ok/.warn/.bad`
- Category: basic
- Description: 999px 药丸徽章,四色语义变体
- Extractable props: tone ("gold"|"ok"|"warn"|"bad"), text
- Hardcoded: 字号 10.5px、字重 600

### PrimaryButton / GoldButton
- Source: `.btn-primary / .btn-gold` 样式类
- Category: basic
- Description: 白底黑字主按钮( hover 变金)/ 金边玻璃次按钮
- Extractable props: size ("sm"|"md"), busy (boolean)
- Hardcoded: 圆角 11px、字重 600

### Toggle
- Source: `src/components/ui.jsx`
- Category: basic
- Description: 38×21 金色开关药丸
- Extractable props: on (boolean), disabled (boolean)
- Hardcoded: on 态金色发光

### StepFlow
- Source: `src/pages/Dashboard.jsx` 切换面板
- Category: basic
- Description: 三步选择器(编号 Playfair 斜体 + 步骤间金色渐变连线)
- Extractable props: steps (array), activeValues
- Hardcoded: 三列等分 grid

### StreamLog
- Source: `src/pages/Dashboard.jsx` logbox
- Category: basic
- Description: 黑底等宽终端风流式步骤日志(✓/✗ 前缀,金色字段名,光标闪烁)
- Extractable props: entries (array of {name, ok, detail})
- Hardcoded: JetBrains Mono 12px

### WarnModal
- Source: `src/pages/Dashboard.jsx` + `.warn-*` 样式
- Category: basic
- Description: 警告模态(48px 图标框 + 大标题 + 大写副标题 + info 内嵌卡),bare 模式 Modal
- Extractable props: open, title, subtitle, body, actions (ReactNode)
- Hardcoded: 琥珀 warn 色系
