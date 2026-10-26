# OpenCode 原生 V2 写入设计

日期：2026-10-26

## 问题

RS 在旧格式 `provider` 下写入了 V2 模型字段：`modelID`、`capabilities`、`settings`、
`compatibility`，同时保留旧格式对象 variants。OpenCode 2.1.4 按 provider 判定
V1/V2，单个 provider/model 内不支持混用，导致 V2 字段被整体忽略。实测
`debug config` 中 `compatibility.supportsThinkingBlockBinding` 消失，因而仍会
发送 `thinking.adaptive.block_binding`，上游拒绝。

## 决策

采用用户选择的统一升级方案：RS 管理的 provider 保存为原生 V2，不跟随旧格式继续
混写。另一个方案是写纯 V1，但无法表达 V2 兼容能力，放弃。

## 实现

- `mergeProviderBlock` 将当前 provider 迁移到顶层 `providers`，字段使用
  `package` / `settings`；从同 id 的旧 `provider` 块取出既有字段作为迁移基础。
- 该 provider 的其他旧模型一并迁移为 V2，而非只迁移正在编辑的模型，避免同一
  provider 内新旧模型混用。
- 模型统一输出 `modelID`、`capabilities`、`settings`、数组 `variants`；
  不输出旧 `reasoning`、`attachment`、`tool_call`、`modalities`。
- `rawExtra`、`settingsExtra`、`capExtra`、模型 `compatibility` 等未建模字段
  原样保留；包括 `supportsThinkingBlockBinding: false`。
- 不改变 store、UI 表单数据结构和无关 Codex 切换功能。
- 不在本次修复中修改用户正在由另一个对话处理的实际 opencode 配置。

## 验收

1. 单元测试先复现：旧 provider 中含 V2 compatibility 时，保存后归一化为 V2，
   compatibility 不再因混用而被 OpenCode 忽略。
2. 同一 provider 的旧模型全部迁移，variants 变数组；既有 capability 和
   compatibility 保留。
3. 已是 V2 的配置保持原有字段，往返不丢内容。
4. 全量单测、构建和 smoke 通过。
5. 已在临时 HOME + 独立端口 28991 用 OpenCode 2.1.4 `debug config` 验证：
   `compatibility.supportsThinkingBlockBinding=false` 进入生效模型配置，variants 为数组。
   未修改真实 `~/.config/opencode/opencode.jsonc`，未动现有 28894 服务。
6. 打包时包含 `latest.yml`，图标和版本信息经验证。
