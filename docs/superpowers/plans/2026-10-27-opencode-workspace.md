# OpenCode Provider / 模型统一编辑工作区 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 BYOK 已确认的整页 Provider/模型工作区替换 OpenCode 双层弹窗，全部连接字段手填，统一保存并保护未保存草稿。

**Architecture:** OpenCode 页只拥有 Provider 草稿和列表/编辑模式；模型选择直接修改这份草稿。将可测的纯草稿操作放入 `draft.mjs`，展示组件放入 `src/pages/opencode/`，保存仍复用既有 `rs:oc:save` 与原生 V2 写入。App 只读取编辑器注册的离开守卫，不改全局侧栏结构。

**Tech Stack:** React 18、Vite、Electron IPC、Node `node:test`、CSS、Playwright/CDP 真实 Electron 验收。

**设计基线:** `docs/superpowers/specs/2026-10-27-opencode-workspace-design.md`；`designs/byok-opencode/`（侧栏修正版，列表统计数字 13px）。

**硬边界:** 不改 `electron/lib/opencode.js`、不改 `App.jsx` 的侧栏 DOM/CSS、不读写真实 `C:\Users\73283\.config\opencode\opencode.jsonc`；所有 UI 验收用隔离临时 HOME。

---

### Task 1: 纯草稿模型与手动拉取输入

**Files:**
- Create: `src/pages/opencode/draft.mjs`
- Test: `test/opencode-draft.test.js`

- [x] **Step 1: 写失败测试**

```js
const d = await import('../src/pages/opencode/draft.mjs');
const p = d.newProvider();
assert.equal(p.relayId, undefined);
assert.deepEqual(d.providerFetchTarget({ baseUrl: ' https://a.test/v1 ', apiKey: ' k ' }),
  { baseUrl: 'https://a.test/v1', apiKey: 'k' });
const withModel = d.updateModel(p, 0, { id: 'claude-opus-5-5', name: 'Opus' });
assert.equal(withModel.models[0].name, 'Opus');
assert.equal(p.models.length, 0);
const withEffort = d.addEffort(withModel.models[0], ' xhigh ');
assert.equal(withEffort.effort, 'xhigh');
assert.deepEqual(withEffort.efforts, ['xhigh']);
assert.equal(d.addEffort(withEffort, 'xhigh'), withEffort);
```

- [x] **Step 2: 验证失败**

Run: `node --test test/opencode-draft.test.js`  
Expected: FAIL，无法找到 `draft.mjs`。

- [x] **Step 3: 实现纯函数**

```js
export const newModel = (id = '') => ({
  id, name: id, limit: { context: 0, output: 0 },
  reasoning: false, attachment: false, tool_call: true, temperature: false,
  modalities: { input: ['text'], output: ['text'] }, efforts: [], effort: '', options: {}
});
export const newProvider = () => ({ id: '', name: '', protocol: 'chat', baseUrl: '', apiKey: '', models: [], defaultModel: '' });
export const updateModel = (provider, index, patch) => ({
  ...provider,
  models: provider.models.map((m, i) => i === index ? { ...m, ...patch } : m)
});
export const addEffort = (model, raw) => {
  const value = raw.trim();
  if (!value || model.efforts.includes(value)) return model;
  return { ...model, efforts: [...model.efforts, value], effort: value };
};
export const providerFetchTarget = ({ baseUrl, apiKey }) => ({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim() });
```

- [x] **Step 4: 验证通过并提交**

Run: `node --test test/opencode-draft.test.js`  
Expected: 全部通过。

---

### Task 2: Provider 列表与整页 Provider 编辑器

**Files:**
- Create: `src/pages/opencode/ProviderEditor.jsx`
- Modify: `src/pages/OpenCode.jsx`
- Create: `src/pages/opencode/ModelEditor.jsx`
- Test: `test/opencode-ui.test.js`

- [x] **Step 1: 写失败测试**

断言 `OpenCode.jsx` 渲染 `editing ? <ProviderEditor … /> : <ProviderList … />`，不包含 `Modal open={!!editing}`；`ProviderEditor.jsx` 有 Base URL / API Key / Provider ID 手动输入和 `{ baseUrl, apiKey }` 拉取目标，不包含站库 Select / `已关联` / `pickRelay`；`ModelEditor.jsx` 的 `newEffort` 输入显式 `type="text"`。

- [x] **Step 2: 运行 UI 测试确认失败**

Run: `node --test test/opencode-ui.test.js`  
Expected: FAIL，仍使用嵌套 Modal。

- [x] **Step 3: 实现页面骨架和统一草稿**

`OpenCode` 保留 `ocList/ocSave/ocRemove`、错误 toast、导入、移除确认。进入编辑时保存 baseline；`editing` 是唯一草稿，`dirty = JSON.stringify(editing) !== baseline`。成功保存才退出，失败留在原页。

```jsx
{editing ? <ProviderEditor data={editing} setData={setEditing} busy={busy}
  onFetchModels={fetchModels} fetching={fetching} relayModels={relayModels}
  onSave={save} onCancel={() => requestClose('list')}
  onRequestDeleteModel={index => setConfirmDeleteModel(index)} />
: <ProviderList providers={providers} onAdd={openAdd} onEdit={openEdit} onRemove={setConfirmDel} />}
```

