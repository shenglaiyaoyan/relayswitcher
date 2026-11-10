# OpenCode 模型能力、档位顺序与配置保真（设计）

日期：2026-11-10 · 状态：用户已选方案 C（定稿 `designs/oc-capabilities-c.html`）

## 背景（2026-11-10 只读审计）

- 真实配置 8 个 Provider、27 个模型原样保存 0 处改动；上下文、最大输出写入并生效。
- 问题 1：API Key 输入框留空保存会删掉配置里的 Key，与提示「留空 = 保持不变」相反。
- 问题 2：编辑器打开的是 RS 自己存的旧副本；配置文件被外部改过后，RS 保存会把改动盖回去。
- 问题 3：「推理 / 附件 / Temp」开关从不写入配置，读也读的是 V1 字段，界面永远显示关。
- 档位顺序：写入按导入时的旧 variants 顺序、新档位接末尾；读回把默认档挪到第一。OpenCode 按文件顺序显示，所以 DeepSeek 的 max 跑到中间。

官方格式（`https://opencode.ai/config.json` 的 `Config.Model.Capabilities`）：`tools`、`input`、`output`、`temperature: boolean`、`reasoning: {supported: false} | {supported: true, toggle?, effort?: string[], budget?}`，没有 attachment。OpenCode 2.2.6 抓包：补上 `reasoning` 与 `temperature:false` 后请求体不变。

## 原则

没碰过的项不写进配置：打开模型直接保存仍是 0 处改动。

## 模型字段（RS 内部）

- `reasoning`、`temperature` 由布尔改为三态字符串 `'unset' | 'yes' | 'no'`；删除 `attachment`。
- 新增 `reasoningRaw`（文件里的 `capabilities.reasoning` 原对象）、`effortsAtLoad`（读入时的档位列表），用于原样写回。
- 不新增最大输入；文件里已有的 `limit.input` 随 `limit` 整体保留。

## 读（`providerBlockToRS`）

- `reasoning`：`capabilities.reasoning.supported` 为 true → `yes`，false → `no`；没有时看 V1 顶层 `reasoning` 布尔；都没有 → `unset`。
- `temperature`：`capabilities.temperature` 布尔 → `yes/no`；没有时看 V1 顶层 `temperature`；都没有 → `unset`。
- `capExtra` 只收 `tools/input/output/reasoning/temperature` 之外的键。
- 档位顺序 = variants 在文件里的顺序；`settings` 里的默认档不在 variants 中时追加到末尾（仍记为 `baseEffort`，写回不合成 variant）。

## 写（`modelsToBlocks`）

- variants 严格按 `efforts` 顺序输出：已有 variant 用原内容；`baseEffort` 且原本不是 variant 的跳过；其余新建 `{id, settings: {effort|reasoningEffort: id}}`。
- `reasoning`：
  - `unset`：不写 `capabilities.reasoning`；档位照常写。
  - `yes`：`reasoningRaw.supported === true` 且档位与读入时相同 → 原样写回；否则写 `{...reasoningRaw 中 supported/effort 以外的键, supported: true, effort: efforts}`（无档位时省略 effort）。档位照常写。
  - `no`：写 `{supported: false}`（原本就是 false 时原样）；不写 variants，`settings` 去掉档位字段。
- `temperature`：`yes` → `true`，`no` → `false`，`unset` → 不写。
- 不再写任何 V1 顶层 `reasoning/attachment/temperature/tool_call`。

## 编辑器以配置文件为准（问题 2）

- `rs:oc:list` 每次从配置文件生成 Provider 列表，再叠加 RS 自己的元数据（`mergeRsMeta`）：
  - Provider：`relayId`；
  - 模型（按 id 对应）：`template`（套用来源，模板值按新三态迁移）；推理为 `no` 且文件里没有档位时，恢复 RS 记下的 `efforts`、`effort`，让改回「支持」时档位还在。
- 配置文件里没有的 Provider 不再显示，并从 store 删除；配置文件读不了时退回 store 列表（现状）。
- 保存后 store 仍存一份完整草稿，只作为元数据来源。

## API Key 留空（问题 1）

`resolveSaveKey`：输入框的值 > 关联中转站的 Key > 配置文件里已有的 Key（`providers.<id>.settings.apiKey` 或旧 `provider.<id>.options.apiKey`）；都没有才不写。

## 模板

- 内置模板：`reasoning: 'yes'`；`temperature`：Claude、GPT、Kimi 为 `'no'`，其余 `'unset'`；去掉 `attachment`。
- 已存模板与模型里的 `template.values` 读取时迁移：`reasoning` true → `yes`，false → `unset`；`temperature` 内置模板按当前内置定义，自定义模板 true → `yes`，false → `unset`；删 `attachment`。
- `templateDiff` 比较三态值，不再比较 attachment。

## 界面（方案 C）

- **能力**：工具调用开关 + 温度参数三选一（未设置 / 支持 / 不支持，提示「未设置 = 不写入」）。
- **模态**：输入模态下加提示「勾选 image / pdf 即可传附件」。
- **推理与思考档位**：推理三选一放在档位上方；`no` 时档位变灰、不可操作。
- **档位拖动**：每个档位左侧 6 点把手，按住拖动；拖动中原位置显示虚框，落点显示金色竖线；把手可聚焦，← → 键移动。点档位名设为默认、× 删除照旧。模板库同样使用这个组件。
- **模型表格「能力」列**：去掉「附」，显示「推 / 工 / T」：亮 = 支持/开，暗 = 未设置，删除线 = 不支持/关。
- 新按钮样式都有自己的背景和边框。

## 测试与验收

- 单测：三态读写、V1 兜底、档位顺序（含默认档仅在 settings 的情况）、`reasoningRaw` 原样写回、`no` 不写档位、`mergeRsMeta`、`resolveSaveKey`、模板迁移、档位移动纯函数、UI 源码断言。
- 真实配置只读回放：8 个 Provider 原样保存仍 0 改动。
- 隔离 OpenCode 2.2.6：写出的三态配置能加载；抓包确认 `no` / `yes` / `temperature` 的请求体。
- 隔离截图：抽屉、模板库、表格；CDP 真实拖动一次档位，确认保存后的 variants 顺序。
