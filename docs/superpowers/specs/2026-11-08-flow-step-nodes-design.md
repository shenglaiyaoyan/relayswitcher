# 切换流程节点：细环 + 金色勾（设计）

日期：2026-11-08 · 状态：用户已选方案 A（效果图 `designs/flow-steps-options.html`）

## 目标

ChatGPT 页「切换流程」五个节点去掉荧光绿实心圆，改成和黑金主题一致的细环样式。布局、文字、状态推导（`pipeline.mjs`）都不变。

## 节点样式（`.cg-step > i`）

- 尺寸 17px 圆，1px 边框，内部居中放 9px 图标；连接线位置随之对齐（top 8px，两端各留 13px）。
- 空闲 `idle`：暗环（`--line-bright`），无图标，文字 `--txt-3`。
- 进行中 `active`：金环（`--accent`）+ 3px 浅金光圈，环中心 5px 金点（CSS `::after`），文字 `--accent-strong`。不加任何循环动画。
- 完成 `done`：浅金环（`--accent-line`）+ 浅金底（`--accent-soft`）+ 浅金色勾（`--accent-strong`），文字 `--txt-1`。
- 目录回落 `warn`：黄环 + 淡黄底 + 黄色感叹号，文字黄色。
- 失败 `error`：红环 + 淡红底 + 红色叉，文字红色。
- 连接线：通向 done / active / warn / error 节点的那段为金色（`--accent-line`），通向 idle 的为暗线。

## 实现

- `Dashboard.jsx`：`<i>` 内按状态放 `Icon`（done → `check`，warn → 感叹号，error → `x`），图标用 `currentColor`，颜色由 CSS 控制。
- 感叹号：`ui.jsx` 新增 `bang` 图标（竖线 + 点），不复用带三角形的 `alert`，9px 下三角形看不清。
- `styles.css`：只改 `.cg-step*` 规则；完成态不再引用 `--ok`。

## 测试

- 源码断言：`.cg-step.done > i` 不含 `--ok`，使用 accent 变量；Dashboard 为 done / warn / error 渲染图标。
- `perf-guard` 已保证无无限动画。
- 隔离截图 `dash-demo-filled` 核对完成态外观。
