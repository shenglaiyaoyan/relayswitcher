# OpenCode 子系列模型模板与分组筛选 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 OpenCode 内置模型模板从 11 个「一厂一模板」细分为 11 家 36 个子系列模板（含每厂末尾兜底），支持 `.`/`-` 版本号互通与中转前缀匹配，并在模板库与模型抽屉菜单加入厂家分组筛选与快速搜索。

**Architecture:** `src/pages/opencode/templates.mjs` 保持纯函数无依赖结构，新增 `group` 与 `fallback` 展示元数据、`templateGroup` / `TEMPLATE_GROUPS` 导出、两段式通配匹配（常规开头全量匹配 → 中转前缀仅匹配非兜底子系列）以及旧版 11 条已存模板无损升级合并。`TemplateLibrary.jsx` 与 `ModelEditor.jsx` 复用 `templateGroup` 实现厂家胶囊过滤、左栏独立滚动 + 右栏吸顶、抽屉菜单搜索与同厂子模板置顶，所有写入 OpenCode 配置的序列化逻辑（`opencode.js`）零改动。

**Tech Stack:** Node.js (`node:test`)、React 18、Vite、Electron 33。

---

### Task 1: 36 个内置子系列模板、两段式匹配与旧模板升级合并

**Files:**
- Modify: `src/pages/opencode/templates.mjs`
- Test: `test/opencode-templates.test.js`

- [ ] **Step 1: 在 `test/opencode-templates.test.js` 编写失败测试**

更新内置模板断言、匹配断言，并新增子系列分流、中转前缀匹配与旧版 11 模板升级合并测试：

```js
// 1) 11 家分组齐全、共 36 个内置模板、每家末尾恰有 1 个 fallback
assert.deepEqual(t.TEMPLATE_GROUPS, ['Claude', 'GPT', 'Gemini', 'DeepSeek', 'GLM', 'Kimi', 'Qwen', 'Grok', 'MiniMax', 'Mistral', 'MiMo']);
assert.equal(t.BUILTIN_TEMPLATES.length, 36);
for (const g of t.TEMPLATE_GROUPS) {
  const items = t.BUILTIN_TEMPLATES.filter(x => x.group === g);
  assert.ok(items.length >= 2, g);
  assert.equal(items.filter(x => x.fallback).length, 1, g + ' fallback count');
  assert.equal(items[items.length - 1].fallback, true, g + ' fallback last');
}

// 2) 关键子系列差异断言（Gemini 4 四款、DeepSeek 4.1 识图 vs V4 纯文本 vs V3、GLM 5.3 Flash vs 5.3、Mistral Codestral reasoning=no）
// 3) 版本号 . / - 互通与中转前缀两段式匹配：
//    person-deepseek-v4-1-flash-261017 -> DeepSeek V4.1 / Flash (含 image)
//    deepseek-v4-pro / deepseek-v4-flash-0731 -> DeepSeek V4（纯文本）
//    deepseek-r1-distill-qwen-32b -> DeepSeek V3 / R1（不被 qwen 抢走）
//    person-kimi-k3-1-pro-highspeed-261111 -> Kimi K3 / K3.1
//    zai-glm-5-3-flash -> GLM 5.3 Flash；zai-glm-5-3 -> GLM 5.3
//    my-gpt-x -> null（前缀兜底不命中泛化 fallback）
// 4) 旧版仅存 11 条内置模板升级：补齐全部 36 条，未改过的旧通配自动收窄，用户改过的数值与自定义模板保留
```

- [ ] **Step 2: 运行单测确认失败**

Run: `node --test test/opencode-templates.test.js`
Expected: FAIL（`TEMPLATE_GROUPS` 未定义、内置数量仍为 11、中转前缀返回 `null`）。

- [ ] **Step 3: 实现 `src/pages/opencode/templates.mjs`**

1. 定义 `TEMPLATE_GROUPS` 与 `templateGroup(t)`（`!t.builtin ? '自定义' : (t.group || '其它')`）。
2. 按规格表写入 36 条 `BUILTIN_TEMPLATES`（保留原有 11 个 `builtin-*` ID 对应各自主力条目）。
3. 实现 `.` / `-` 归一化通配匹配与两段式 `matchTemplate`（Pass 1 测 `full` 与 `tail` 全部模板；Pass 2 沿 `tail` 的 `[-_:]` 从左到右截取后缀，仅匹配 `!t.fallback` 的自定义与内置子系列模板）。
4. 更新 `resolveTemplates(stored)`：若 `stored` 为数组，保留自定义模板在前，按 `BUILTIN_TEMPLATES` 顺序补齐缺失的新内置模板，并对来自旧版（不含新子系列 ID）且 `patterns` 仍为旧版单条通配的非兜底内置模板同步更新 `name` 与 `patterns`。

- [ ] **Step 4: 运行单测确认通过**

Run: `node --test test/opencode-templates.test.js`
Expected: PASS（0 fail）。

- [ ] **Step 5: 提交 Task 1**

```bash
git add -- src/pages/opencode/templates.mjs test/opencode-templates.test.js
git commit -m "feat(opencode): 内置模板细分为 11 家 36 个子系列，支持中转前缀与版本号互通匹配"
```

---