`ProviderEditor` 仅手动字段，拉取调用：

```js
onFetchModels({ baseUrl: data.baseUrl.trim(), apiKey: data.apiKey.trim() });
```

底部只有一个「保存并写入 OpenCode 配置」按钮。`ModelEditor` 的每次修改都执行 `setData(d => updateModel(d, index, patch))`，切换左侧模型不新开弹窗、不单独保存。保留默认模型 Select、推荐参数、档位 Enter/blur/Escape 及能力/模态开关。

- [x] **Step 4: 验证 UI 测试通过**

Run: `node --test test/opencode-ui.test.js test/opencode-draft.test.js`  
Expected: 全部通过。

---

### Task 3: 未保存离开守卫、视觉与真实界面验收

**Files:**
- Create: `src/pages/opencode/navigationGuard.js`
- Modify: `src/pages/OpenCode.jsx`
- Modify: `src/App.jsx`（仅 `goto`/hash 守卫，不动侧栏）
- Modify: `src/styles.css`
- Test: `test/opencode-ui.test.js`

- [x] **Step 1: 写失败测试**

测试导航守卫没有注册时允许跳转，有未保存草稿时拒绝并只调用一次提示；源码断言 `OpenCode.jsx` 编辑态注册守卫、放弃确认后才清空；统计数字规则 `font-size: 13px`，`ProviderEditor` 标题无 `playfair`。

- [x] **Step 2: 验证失败**

Run: `node --test test/opencode-ui.test.js`  
Expected: FAIL，缺少守卫。

- [x] **Step 3: 实现离开守卫与 BYOK 样式**

```js
let guard = null;
export const setNavigationGuard = fn => { guard = fn; };
export const canLeavePage = () => !guard || guard();
```

`goto(target)` 在真正改变 page 前调用 `canLeavePage()`。编辑 dirty 时守卫打开「放弃未保存的修改？」Confirm 并返回 false；确认后清草稿，再执行保存下来的目标跳转。Cancel/返回列表使用同一个 Confirm，未修改直接退出。

CSS 按 `designs/byok-opencode/provider-list.png`、`provider-editor.png`、`model-editor.png` 实现工作区，复用 `.side` 等现有全局样式。列表数字和每行模型数 `13px`；「编辑 Provider」为 Inter/Microsoft YaHei 16px / 500，斜体仅用于 OpenCode 大标题。

- [x] **Step 4: 运行测试、构建和隔离 UI 验收**

Run: `node --test test/*.test.js`；`.\node_modules\.bin\vite.cmd build`。  
Expected: 全部通过。

在 `C:\Windows\Temp\opencode\rs-workspace-ui` 的隔离 HOME 启动 Electron + CDP，不加载真实配置。实际操作列表→新建/编辑→修改连接字段→添加/切换模型→修改参数→未保存取消/确认。断言：无 Provider/模型 Modal、无关联下拉、模型草稿切换保留、保存失败仍留草稿；输入 `xhigh` 不按 Enter 时 color 为 `rgb(245, 245, 244)`；侧栏 DOM 与原有 `App.jsx` 一致。截图后人工检查。

- [x] **Step 5: 运行 smoke**

Run: `.\node_modules\.bin\electron.cmd . --smoke`  
Expected: `SMOKE RESULT: 39 passed, 0 failed`。

验收记录（2026-10-27）：隔离 Electron + 真实 `ipcRenderer.invoke` 失败注入通过；保存失败保留草稿，直接保存保留待输入档位，能力整格只切换一次。独立普通 Provider 验证干净返回、跨页重进、hash 取消/再次导航/确认。全量单测 112/112、smoke 39/39；代码审查发现的 Important 边界已修复。追加性能验收：GPU 实测 Intel Arc / D3D11、gpu_compositing enabled；局部输入与稳定 flush 降低击键重渲染，滚动区 Paint 从 80 次/90.0ms 降至 53 次/69.7ms。未回车档位切换、保存中编辑冻结与输入中侧栏离开均已实测。

---

### Task 4: 代码审查、发布与资产核验

**Files:**
- Modify: `package.json`（下一功能版本）
- Modify: `CHANGELOG.md`

- [x] **Step 1: 运行完整验证并审查 diff**

Run: `node --test test/*.test.js`、Vite build、smoke。  
Expected: 全绿。审查仅包含 OpenCode 工作区、必要守卫、样式、测试、文档，绝不混入用户已有 captures 或其他未跟踪文件。

- [ ] **Step 2: 合并与发布前确认**

向用户展示真实界面截图和测试结果；按 finishing-a-development-branch 流程确认合并/推送。用户明确许可后才执行 Git 合并/推送和 Release 发布。

- [ ] **Step 3: 按现有无特权打包流程构建**

Run: `.\node_modules\.bin\electron-builder.cmd --win nsis`；
`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/patch-icon.ps1`；
删除本次临时生成的 Setup/blockmap 后 `.\node_modules\.bin\electron-builder.cmd --win nsis --prepackaged release/win-unpacked`。

- [ ] **Step 4: 验证并上传完整 Release 资产**

检查图标、FileVersion、桌面/开始菜单快捷方式保留；安装包、blockmap、`latest.yml` 同时上传。重新下载发布安装包，验证 HTTP 200、字节数、SHA-512 与 `latest.yml` 一致。
