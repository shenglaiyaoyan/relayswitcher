# RelaySwitcher 中转站切换器 — Design System

## Product Context

**产品**:RelaySwitcher(中转站切换器)— 一个 Electron 桌面应用(约 1280×800 窗口),面向使用 Codex 类 AI 编程客户端的开发者。它是一个**控制面板,不是落地页**:侧边栏导航、状态优先的仪表盘、表单编辑器。

**核心任务(JTBD)**:开发者希望把「账号登录态」和「流量出口」解耦自由组合——用真实 OAuth 账号保持客户端订阅功能(快速模式、完整思考档位),同时把实际 API 流量指向自建中转站;并能一键切换、一键回滚,全程带自动备份。

**核心能力**:
1. **账号库 (Account Vault)**:导入/管理多个 OAuth 账号(粘贴 Sub2API JSON 或 auth.json),解码显示邮箱与套餐(Free/Plus/Pro 徽章)、token 有效期;本地加密存储
2. **中转站库 (Relay Stations)**:管理多个中转站配置(名称、base_url、API Key 脱敏、wire 协议),一键连通性测试(/v1/models 探活 + 延迟)
3. **一键切换 (One-Click Switch)**:选定 账号 + 中转站 + 模型 + 上下文窗口 → 自动备份当前 auth.json / config.toml → 写入新配置(登录态 + provider 指向中转站 + model_catalog_json + service_tier=priority)→ 完成绑定
4. **备份回滚 (Backups)**:每次切换前自动快照,时间线展示,任意回滚

**关键页面**:
- 仪表盘(首页):当前绑定状态总览 + 一键切换工作流 + 快速回滚
- 账号管理:账号卡片列表 + 导入
- 中转站管理:中转站卡片列表 + 连通性测试
- 备份历史:快照时间线 + 回滚

**界面语言**:简体中文(技术名词如 base_url、OAuth、token 保留英文)。

## Visual Direction — Neural Noir (adapted to utility UI)

黑金暗色驾驶舱风格,高端、克制、精密仪器感。

### 色彩
- 背景:`#0a0a0a`,叠加 32px 间距径向点阵网格(白色 8% 不透明度)
- 强调色(金色系,严格禁用蓝紫渐变):
  - Base Gold `#a78b71`
  - Light Gold `#c9b8a0`
  - Hover Gold `#e8d5b7`
- 状态色(仅用于状态语义):成功 `#4ade80`、警告 `#fbbf24`、危险 `#f87171`
- 文本:主 `#f5f5f4`、次 `#a8a29e`、弱 `#78716c`

### 字体
- 'Playfair Display' Italic 仅用于产品名/页面大标题
- **'Inter'(300–700)承担全部 UI 文本**;小号大写标签 11px、letter-spacing 0.08em、gray-400

### 卡片与表面
- 玻璃拟态:`rgba(255,255,255,0.03)` 背景,`backdrop-filter: blur(10px)`,边框 `1px solid rgba(255,255,255,0.1)`,圆角 16–24px
- 悬停:边框提亮、图标 scale(1.1)
- 中央辉光 `box-shadow: 0 0 100px rgba(167,139,113,0.2)` 仅用于焦点元素

### 动效
- 过渡 `cubic-bezier(0.4,0,0.2,1)`;LIVE 指示器用 8px 绿点 + 脉动
- SVG 神经连接线(切换面板装饰):stroke 渐变 `#c9b8a0→#a78b71`,透明度 0.4–0.7 脉动;次级虚线 `stroke-dasharray: 5 15` 表现数据流

### 语义状态
- 「切换中…」:大按钮金色脉动 + 下方单步进度日志(等宽 12px)
- 成功:金色边框闪烁 + 状态转 LIVE 绿;失败:红色边框 + 错误日志行

## Layout Architecture

- **左侧边栏(220px)**:产品名 "RelaySwitcher"(Playfair Italic)、导航(仪表盘 / 账号 / 中转站 / 备份 / 设置,图标+文字,选中项金色左边框+金字);底部核心状态 Pill(LIVE 绿脉动 / 未绑定灰)
- **仪表盘**:顶部玻璃状态卡行(当前账号+套餐徽章、当前中转站+延迟、当前模型、快速模式/上下文窗口);中央大「一键切换」操作面板(账号→中转站→模型 三段选择器 + 大按钮,神经节点 SVG 装饰);底部最近备份条 + 一键回滚
- **账号页**:卡片网格(邮箱、套餐徽章、token 过期、绑定中转站 chip、🔒 加密徽章)+ 右侧导入抽屉(粘贴 JSON / 选择文件)
- **中转站页**:卡片列表(名称、base_url、Key 脱敏、延迟徽章、测试按钮)+ 编辑表单
- **备份页**:垂直时间线(时间、触发原因、包含文件 chips)+ 回滚按钮
