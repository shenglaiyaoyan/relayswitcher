# OpenCode 模型模板按厂家子系列细分 — 设计规格

日期：2026-11-23 · 状态：用户已确认方案 A 与参数表（定稿 `designs/oc-submodel-templates-a.html`）

## 背景与目标

此前内置模板只有 11 条「一厂一模板」（`Claude`、`GPT`、`Gemini`、`DeepSeek`、`GLM`、`Kimi`、`Qwen`、`Grok`、`MiniMax`、`Mistral`、`MiMo`），同厂所有型号共用一套参数，无法表达子系列之间的真实差异：
- **DeepSeek**：V4.1 Flash 支持图片输入（`image`），而 V4 Pro / 早期 V4 是纯文本，V3 / R1 则是 164K / 64K 且无档位。
- **Gemini**：4 Hydrogen（四档、264K 输出）、4 Neon（四档、128K 输出）、4 Argon / Carbon（三档）、3.5 / 3.6 Flash & Lite（含 `minimal` 四档）在思考档位与最大输出上各不相同。
- **GLM / Claude / GPT / Kimi / Qwen / Grok / MiniMax / Mistral / MiMo**：各代际和视觉/纯文本分支在模态、档位、上下文和输出上限上均有差异。
- **中转站前缀与分隔符**：如 `person-deepseek-v4-1-flash-261017`、`person-kimi-k3-1-pro-highspeed-261111`、`zai-glm-5-3-flash` 带自定义前缀且把版本号 `.` 写成 `-`，旧的 `^deepseek-.*$` 无法命中。

本次目标：
1. 保持现有 11 个厂家不变，按「参数真有差异的子系列 + 每厂末尾兜底」拆分为 **36 个内置模板**。
2. 支持版本号 `.` / `-` 互通与两段式中转前缀匹配。
3. 模板库页（`#settings-opencode`）与模型抽屉模板菜单支持按厂家分组筛选与快速搜索，左栏独立滚动、右侧编辑区吸顶。
4. 模板仍是「一次性预填、不绑定」，不改动任何已保存模型，不触碰真实 `opencode.jsonc`。

## 数据结构与兼容性

模板对象在原有字段基础上增加两个展示元数据（均不写入 OpenCode 配置）：
- `group: string`：所属厂家组名（内置为 11 家名称之一；自定义模板展示归入 `'自定义'`）。
- `fallback?: boolean`：是否为该厂末尾的通用兜底模板（列表显示虚线 `兜底` 标记）。

### 36 个内置模板清单（`BUILTIN_TEMPLATES`）

所有模板输出模态均为 `['text']`，`tool_call: true`；除 `Codestral / Devstral` 为 `reasoning: 'no'` 外其余均为 `reasoning: 'yes'`；`temperature` 仅 Claude 5 系、GPT 6.2/6.1-Sol/6-Astra、GPT 兜底、Kimi 全系为 `'no'`，其余为 `'unset'`。

