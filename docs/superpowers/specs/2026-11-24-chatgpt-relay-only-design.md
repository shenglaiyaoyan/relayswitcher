# ChatGPT 页 · 仅中转站（无账号）切换模式 — 设计规格

日期：2026-11-24 · 状态：用户已确认（预览稿 `designs/chatgpt-relay-only-mockup.html`）

## 背景与实测结论

此前 RelaySwitcher 的 ChatGPT 页强依赖选择「账号 + 中转站」，固定写入 `requires_openai_auth = true` 并覆盖 `auth.json` 的 OAuth tokens，用于让 Codex 桌面版显示 Fast / Ultra Fast 速度档。

2026-11-24 本机实测（`codex.exe 0.167.0-alpha.3.2` + `OpenAI.Codex 26.1117.4957.0`）：
- **可用性**：当 `[model_providers.<id>]` 写 `requires_openai_auth = false` + `experimental_bearer_token = "<中转Key>"` 时，Codex CLI 与桌面版（`requiresOpenaiAuth && type !== "chatgpt" && type !== "apiKey"`）均可跳过 ChatGPT 登录直接使用，即使磁盘上不存在 `auth.json` 或存在旧 OAuth `auth.json`，Codex 也会完全忽略 `auth.json` 并直接向中转站发送 `Authorization: Bearer <中转Key>`（不带 `chatgpt-account-id`）。
- **Fast / Ultra Fast 边界**：Codex CLI 实测可正常在请求体发送 `service_tier = "priority"`（支持 `/fast`）；Codex 桌面版前端将速度档控件白名单限定为 `chatgpt` / `personalAccessToken` / `amazonBedrock`，无账号模式下桌面版不显示 Fast / Ultra Fast 开关且会忽略 `config.toml` 的 `service_tier`。

## 目标

允许用户在 ChatGPT 页选择「不绑定账号 · 仅中转站」完成一键切换（即使账号库为空），零侵入现有 `auth.json`，并在界面明确说明桌面版无 Fast 的边界。

## 设计

### 1. 底层写入与状态读取（`electron/lib/codex.js`）
- `patchProviderBlock(text, providerId, fields, opts)`：支持 `fields.requiresOpenaiAuth`（默认 `true`，仅显式 `false` 时写 `requires_openai_auth = false`）。
- `applySwitch(opts)`：
  - `hasAccount = !!(opts.account && opts.account.tokens)`。
  - 传入 `requiresOpenaiAuth: hasAccount`。
  - `!hasAccount` 时：跳过账号变更检测，不生成也不写入/删除 `auth.json`，步骤上报 `写入登录态（跳过）`（匹配现有 `pipeline.mjs` 第 2 步 `name.startsWith('写入登录态')`），写后复查跳过 `auth.json` 解析并校验 `prov.requires_openai_auth === hasAccount`。
- `getStatus(home)`：读取当前 provider 的 `requires_openai_auth` 写入 `status.requiresOpenaiAuth`（provider 存在时为布尔 `prov.requires_openai_auth === true`，否则为 `null`）。

### 2. 主进程接线（`electron/main.js`）
- `doSwitch(opts)`：将 `!opts.accountId || opts.accountId === '__none__'` 识别为无账号模式（`account = null`），跳过 `store.getAccount` 与 `refreshAccount` 预刷新，将 `account: null` 传给 `codex.applySwitch`。
- 自检（`runSmokeTest`）新增场景 G：验证无账号切换写入 `requires_openai_auth = false`、原 `auth.json` 字节未变、以及无 `auth.json` 目录切换成功。

### 3. 前端界面（`src/pages/Dashboard.jsx`、`src/styles.css`）
- 常量 `NO_ACCOUNT = '__none__'`。
- 「账号」下拉框始终可选（仅 `switching` 时禁用），首位固定包含 `{ value: '__none__', label: '不绑定账号 · 仅中转站', desc: '不写 auth.json · 桌面版无 Fast' }`，后面紧接已导入账号列表。
- 初始回显：若当前 Codex 配置为仅中转模式（`status.baseUrl && status.requiresOpenaiAuth === false`）或账号库为空，默认选中 `NO_ACCOUNT`；否则选中当前激活账号或第一个账号。
- 选中 `NO_ACCOUNT` 时，下拉下方显示一行小字提示：`仅写入中转站配置（不修改 auth.json）。CLI 可用 /fast；Codex 桌面版不显示 Fast / Ultra Fast 开关。`
- 「立即切换」按钮禁用条件改为 `switching || !relayId || !relays.length`（不再因 `!accounts.length` 禁用）。
- 右侧「当前状态」卡片：
  - `statusRelayOnly = !!(status.baseUrl && status.requiresOpenaiAuth === false)`。
  - `wired = statusRelayOnly ? !!status.activeRelay : !!(status.activeAccount && status.activeRelay)`。
  - 仅中转态时：顶部徽章显示 `已绑定 · 仅中转`；「登录态」区显示 `模式：仅中转站（无账号）· 无 OAuth` 与 `说明：CLI 可用 /fast · 桌面版无 Fast 按钮`，不误报红点未登录或过期 token。
- 切换流程第 2 步标签在 `accountId === NO_ACCOUNT`（或日志含 `写入登录态（跳过）`）时展示 `登录态(跳过)`。
- 兼容 demo hash `#dash-demo-filled-relayonly` 便于隔离截图核验。
