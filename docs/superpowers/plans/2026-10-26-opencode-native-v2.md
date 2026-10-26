# OpenCode 原生 V2 写入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RS 保存的 OpenCode provider 全部为原生 V2，避免 V1/V2 混用导致 compatibility 被忽略。

**Architecture:** 保留现有 RS store/UI 数据结构，在 opencode.js 的写入边界统一迁移。
`mergeProviderBlock` 负责 provider 容器迁移，`modelsToBlocks` 负责模型与 variants 的
V2 输出；不在本次修改实际用户配置。

**Tech Stack:** Node.js 纯函数、Electron IPC、node:test、Vite、electron-builder。

---

### Task 1: 用测试锁定原生 V2 迁移

**Files:**
- Modify: `test/opencode.test.js`

- [ ] **Step 1: 写失败测试**

新增一个 legacy Pulse provider，含 `compatibility.supportsThinkingBlockBinding=false`
和对象 variants。调用现有 `providerBlockToRS` 后，将 RS models 数组交给
`mergeProviderBlock`。断言结果在 `providers.Pulse`，旧 `provider.Pulse` 被移除，
compatibility 保留，variants 为数组，且不包含旧 reasoning/attachment 字段。

- [ ] **Step 2: 验证测试因尚未迁移而失败**

Run: `node --test test/opencode.test.js`
Expected: 新测试失败，当前结果仍落在 `provider.Pulse`，或 variants 仍为对象。

- [ ] **Step 3: 将新行为提交前不提交失败测试**

保留失败测试供 Task 2 驱动实现，不修改生产代码来绕过断言。

### Task 2: 实现 provider 和模型的 V2 写入

**Files:**
- Modify: `electron/lib/opencode.js`
- Modify: `electron/main.js`
- Test: `test/opencode.test.js`

- [ ] **Step 1: 迁移 provider 容器**

`mergeProviderBlock` 读取同 id 的旧 `provider` 或新 `providers` 块作为基础，保留未建模
字段，然后统一写 `providers[id] = { package, name, settings, models }`，删除该 id 的
旧 `provider` 块。其他未被编辑的 provider 不动。

- [ ] **Step 2: 迁移模型**

`modelsToBlocks` 只输出 V2：不再输出旧 reasoning/attachment/temperature 字段；
对象 variants 转成 `{ id, settings }` 数组，已有数组保持原样；capabilities 与
rawExtra/compatibility 保留。modelID 若与键名不同，沿用 rawExtra 中的原值。

- [ ] **Step 3: IPC 传入 RS 原始模型数组**

`rs:oc:save` 将 `p.models` 交给 `mergeProviderBlock`，由同一入口统一转换，避免
调用方提前按旧 shapeHint 生成混合格式。

- [ ] **Step 4: 更新旧格式断言**

原先要求“旧文件写旧格式”的两个测试，按用户已确认的统一 V2 决策改为断言
`providers` 和数组 variants。新增测试必须保持原断言语义，不能靠删除兼容性断言变绿。

- [ ] **Step 5: 运行测试**

Run: `node --test test/opencode.test.js`
Expected: 全部通过；随后运行所有 `test/*.test.js`，无失败。

### Task 3: 用临时配置验证 OpenCode 归一化

**Files:**
- Create: 临时目录中的验证脚本（不提交）

- [ ] **Step 1: 复制实际配置到临时 HOME**

仅在临时目录读取实际配置副本，经 `providerBlockToRS` 和 `mergeProviderBlock`
迁移 Pulse，确认 compatibility 保留。

- [ ] **Step 2: 用 OpenCode debug config 检查**

在隔离的临时配置环境运行 OpenCode 2.1.4 `debug config`，确认 Pulse 位于
`providers`，模型含 `compatibility.supportsThinkingBlockBinding=false`，variants
是数组。不得改写真实 `~/.config/opencode/opencode.jsonc`。

### Task 4: 构建、打包和发布

**Files:**
- Modify: `package.json`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 验证**

Run: `npx vite build`、`npx electron . --smoke`、全量 `node --test`。
Expected: 构建成功，39 项 smoke 通过，全部单测通过。

- [ ] **Step 2: 提交**

提交 opencode.js、main.js、测试、设计/计划文档、版本号和 CHANGELOG。

- [ ] **Step 3: 打包**

依次运行 `npx electron-builder --win nsis`、`scripts/patch-icon.ps1`、
`npx electron-builder --win nsis --prepackaged release/win-unpacked`。

- [ ] **Step 4: 发布并验证**

Release 同时上传 Setup exe、blockmap、`latest.yml`；检查 latest 下载地址、版本号、
exe 图标和 FileVersion。
