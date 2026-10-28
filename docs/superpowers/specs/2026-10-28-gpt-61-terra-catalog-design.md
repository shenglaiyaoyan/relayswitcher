# GPT-6.1 Terra 目录跟进设计

## 证据

本机 Codex CLI 0.142.5 的二进制（`08d187884f2330d1/codex.exe`）原生目录已含 `gpt-6.1-terra`，共 12 个模型。Terra 原生参数：软上下文 500000、硬顶 872000、默认 low、low/medium/high/xhigh/max/ultra 六档、priority Fast；不是 `terror`，也不复用旧 `gpt-5.6-terra` 的退役规则。

## 方案

1. 用现有 `extractCatalogFromBuffer` 提取产物更新 `resources/model-catalog.json`，不补写 `base_instructions` 或其他非原生字段。
2. `relay-catalog.js` 先按模型精确 slug 选择官方同 slug 模板，再回退原有家族规则。中转站提供 `gpt-6.1-terra` 时保留其 500K/872K/low/六档/priority 元数据；不提供时不替中转站新增模型。
3. `catalog-patch.js` 不增加 Terra 桥接补丁；`gpt-5.6-terra` 的既有退役策略不动。
4. 发布 v1.14.1，更新版本与 CHANGELOG。

## 验证

- 新增精确模板选择测试，并断言 Terra 经中转目录生成后参数不丢失。
- 用最新提取目录执行官方补丁与切换 smoke，确认目录结构合法、Terra 可被选择，其他模型策略不回归。
- 隔离临时 HOME 验证，不改真实 Codex/OpenCode 配置。
- 全量单测、Vite 构建、smoke；按既有无特权打包、图标与快捷方式、Release 资产及下载 SHA-512 流程发版。
