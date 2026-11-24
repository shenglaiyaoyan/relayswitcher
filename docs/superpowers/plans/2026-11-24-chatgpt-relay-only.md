# ChatGPT 页 · 仅中转站（无账号）切换模式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 RelaySwitcher 的 ChatGPT（Codex）页支持不绑定 ChatGPT 账号、仅通过中转站完成一键切换，并在 UI 与状态卡片里清晰区分无账号模式与桌面版无 Fast 限制。

**Architecture:** `electron/lib/codex.js` 扩展 `patchProviderBlock` / `applySwitch` / `getStatus` 支持 `requiresOpenaiAuth = false` 且不触碰 `auth.json`；`electron/main.js` 的 `doSwitch` 识别 `accountId === '__none__'` 跳过账号读取与 token 预刷新；`src/pages/Dashboard.jsx` 在「账号」下拉首位加入「不绑定账号 · 仅中转站」并在「当前状态」卡片识别 `requiresOpenaiAuth === false` 状态。

**Tech Stack:** Node.js (`node:test`)、React 18、Vite、Electron 33。

---

### Task 1: `codex.js` 底层支持无账号（仅中转）切换与状态识别

**Files:**
- Modify: `electron/lib/codex.js`
- Test: `test/relay-only-switch.test.js`

- [ ] **Step 1: 编写失败测试 `test/relay-only-switch.test.js`**
  覆盖：
  1. `patchProviderBlock` 默认写 `requires_openai_auth = true`，传入 `requiresOpenaiAuth: false` 时写 `requires_openai_auth = false`。
  2. 空目录（无 `auth.json`）调用 `applySwitch({ account: null, ... })` 成功：`config.toml` 写入 `requires_openai_auth = false` 与 `experimental_bearer_token`，未创建 `auth.json`，日志含 `写入登录态（跳过）`，`getStatus` 返回 `requiresOpenaiAuth: false`。
  3. 已有 `auth.json` 时调用 `applySwitch({ account: null, ... })`：`auth.json` 字节级保持原样，再切回带 `account` 时恢复 `requires_openai_auth = true` 且 `getStatus` 返回 `requiresOpenaiAuth: true`。
  4. 无账号模式下兼容模式 `baseUrlOverride` 照常生效。

- [ ] **Step 2: 运行单测确认失败**
  Run: `node --test test/relay-only-switch.test.js`
  Expected: FAIL。

- [ ] **Step 3: 实现 `electron/lib/codex.js`**
  修改 `patchProviderBlock`、`applySwitch`、`getStatus`。

- [ ] **Step 4: 运行全量单测确认通过并提交**
  Run: `node --test test/*.test.js`
  Expected: PASS。

---

### Task 2: 主进程 `doSwitch`、自检场景 G 与 `Dashboard.jsx` 界面接入

**Files:**
- Modify: `electron/main.js`
- Modify: `src/pages/Dashboard.jsx`
- Modify: `src/styles.css`
- Test: `test/chatgpt-ui.test.js`

- [ ] **Step 1: 在 `test/chatgpt-ui.test.js` 新增失败测试**
  断言：
  - `Dashboard.jsx` 包含 `NO_ACCOUNT`、`不绑定账号 · 仅中转站`、`已绑定 · 仅中转`、`requiresOpenaiAuth === false`、`cg-acct-hint`。
  - `electron/main.js` 的 `doSwitch` 支持 `accountId === '__none__'` 跳过账号读取与 token 刷新。
  - `styles.css` 包含 `.cg-acct-hint` 且全部按钮类具备 `background` 与 `border`。

- [ ] **Step 2: 运行 UI 单测确认失败**
  Run: `node --test test/chatgpt-ui.test.js`
  Expected: FAIL。

- [ ] **Step 3: 实现 `electron/main.js`、`src/pages/Dashboard.jsx` 与 `src/styles.css`**
  - `electron/main.js`：`doSwitch` 支持无账号；`runSmokeTest` 新增场景 G（无账号切换验证）。
  - `src/pages/Dashboard.jsx`：下拉首项、提示行、无账号可切换、右侧状态卡片识别仅中转模式、步骤 2 文案适配、`#dash-demo-filled-relayonly`。
  - `src/styles.css`：新增 `.cg-acct-hint` 样式。

- [ ] **Step 4: 运行全量单测、导入检查与前端构建并提交**
  Run: `node --test test/*.test.js && node lint-imports.js && npx vite build`
  Expected: PASS。

---

### Task 3: 隔离截图核验、真机 `codex.exe` 核验与打包发布 v1.21.0

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 隔离 Electron 截图核验（含 `-bottom`）**
  抓取 `dash-demo-filled-relayonly` 与 `dash-demo-filled-relayonly-bottom` 并目视检查。

- [ ] **Step 2: 升版 `v1.21.0`，运行 `npm.cmd run dist` 并核验 `RELEASE_VERIFIED` 与 ASAR**

- [ ] **Step 3: 发布 GitHub Release `v1.21.0` 并核验 `latest`、标题与三资产哈希一致**
