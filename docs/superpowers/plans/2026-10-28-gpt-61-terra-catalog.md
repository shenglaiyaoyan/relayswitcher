# GPT-6.1 Terra 目录跟进 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Codex 0.142.5 原生 `gpt-6.1-terra` 目录同步到 RelaySwitcher，并让中转模式继承同 slug 元数据，发布 v1.14.1。

**Architecture:** 复用现有二进制目录提取和部署流程，仅替换内置快照。中转模板选择增加精确 slug 优先，随后沿用原家族与默认回退；不增加 Terra 补丁，不改变旧 Terra 退役策略。

**Tech Stack:** Node.js、node:test、Electron、Vite、electron-builder。

### Task 1: 精确模板映射与原生目录

- [x] 从 Codex 0.142.5 提取目录到隔离临时路径，确认 12 个模型与 Terra 原生参数。
- [ ] 在 `test/relay-catalog.test.js` 新增精确 slug 测试，期望 `pickTemplate('gpt-6.1-terra', available)` 返回同 slug，并在 `buildRelayCatalog` 保留 500K/872K/low/六档/priority。
- [ ] 运行该测试确认旧实现回退 Astra 而失败。
- [ ] 修改 `electron/lib/relay-catalog.js` 的 `pickTemplate`，在 `FAMILY_RULES` 前优先返回 `availableSlugs` 中存在的精确 slug。
- [ ] 用 `C:/Windows/Temp/opencode/rs-codex-01425/extracted-65ee893d55.json` 原样更新 `resources/model-catalog.json`。
- [ ] 跑目录相关单测，确认官方补丁仍只隐藏 `gpt-5.6-terra`，Terra 原生存在时不被误删。

### Task 2: 发布 v1.14.1

- [ ] 更新 `package.json` 为 1.14.1，`CHANGELOG.md` 记录真实 slug、原生参数与精确模板映射。
- [ ] 跑全量 `node --test test/*.test.js`、Vite build、`electron . --smoke`。
- [ ] 审查 diff，只提交目录、映射、测试、版本、CHANGELOG 和设计/计划文档；不混入 captures 或其他工作区文件。
- [ ] 推送 main，按既有流程打包、patch-icon、prepackaged，核验图标/版本/桌面和开始菜单快捷方式。
- [ ] 创建 v1.14.1 Release，上传 exe/blockmap/latest.yml，下载核验字节数与 SHA-512。
