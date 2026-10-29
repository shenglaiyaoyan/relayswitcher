# OpenCode 模型模板 实现计划

规格：`docs/superpowers/specs/2026-10-29-opencode-model-templates-design.md`

1. **templates.mjs（TDD）**：`BUILTIN_TEMPLATES`、`matchTemplate`、`applyTemplate`、`templateDiff`、`resolveTemplates`、`resetBuiltins`、`templateFromModel`。测试 `test/opencode-templates.test.js`。
2. **store + IPC（TDD）**：`getOpenCodeTemplates()`（null 回退）、`saveOpenCodeTemplates(list)`；`rs:oc:templates:get/save`，preload `ocTemplatesGet/ocTemplatesSave`。
3. **API Key 眼睛**：ProviderEditor 本地 `showKey` 切 `type`，按钮在输入框内；提示「已保存 · 留空保持不变」。
4. **OpenCode.jsx**：加载模板；拉取芯片显示模板名、点选加入自动套用；搜索/筛选；复选与批量栏。
5. **ModelEditor**：模板下拉 + 套用 + 存为新模板、来源说明、已修改标记；移除硬编码推荐。
6. **TemplateLibrary.jsx** 挂到 Settings `opencodeMode`。
7. 样式；UI 源码断言测试；全量单测、smoke、截图核对；版本 1.15.0，`npm run dist` 发布。