| 组 (`group`) | ID | 模板名 (`name`) | 匹配规则 (`patterns`) | 上下文 / 输出 | 思考档位（默认） | 输入模态 / 特殊项 |
|---|---|---|---|---|---|---|
| **Claude** | `builtin-claude` | Claude 5 / 5.5 / 4.7+ | `claude-opus-5*`, `claude-sonnet-5*`, `claude-haiku-5*`, `claude-fable*`, `claude-5*`, `claude-opus-4.8*`, `claude-opus-4.7*` | 1000000 / 128000 | `low,medium,high,xhigh,max` (`high`) | `text,image,pdf` · Temp `no` |
| | `builtin-claude-4-6` | Claude 4.6 | `claude-opus-4.6*`, `claude-sonnet-4.6*`, `claude-haiku-4.6*`, `claude-4.6*` | 1000000 / 128000 | `low,medium,high,max` (`high`) | `text,image,pdf` |
| | `builtin-claude-fallback` | Claude 4.5 及旧版 | `claude-*`（兜底） | 200000 / 64000 | `low,medium,high` (`high`) | `text,image,pdf` |
| **GPT** | `builtin-gpt` | GPT 6.2 / 6.1 Sol / 6 Astra | `gpt-6.2-*`, `gpt-6.1-sol*`, `gpt-6-astra*` | 500000 / 128000 | `low,medium,high,xhigh,max` (`high`) | `text,image,pdf` · Temp `no` |
| | `builtin-gpt-6-six` | GPT 6.1 Terra / 6 Sol·Luna / 5.6 | `gpt-6.1-terra*`, `gpt-6-sol*`, `gpt-6-luna*`, `gpt-5.6*`, `gpt-daybreak*` | 500000 / 128000 | `none,low,medium,high,xhigh,max` (`high`) | `text,image,pdf` |
| | `builtin-gpt-5-4-mini` | GPT 5.4 Mini / Nano | `gpt-5.4-mini*`, `gpt-5.4-nano*` | 400000 / 128000 | `none,low,medium,high,xhigh` (`medium`) | `text,image` |
| | `builtin-gpt-fallback` | GPT 5.5 / 通用 | `gpt-*`（兜底） | 500000 / 128000 | `none,low,medium,high,xhigh` (`high`) | `text,image,pdf` · Temp `no` |
| **Gemini** | `builtin-gemini-4-hydrogen` | Gemini 4 Hydrogen | `gemini-4-hydrogen*` | 1000000 / 264000 | `low,medium,high,xhigh` (`xhigh`) | `text,image,video,audio,pdf` |
| | `builtin-gemini-4-neon` | Gemini 4 Neon | `gemini-4-neon*` | 1000000 / 128000 | `low,medium,high,xhigh` (`high`) | `text,image,video,audio,pdf` |
| | `builtin-gemini-4-argon` | Gemini 4 Argon / Carbon | `gemini-4-argon*`, `gemini-4-carbon*` | 1000000 / 128000 | `low,medium,high` (`high`) | `text,image,video,audio,pdf` |
| | `builtin-gemini-3-5-flash` | Gemini 3.5 / 3.6 Flash & Lite | `gemini-3.5-flash*`, `gemini-3.6-flash*`, `gemini-*flash-lite*` | 1000000 / 128000 | `minimal,low,medium,high` (`high`) | `text,image,video,audio,pdf` |
| | `builtin-gemini` | Gemini 3.7 / 3.8 & 通用 | `gemini-*`（兜底） | 1000000 / 128000 | `low,medium,high` (`high`) | `text,image,video,audio,pdf` |
| **DeepSeek** | `builtin-deepseek` | DeepSeek V4.1 / Flash | `deepseek-v4.1`, `deepseek-v4.1-*`, `deepseek-v4.1:*`, `deepseek-flash*` | 1048576 / 393216 | `low,high,max` (`high`) | `text,image` |
| | `builtin-deepseek-v4` | DeepSeek V4（纯文本） | `deepseek-v4*`, `deepseek-pro*` | 1048576 / 393216 | `low,high,max` (`high`) | `text` |
| | `builtin-deepseek-fallback` | DeepSeek V3 / R1 | `deepseek-*`（兜底） | 163840 / 65536 | `[]`（思考开关） | `text` |
| **GLM** | `builtin-glm-5-4` | GLM 5.4 | `glm-5.4*` | 1000000 / 128000 | `low,high,max` (`high`) | `text,image,pdf`（v1.20.1 新增） |
| | `builtin-glm-5-3-flash` | GLM 5.3 Flash | `glm-5.3-flash*` | 1000000 / 128000 | `low,high,max` (`high`) | `text,image,video,pdf` |
| | `builtin-glm` | GLM 5.3 | `glm-5.3`, `glm-5.3-*` | 1000000 / 128000 | `low,high,max` (`high`) | `text` |
| | `builtin-glm-5-2` | GLM 5.2 | `glm-5.2*` | 1000000 / 128000 | `high,max` (`high`) | `text` |
| | `builtin-glm-vision` | GLM 5V / 4.6V / 4.5V | `glm-5v*`, `glm-4.6v*`, `glm-4.5v*`, `glm-4v*` | 200000 / 128000 | `[]`（思考开关） | `text,image,video` |
| | `builtin-glm-fallback` | GLM 5 / 4.x | `glm-*`（兜底） | 200000 / 128000 | `[]`（思考开关） | `text` |
| **Kimi** | `builtin-kimi` | Kimi K3 / K3.1 | `kimi-k3*`, `kimi-3*` | 1048576 / 1048576 | `low,high,max` (`high`) | `text,image,video` · Temp `no` |
| | `builtin-kimi-fallback` | Kimi K2.6 / K2.7 | `kimi-*`（兜底） | 262144 / 262144 | `[]`（思考开关） | `text,image,video` · Temp `no` |
| **Qwen** | `builtin-qwen-4-max` | Qwen 4 Max | `qwen4*`, `qwen-4*` | 1000000 / 262144 | `low,high,xhigh` (`xhigh`) | `text,image,video,pdf` |
| | `builtin-qwen-3-8-omni` | Qwen 3.8 Omni | `qwen3.8-omni*`, `qwen-3.8-omni*` | 1000000 / 131072 | `none,low,medium,xhigh` (`medium`) | `text,image,audio,video` |
| | `builtin-qwen` | Qwen 3.8 Max / Flash | `qwen3.8-*`, `qwen-3.8-*` | 1000000 / 131072 | `low,medium,xhigh` (`medium`) | `text,image,video,pdf` |
| | `builtin-qwen-fallback` | Qwen 3.7 及旧版 | `qwen*`（兜底） | 1000000 / 131072 | `[]`（思考开关） | `text,image,video` |
| **Grok** | `builtin-grok` | Grok 4.5 / 4.6 / 4.7 | `grok-4.7*`, `grok-4.6*`, `grok-4.5*` | 500000 / 500000 | `low,medium,high,xhigh` (`high`) | `text,image,pdf` |
| | `builtin-grok-fallback` | Grok 4.3 / 4.20 | `grok-*`（兜底） | 1000000 / 30000 | `low,medium,high,xhigh` (`high`) | `text,image,pdf` |
| **MiniMax** | `builtin-minimax-m3-1` | MiniMax M3.1 Flash | `minimax-m3.1*` | 1000000 / 524288 | `low,medium,high,xhigh,max` (`high`) | `text,image,video` |
| | `builtin-minimax` | MiniMax M3 | `minimax-m3*` | 1000000 / 524288 | `[]`（思考开关） | `text,image,video` |
| | `builtin-minimax-fallback` | MiniMax M2.x | `minimax-*`（兜底） | 204800 / 131072 | `[]`（思考开关） | `text` |
| **Mistral** | `builtin-mistral-large` | Mistral Large 4 | `mistral-large*` | 1048576 / 262144 | `low,medium,high` (`high`) | `text,image,pdf` |
| | `builtin-mistral-code` | Codestral / Devstral | `codestral*`, `devstral*` | 262144 / 262144 | `[]` · `reasoning: 'no'` | `text` |
| | `builtin-mistral` | Mistral Medium / Small | `mistral-*`, `ministral-*`（兜底） | 262144 / 262144 | `none,high` (`high`) | `text,image,pdf` |
| **MiMo** | `builtin-mimo-pro` | MiMo v2.5 / v2 Pro | `mimo-v2.5-pro*`, `mimo-v2-pro*` | 1048576 / 131072 | `[]`（思考开关） | `text` |
| | `builtin-mimo` | MiMo v2.6 / 多模态 | `mimo-*`（兜底） | 1048576 / 131072 | `[]`（思考开关） | `text,image,audio,video` |