### Task 2: 模板库分组筛选、独立滚动与抽屉菜单搜索置顶（方案 A）

**Files:**
- Modify: `src/pages/opencode/TemplateLibrary.jsx`
- Modify: `src/pages/opencode/ModelEditor.jsx`
- Modify: `src/pages/opencode/ModelTable.jsx`
- Modify: `src/styles.css`
- Test: `test/opencode-ui.test.js`

- [ ] **Step 1: 在 `test/opencode-ui.test.js` 编写失败测试**

新增断言：
- `TemplateLibrary.jsx` 包含搜索输入（`oc-lib-search`）、厂家筛选胶囊（`oc-lib-pill`）、分组头（`oc-lib-group-hd`）与 `兜底` 标记（`oc-fallback-badge`）。
- `ModelEditor.jsx` 的 `TemplateMenu` 包含搜索过滤与 `同厂家` 置顶分组。
- 所有新增按钮类在 `src/styles.css` 中均具备 `background` 与 `border` 规则。

- [ ] **Step 2: 运行 UI 单测确认失败**

Run: `node --test test/opencode-ui.test.js`
Expected: FAIL。

- [ ] **Step 3: 实现 `TemplateLibrary.jsx`、`ModelEditor.jsx`、`ModelTable.jsx` 与 `src/styles.css`**

1. `TemplateLibrary.jsx`：新增 `query` 与 `group` 状态；左栏渲染搜索框、胶囊筛选（`全部`、存在自定义时 `自定义`、11 家及计数），滚动区内按 `templateGroup(t)` 输出分组小标题，兜底项显示 `兜底` 徽标；右栏吸顶，标题上方显示 `正在编辑 · ${templateGroup(current)}`。新建自定义模板时自动将 `group` 切回 `'all'`（或 `'自定义'`）保证新项立即可见。
2. `ModelEditor.jsx`：`TemplateMenu` 增加 `query` 搜索框（打开时清空，支持按名称/组名/规则过滤）；空搜索时依次渲染命中 `推荐` 项、`同厂家 · ${matched.group}` 其余子模板、其余厂家分组。弹出菜单展示紧凑摘要（上下文/输出/档位/识图提示）。
3. `ModelTable.jsx`：批量套用下拉框对非前缀开头的模板（如 `Codestral / Devstral`）补齐组名前缀，保持清晰可读。
4. `src/styles.css`：补齐 `.oc-lib-list` 限高弹性布局、`.oc-lib-scroll`、`.oc-lib-filter`、`.oc-lib-search`、`.oc-lib-search-clear`、`.oc-lib-pills`、`.oc-lib-pill`、`.oc-lib-group-hd`、`.oc-fallback-badge`、`.oc-lib-editor` 吸顶及 `.oce-menu-pop`（`width: 380px`）与 `.oce-menu-grp` 样式。

- [ ] **Step 4: 运行全量单测、导入检查与前端构建**

Run: `node --test test/*.test.js && node lint-imports.js && npx vite build`
Expected: 全部测试通过，`LINT_IMPORTS: ALL_CLEAN`，Vite 构建成功。

- [ ] **Step 5: 提交 Task 2**

```bash
git add -- src/pages/opencode/TemplateLibrary.jsx src/pages/opencode/ModelEditor.jsx src/pages/opencode/ModelTable.jsx src/styles.css test/opencode-ui.test.js
git commit -m "feat(opencode): 模板库厂家筛选与分组滚动、抽屉模板菜单搜索与同厂置顶"
```

---

### Task 3: 隔离真机验证、截图核验与发布 v1.20.0

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 隔离 OpenCode 2.3.0 加载核验 + 真实配置只读匹配回放**

运行 `C:\Windows\Temp\opencode\tpl-audit.mjs`：
- 验证 36 个内置模板 × 3 种协议 = 108 个模型在隔离 OpenCode 2.3.0 CLI 中 108/108 全部正常加载，无 schema 错误。
- 只读打印用户真实 `opencode.jsonc` 各模型现在命中的具体子系列模板（确认 `gemini-4-hydrogen` → `Gemini 4 Hydrogen`、`GLM-5.3-Flash` → `GLM 5.3 Flash`、`GLM-5.3` → `GLM 5.3`、`qwen4-max` → `Qwen 4 Max` 等）。

- [ ] **Step 2: 隔离 Electron 截图核验（含 `-bottom`）**

使用隔离 `USERPROFILE`/`APPDATA`/`--user-data-dir` 抓取 `settings-opencode`、`settings-opencode-bottom`、`opencode-demo-dialog` 截图并目视检查排版、按钮边框与对比度。

- [ ] **Step 3: 升版 v1.20.0 并打包发布**

1. 用 `edit` 工具把 `package.json`、`package-lock.json` 升为 `1.20.0`，更新 `CHANGELOG.md`，跑 `node --test test/package-integrity.test.js` 并提交。
2. 后台执行 `npm.cmd run dist *> C:\Windows\Temp\opencode\rs-v1200-build.log`，等待完成后核验全量单测、44 项 smoke 与 `RELEASE_VERIFIED`，并解包检查 ASAR 内包含新子系列模板。
3. 发布 GitHub Release `v1.20.0`，校验三项资产哈希一致、`latest` 指向 `v1.20.0`、`main` 与 `origin/main` 同步。
