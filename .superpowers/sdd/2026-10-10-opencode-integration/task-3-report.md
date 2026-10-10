# Task 3 报告 — 导航重构(侧边栏五项 + Dashboard 改名 ChatGPT + Settings 拆分)

**状态:** 完成 | **提交:** `531932f`(main)| **验证:** `npx vite build` ✓ + `node lint-imports.js` ALL_CLEAN ✓ + `npm run smoke` 39/39 ✓

## 备注

brief 文件 `task-3-brief.md` 不存在(sdd 目录里只有 task-1-brief.md),按任务指令摘要实现。

## 变更(5 文件,+95/−28)

### src/App.jsx
- `NAV` 改五项:`ChatGPT(dash) / OpenCode(opencode, bolt 图标) / 中转站 / 备份 / 设置`;accounts 移出侧边栏但保留在 `VALID_PAGES`(Dashboard 的 👤 按钮、状态卡、`#accounts` hash 直达仍可用)
- hash 解析提取为模块级 `parseHash()`:返回 `{page, subMode}`;`#settings-chatgpt` → subMode `chatgpt`,`#settings-opencode` → `opencode`,其余(含 `settings-demo-*`)→ `global`;初始 state 与 `hashchange` 监听共用
- 新增 `goto(target)` 统一跳转(useCallback):识别 `settings-chatgpt` / `settings-opencode` 直达子模式;每次跳转用 `history.replaceState` 把 hash 同步为目标串(普通跳转重置为 `#<page>`,不触发 hashchange)—— 否则残留的 `#settings-chatgpt` 会让 Dashboard ⚙ 按钮二次点击时因 hash 未变而失效
- nav 项、live-pill、「关于与更新」按钮、Dashboard 的 `goto` prop 全部切到 `goto`;渲染区加 `{page === 'opencode' && <OpenCode state refresh toast />}`(占位页忽略 props,为 Task 4 预留),Settings 渲染传 `mode={pageSubMode || 'global'}`

### src/pages/Dashboard.jsx
- 页头 `<h1>仪表盘</h1>` → `<h1>ChatGPT</h1>`(sub 保持 Dashboard)
- 页头加两个 `.header-icon-btn`(24px):👤 `goto('accounts')`、⚙ `goto('settings-chatgpt')`,位于 home 路径与刷新按钮之间

### src/pages/Settings.jsx
- 新增 `mode` prop(默认 `global`);全部 hooks 保持无条件调用,仅 JSX 按条件渲染
- `chatgpt` = 六张专属卡:Codex 主目录 / Provider 标识 / 清理 provider 区块 / 模型目录(含自定义模型 Modal)/ 切换默认值 / 工作原理
- `global` = 桌面集成 + About & Update(关于与更新)
- `opencode` = 占位卡(「即将上线(Task 4 实现)」)
- 保存行在 global 与 chatgpt 都渲染(两种模式都有可编辑表单字段,save() 本就整包提交);opencode 不渲染
- 页头按 mode 加 `ChatGPT` / `OpenCode` 金色徽标

### src/pages/OpenCode.jsx(新建)
- 任务给定的最小占位页:标题 + 空状态文字,Task 4 重写;保证本任务 import 链可构建

### src/styles.css
- 新增 `.header-icon-btn`(24px,视觉同 `.icon-btn` 缩小版:transparent border、txt-3 → hover txt-1 + glass)

## 验证
- `npx vite build`:39 modules ✓
- `node lint-imports.js`:ALL_CLEAN(OpenCode.jsx 的 Icon import 合规)
- `npm run smoke`:39 passed, 0 failed —— 冒烟只测后端落盘(config.toml/auth.json/备份回滚),不含前端路由断言,路由改动无影响;`--capture` 模式仅设置 hash,与 parseHash 兼容

## 顾虑 / 给 Task 4 的接口
1. **路由约定:** OpenCode 页 key 为 `opencode`;Settings 子模式经 `#settings-chatgpt` / `#settings-opencode` 或 `goto('settings-…')` 进入;跳转一律用 App 传下的 `goto`(勿直接 `setPage`/裸改 hash,会绕过 subMode 同步)
2. Settings `opencode` 模式目前是占位卡,Task 4 若需要 OpenCode 专属设置卡可直接填充该分支
3. `settings-demo-update` 等 demo hash 仍解析为 global 模式,截图管线不受影响;但 demo-update 相关的 About 卡现在只在 global 模式渲染,截图时无需变(默认即 global)
4. Dashboard h1 从「仪表盘」改为「ChatGPT」是对「Dashboard 改名 ChatGPT」的解读(侧边栏标签 + 页头同步);若只想改侧边栏,恢复 h1 一行即可
5. 保存行在 global 模式下保存的是整包 settings(含 chatgpt 模式隐藏的字段,值来自初始 form 快照)—— 与既有 save() 语义一致,无回归