### 已存模板平滑升级（`resolveTemplates(stored)`）

- `stored` 为 `null` 时返回 `BUILTIN_TEMPLATES` 克隆（36 条）。
- `stored` 为旧版保存过的数组时：
  1. 自定义模板（`!t.builtin`）原样迁移三态后排在最前。
  2. 按 `BUILTIN_TEMPLATES` 顺序合并内置模板：`stored` 中没有的新增子系列自动补入；`stored` 中已有的内置条目保留用户改过的参数，但若检测到 `stored` 来自未拆分的旧版（不含任何新子系列 ID）且该内置条目的 `patterns` 仍是旧版单条通配（如 `builtin-claude` 旧值为 `['claude-*']`，现已不再是兜底项），则同步更新其 `name` 与 `patterns` 为新子系列定义，避免旧通配吞掉同厂其它子系列；用户手工改过的 `patterns` 不覆盖。
- `resetBuiltins(list)`：保留自定义模板，内置部分恢复为全部 36 条默认定义。

## 匹配规则（`matchTemplate(templates, id)`）

1. **版本号 `.` / `-` 互通**：匹配前将 pattern 与待测字符串中的 `.` 统一视作可匹配 `.` 或 `-`（归一化为 `-` 比较），使 `deepseek-v4.1-*` 同时命中 `deepseek-v4.1-flash` 与 `deepseek-v4-1-flash-261017`，`claude-*-4.6*` 同时命中 `claude-sonnet-4-6` 与 `claude-sonnet-4.6`。
2. **第一段（常规开头匹配）**：对完整 ID `full` 与最后一个 `/` 后的 `tail` 做整串通配匹配，自定义模板优先于内置模板，同类中按列表顺序取第一个命中。常规命名（含 `deepseek-r1-distill-qwen-32b` 这类带下游蒸馏词的 ID）均在此步按真实前缀命中。
3. **第二段（中转前缀兜底）**：仅当第一段未命中时，沿 `tail` 中的分隔符 `[-_:]` 从左到右截取后缀（例如 `person-deepseek-v4-1-flash-261017` 依次尝试 `deepseek-v4-1-flash-261017` 等），每个位置先测自定义模板、再测内置模板，首次命中即返回。因为外层按从左到右扫描，最靠前的厂家词优先，不会被尾部词误抢。

