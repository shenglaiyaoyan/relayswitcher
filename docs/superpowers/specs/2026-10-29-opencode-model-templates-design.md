# OpenCode 模型模板 + API Key 显示切换 — 设计

日期：2026-10-29 · 状态：用户已确认设计稿（`designs/byok-opencode/templates-v2-explained.html`）

## 目标

1. 拉回很多模型时不用逐个手填参数：按模型名自动匹配“系列模板”，一次性预填。
2. 模板可在「OpenCode 专属设置」里增删改。
3. API Key 输入框加小眼睛，可显示/隐藏已保存的 Key。

## 已确定的规则（用户确认）

- 模板 = 一次性预填，**不建立绑定**。之后修改模板不会改动任何已有模型。
- **新加入的模型**（从拉取结果点选加入）自动套用匹配模板；**已有模型**只在用户点「套用」时修改。
- 套用后每一项仍可编辑，不隐藏、不减少任何控件：四个开关（推理/附件/工具/Temp）、全部模态选项、档位删除/设默认/新增。
- 手动改过、与套用时模板值不同的字段显示「已修改」。
- 模板包含：上下文、最大输出、推理、附件、工具、Temp、输入/输出模态、思考档位列表、默认档位。

## 数据

模板对象：

```js
{ id, name, builtin: true|false, patterns: ['claude-*', 'anthropic/claude-*'],
  limit: { context, output }, reasoning, attachment, tool_call, temperature,
  modalities: { input: [...], output: [...] }, efforts: [...], effort: '' }
```

- 内置模板定义在 `src/pages/opencode/templates.mjs`（纯函数模块，可单测）。
- 用户模板列表存 RS store 的 `opencodeTemplates`（`null` = 尚未自定义，使用内置）。不写入 opencode 配置。
- 「恢复内置模板」：内置条目重置为默认值，自定义模板保留。
- 模型草稿新增 `template: { id, name, appliedAt, values }` 记录来源与套用时的值（用于来源说明与「已修改」）。`modelsToBlocks` 只写已知字段，该元数据不会进入 opencode 配置。

### 匹配

- `patterns` 支持 `*` 通配，大小写不敏感，整串匹配；同时尝试完整 ID 和最后一个 `/` 之后的部分。
- 自定义模板优先于内置模板；同类按列表顺序取第一个命中。
- 未命中 = 「未匹配」，不自动改参数。

### 内置模板（models.dev 2026-10 核对，全部可改）

| 模板 | 匹配 | 上下文/输出 | 档位（默认） | 推理 | 附件 | 工具 | Temp | 输入 |
|---|---|---|---|---|---|---|---|---|
| Claude | claude-* | 1000000/128000 | low medium high xhigh max（high） | 开 | 开 | 开 | 关 | text image pdf |
| GPT | gpt-* | 872000/128000 | low medium high xhigh max（high） | 开 | 开 | 开 | 关 | text image pdf |
| Gemini | gemini-* | 1000000/128000 | low medium high（high） | 开 | 开 | 开 | 开 | text image video audio pdf |
| DeepSeek | deepseek-* | 1048576/393216 | low high max（high） | 开 | 关 | 开 | 开 | text |
| GLM | glm-* | 1000000/131072 | low high max（high） | 开 | 关 | 开 | 开 | text |
| Kimi | kimi-* | 1048576/1048576 | low high max（high） | 开 | 开 | 开 | 关 | text image video |
| Qwen | qwen* | 1000000/131072 | low medium xhigh（medium） | 开 | 开 | 开 | 开 | text image video pdf |
| Grok | grok-* | 500000/500000 | low medium high xhigh（high） | 开 | 开 | 开 | 开 | text image pdf |
| MiniMax | minimax-* | 1000000/524288 | 无（仅思考开关） | 开 | 开 | 开 | 开 | text image video |
| Mistral | mistral-* | 1048576/262144 | none high（high） | 开 | 开 | 开 | 开 | text image pdf |
| MiMo | mimo-* | 1048576/131072 | 无（仅思考开关） | 开 | 开 | 开 | 开 | text image audio video |

输出模态均为 text。Gemini 输出按用户口径 128000（官方 65536）。

## 界面

### 1. OpenCode 专属设置 → 模型模板（`#settings-opencode`，替换占位卡）

- 左：模板列表（名称、匹配规则、四开关亮/暗、上下文/输出、档位数、内置/自定义标签）。
- 右：编辑选中模板 —— 匹配（名称、规则、命中已保存模型数）、限制、能力（四开关 + 模态）、思考档位（设默认/删除/新增）。
- 顶部「新建模板」「恢复内置模板」；自定义模板可删除；底部「取消 / 保存模板」，有未保存修改时提示。

### 2. Provider 编辑页

- API Key：输入框内右侧眼睛按钮切换 `password/text`；已有 Key 时提示「已保存 · 留空保持不变」。Key 已由 `listOpenCodeProviders` 解密提供，无需新增 IPC。
- 拉取结果芯片显示匹配模板名（未命中显示「未匹配」）；点选加入时自动套用。
- 模型列表：搜索框（按 ID/名称）、系列筛选（全部 / 出现的模板 / 其他）、每行复选框与模板来源标签。
- 勾选后在列表底部出现批量栏：「已选 N 个模型」+ 模板选择（默认“按名称自动匹配”，或指定模板）+「套用」+「取消选择」。自动匹配时未命中的模型跳过并提示数量。

### 3. 模型参数面板

- 顶部「参数模板」：下拉（命中的模板标“推荐”在前）+「套用」+「存为新模板」（以当前模型参数新建自定义模板，匹配规则默认为该模型 ID）。
- 来源说明：「来自 X 模板 · 套用于 时间 · 之后的修改只属于此模型」。
- 已修改标记：上下文、最大输出、四开关、模态、档位列表/默认档。
- 移除旧的「套用推荐参数」硬编码按钮。
- 模态选项保持现有 5 个（不因设计稿只画 3 个输出模态而删减）。

## 不做

- 不改 opencode 配置写入规则（`opencode.js`）。
- 模板不跟随更新已有模型；不做 Provider 级默认模板。
- 不从网络自动同步 models.dev。

## 测试

- `test/opencode-templates.test.js`：匹配（通配、前缀、大小写、自定义优先、未命中）、套用（复制值、保留 id/name/options/rawExtra、不共享引用）、已修改判定、恢复内置保留自定义、内置数据完整性。
- store：模板读写/`null` 回退。
- UI 源码断言：眼睛切换 type、移除硬编码推荐按钮、批量栏、设置页挂载模板库。
- 发布前：全量单测 + smoke + `npm run dist` 门禁；不触碰真实 `opencode.jsonc`。
