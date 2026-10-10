# Task 4 报告:OpenCode 页面(Provider 管理 UI)

**状态:完成** | 提交 `ad3eea0`(main)| 测试:`vite build ✓ + lint-imports ALL_CLEAN + smoke 39/39 passed`

## 改动文件

- `src/pages/OpenCode.jsx` — 全量重写(占位版 → 完整 Provider 管理 UI)
- `src/App.jsx` — ① live-pill 空态文案「去仪表盘完成切换」→「去 ChatGPT 页完成切换」;② OpenCode 挂载处补传 `goto`(页头 ⚙ 需要,Task 3 漏传)
- `src/pages/Settings.jsx:316` — 切换默认值卡副标题「仪表盘的初始选项」→「ChatGPT 页的初始选项」
- `src/pages/Accounts.jsx:208` — 空态 hint「即可在仪表盘参与…」→「即可在 ChatGPT 页参与…」
- `src/pages/Backups.jsx:47` — 空态 hint「去仪表盘执行一次切换」→「去 ChatGPT 页执行一次切换」

## 实现内容(照抄 plan 为主,按上下文调整处见下)

- 页头与 Dashboard 同构:`h1 OpenCode + sub Providers + spacer + header-icon-btn ⚙ → goto('settings-opencode')`
- Provider 列表卡:名称/协议 badge(显示协议全称而非裸值)/模型数/默认模型 + 编辑/移除
- 新建/编辑 Modal(720 宽):中转站下拉(自定义 Select,label+baseUrl desc)、Base URL、协议三选一(chip 形态,同 Dashboard 目录选择器)、Provider ID、API Key(password,编辑态 hint「留空 = 保持不变」)、模型条目、默认模型
- 空态引导(Empty 组件):「从你的中转站库选一个站,RS 自动拉取模型清单并填入参数」
- 写入成功 toast 含「重启 opencode 生效」;`hasComments` 时追 warn「注释已丢失」;移除 toast「备份已保留」

## 对 plan 的偏差(均为必要修复或 App 惯例对齐)

1. **手动添加的模型可以填 id 了** — plan 的 ModelEntries 手动添加行只渲染 `<b>{m.id}</b>` 空文本,没有任何 id 输入,手动添加功能实际不可用。改为可编辑的 mono id 输入框(必填,空 id 行保存时被过滤,不落盘)。
2. **模型行按下标更新/删除** — plan 的 `updateModel` 按 id 定位,手动行 id 为空时会串行(多个空 id 互相覆盖/全删)。改 `updateModel(i,…)`/`removeModel(i)`,chip 勾选仍按 id。
3. **移除加 Confirm 确认框** — plan 点「移除」立即写 opencode.json + auth.json;App 全部删除操作(Relays/Accounts)均走 `Confirm` 惯例,对齐。
4. **选中转站自动拉 /v1/models** — 空态文案承诺「RS 自动拉取模型清单」,plan 只有手动按钮。现选站即自动拉(手动「拉 /v1/models」按钮保留),`fetching` 锁单飞防并发重复请求(ACT-010)。
5. **relay 自动补 id 仅限空 id** — plan 选站无条件覆盖 id,编辑已有 provider 时换站会另存新条目;现仅 `!data.id` 时补 slug(中文名 slug 为空则跳过,不写垃圾 id)。
6. **Toggle 替代裸 checkbox** — 推理开关用 ui.jsx 的 `Toggle`(任务提示「直接用」);协议 chip、原生 select 换成自定义 `Select`(App 标准,深色主题+键盘导航);Empty 组件做空态。
7. **防御性处理** — `p.models || []` 防 store 手改后崩溃;保存前过滤空 id 模型;Modal 加了 title(plan 无 title 会渲染空标题栏)。

## 顾虑(不阻塞,供 Task 5 / 后续参考)

- **API Key 不能从中转站库自动带入**:renderer 拿不到解密后的 relay key(无此 IPC),选站后仍需手粘一次 Key。要做自动带入需在 electron/ 加 IPC,超出本任务约束(不动 electron/)。
- **中文站名自动 id 为空**:slugify 后为空 → 需手填 Provider ID(保存按钮已按 `!id` 禁用兜底)。
- **编辑时清空 Key ≠ 删除 Key**:ocSave 只在 `p.apiKey` 非空时写 auth.json,清空保存后 auth.json 旧 key 保留(store 侧 apiKeyEnc 同理)。字段 hint 已标「留空 = 保持不变」。
- **Settings 的 OpenCode 专属设置仍是 Task 3 占位卡**(「即将上线(Task 4 实现)」文案残留)— 本任务约束只改四处文案,该卡片未动;页头 ⚪⚙ 跳过去看到的是占位,归属 Task 5 或后续任务填充。
- defaultModel 选项值在改 Provider ID 后不会自动重算前缀(选中值失配即回落「不设默认」),影响极小。

## 验证

- `npx vite build` ✓(39 modules,dist 产出正常)
- `node lint-imports.js` → `LINT_IMPORTS: ALL_CLEAN`
- `npm run smoke` → `SMOKE RESULT: 39 passed, 0 failed`