## 界面（方案 A）

### 1. 设置 → OpenCode 专属设置 → 模型模板（`TemplateLibrary.jsx`）

- **左栏（340px 宽，独立滚动）**：
  - 顶部筛选区固定：搜索框（按模板名或匹配规则实时过滤，带清空按钮）+ 厂家筛选胶囊（`全部`、存在自定义时显示 `自定义`、11 个厂家名称及各自数量）。
  - 下方滚动区按 `templateGroup(t)` 输出金色分组小标题（如 `GEMINI · 5 个模板`）；`t.fallback` 为真时在「内置」徽标旁显示虚线 `兜底` 标签。
- **右栏（吸顶编辑）**：`position: sticky; top: 12px;`，头部小字显示 `正在编辑 · <组名>`，其余编辑控件保持不变。
- 所有新增按钮类（`.oc-lib-pill`、`.oc-lib-search-clear`）均声明独立的 `background` 与 `border`，满足 `test/opencode-ui.test.js` 防白底按钮门禁。

### 2. 模型抽屉模板菜单（`ModelEditor.jsx` 的 `TemplateMenu`）

- 弹出层加宽至 `380px`，顶部带紧凑搜索框（输入关键字同时过滤模板名、组名与规则）。
- 未输入搜索词时的排列顺序：
  1. 当前模型自动命中的 `推荐` 模板置顶高亮；
  2. 若命中模板属于某个厂家组，紧随其后列出 `同厂家 · <组名>` 的其余子模板（方便在中转命名特殊时一键改选同厂兄弟型号）；
  3. 分隔线后按厂家分组列出其余模板。

## 测试与验收

- **单测（`test/opencode-templates.test.js`）**：
  - 36 个内置模板结构、组名、兜底分布与关键参数断言（Gemini 4 四款、DeepSeek V4.1 vs V4 vs V3、GLM 5.3 Flash vs 5.3、Claude 5 vs 4.6 vs 4.5、GPT 4 档、Qwen 4 Max 等）。
  - `.` / `-` 互通匹配与两段式中转前缀匹配（`person-deepseek-v4-1-flash-261017`、`person-kimi-k3-1-pro-highspeed-261111`、`zai-glm-5-3-flash`、蒸馏模型不误判）。
  - 旧版 11 条已存模板升级合并测试（补齐新子模板、未改过的旧通配自动收窄、改过的自定义值与自定义模板完整保留）。
- **UI 单测（`test/opencode-ui.test.js`）**：分组胶囊、搜索框、抽屉同厂置顶、所有按钮具备自定义 `background` 和 `border`。
- **隔离验证**：
  - 隔离 OpenCode 2.3.0 加载全部 36 个内置模板在三种协议下写出的 108 个模型（108/108）。
  - 隔离 Electron 截图检查 `#settings-opencode` 与模型抽屉模板菜单。
  - 只读回放用户真实 `opencode.jsonc` 查看各模型的自动匹配结果。
