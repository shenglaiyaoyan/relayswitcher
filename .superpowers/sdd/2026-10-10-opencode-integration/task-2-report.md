# Task 2 Report: store 数据模型 + IPC handler

**状态:DONE**(审查前修复轮完成:顾虑 1 / D1 根因与顾虑 3(apiKey 明文)均已修复;剩余已知事项见文末)

## 前置说明

task-2-brief.md 不存在(目录里只有 task-1 的 brief/report/fix diff)。已从 plan 文件 `docs/superpowers/plans/2026-10-10-opencode-integration.md` 的 Task 2 章节(行 330-446)取得完整规格与代码,并按任务指令的摘要/注意事项执行。

## 交付物

| 文件 | 变更 |
|---|---|
| `electron/lib/store.js` | data 初始化加 `opencodeProviders: []`;返回对象加 `listOpenCodeProviders` / `saveOpenCodeProvider`(同 id 覆盖,id 必填校验)/ `deleteOpenCodeProvider`(过滤式删除),均照抄 plan |
| `electron/main.js` | import 区加 `const oc = require('./lib/opencode');`(此前不存在,无重复);`registerIpc()` 末尾加 `rs:oc:list` / `rs:oc:save` / `rs:oc:remove` / `rs:oc:readConfig` / `rs:oc:fetchModels` 五个 handler |
| `electron/preload.js` | 桥接 `ocList` / `ocSave` / `ocRemove` / `ocReadConfig` / `ocFetchModels`(置于 `importAccountFromCodex` 之后) |

未创建新文件。plan 提到 "Test: test/opencode.test.js(追加 store 集成测试)",但 Task 2 步骤里没有对应 Step,且任务指令明确"只修改三个现有文件、现有 81 例应全过",故未追加测试文件;store 新方法用一次性临时目录脚本验证(见下)。

## 对 plan 代码的 2 处有意偏差(均已在代码注释中标注)

### D1 — 显式传 `os.homedir()`,而非 plan 的 `undefined`

- **事实**:任务指令称"`backupOpenCode()` 不带参数时用真实 home(~)",但 Task 1 实际实现是 `path.join(home || '', ...)`,`home=undefined` 时解析为**相对路径** `.config\opencode\opencode.json`(相对 cwd,`node -e` 实测 `isAbsolute: false`)。plan 的 `oc.writeOpenCodeConfig(undefined, merged)` 会把配置写到 cwd 下的错误位置。
- **修法**:main.js 里 `const ocHome = () => require('os').homedir();`,五个涉及文件系统的调用全部显式传 `ocHome()`。行为符合 plan 的注释意图("真实 home")。
- **根因在 Task 1 的 `opencode.js`**(`home || ''` 应为 `os.homedir()` 兜底),受"只改三文件"约束未动它;建议后续任务顺手修正纯函数层默认值。

### D2 — `rs:oc:fetchModels` 的 `getRelay` 包 try/catch

- **事实**:`store.getRelay(id)` 找不到时 **throw**('中转站不存在'),不返回假值;plan 代码里 `if (!relay)` 是死分支,throw 会让 invoke promise reject,而 Task 4 的渲染层调用无 try/catch,会变成未处理拒绝。
- **修法**:`try { relay = store.getRelay(relayId); } catch (e) { return { ok: false, error: e.message }; }` — 保持 plan 意图的 `{ ok: false, error }` 返回形状。

## 验证

- `node --check` 三个文件:SYNTAX OK
- `node --test test/*.test.js`:**81 pass, 0 fail**(与基线一致,无回归)
- `node lint-imports.js`:**ALL_CLEAN**(该 lint 只审计 src/*.jsx,本次改动在 electron/,不受影响)
- store 新方法临时目录功能验证(脚本一次性跑完即删):空列表 / 同 id 覆盖 / 多条追加 / 持久化 roundtrip / 无 id 抛错 / 删除保留其余 — 全部断言通过

## 提交

- `d836233` — `feat: opencode store + IPC(rs:oc:save/remove/list/readConfig/fetchModels)`(3 files, 77 insertions, 2 deletions,main 分支,延续既有工作流)

## 顾虑 / 后续任务注意事项

1. **apiKey 明文落盘(Important,建议审查轮裁决)**:`rs:oc:save` 按 plan 原样执行 `store.saveOpenCodeProvider(p)`,`p.apiKey` 以明文存进 `userData/store.json`。store.js 自身约定是敏感字段走 safeStorage 加密(relays 的 `apiKeyEnc` 先例),两者不一致。plan/Task 4 的 `ocList → setEditing(p)` 依赖原形状回填,若改为加密需同步 Task 4 的表单处理 — 本任务未擅动,留给审查/后续。
2. **auth.json 损坏时 save/remove 整体失败(符合预期但值得知晓)**:按 Task 1 审查修复,`readAuthFile` 对损坏 auth.json 会 throw;两个 handler 的 catch 已兜住并返回 `{ ok: false, error }`(任务指令要求满足)。但注意失败发生在 `writeOpenCodeConfig` 之后、`writeAuthFile` 之前时,opencode.json 已写入而 auth 未更新(save 分支)— 下次成功调用会补齐,且写前备份已生成,可手工回滚。
3. `rs:oc:remove` 与 plan 一致:**即使 opencode.json 里没有该 provider 也会照常执行并返回 ok**(备份生成空目录时 backupOpenCode 返回 null 不报错;removeProviderBlock 对不存在 id 是幂等的)— 对"从 RS 库清理残留条目"反而是正确行为。
4. Task 4 消费接口已就位:`window.rs.ocList()` 返回 provider 对象数组(含 apiKey 明文,见顾虑 1);`ocSave/ocRemove/ocReadConfig/ocFetchModels` 均返回 `{ ok, ... }` / `{ ok: false, error }` 形状。

---

## 审查前修复轮(2 个正确性问题)

### 修 1 — opencode.js home 兜底真实 ~(修复 D1 根因 / 顾虑 1)

- **变更**:`configPath` / `authPath` / `backupDir` 三处 `path.join(home || '', ...)` → `path.join(home || os.homedir(), ...)`;顶部加 `const os = require('os');`;文件头注释同步为「路径默认真实 home(~),可通过传入 home 覆盖(测试用)」。
- **效果**:不带参数调用 `backupOpenCode()` / `readOpenCodeConfig()` 等即走真实 `~`;main.js 里 Task 2 加的显式 `ocHome()` 传参保留(显式优于隐式,双保险)。
- **验证**:grep 确认 `home ||` 仅剩三处且均为 `os.homedir()`;`configPath()` / `authPath()` 无参解析为绝对路径且以 `os.homedir()` 开头;显式传参仍优先覆盖。

### 修 2 — store.js apiKey 加密落盘(修复顾虑 3)

- **变更**(按用户给定代码照抄):
  - `saveOpenCodeProvider(p)`:`const toStore = { ...p }`,有 `apiKey` 时 `apiKeyEnc = enc(apiKey)` 并 `delete toStore.apiKey`,落盘只含 `apiKeyEnc`;
  - `listOpenCodeProviders()`:`map` 中对含 `apiKeyEnc` 的记录 `{ ...p, apiKey: dec(p.apiKeyEnc) }` 解密返回,其余原样。
- **main.js 无需改动**(用户确认):IPC handler 调 `store.listOpenCodeProviders()` 拿到的已含解密后的 `apiKey`,Task 4 的 `ocList → setEditing(p)` 表单回填不受影响。
- **验证**(临时目录功能测试):带 key 保存 → store.json 无明文 `sk-PLAINTEXT-123`、有 `apiKeyEnc`;list 解密回原值;无 key 记录原样;新实例读盘 roundtrip 解密正常;**旧明文记录(d836233 形状)向后兼容** — 无 `apiKeyEnc` 的记录 list 原样返回,不丢数据,下次保存自动转为加密形态。
- **备忘**:测试/脚本环境无 electron safeStorage 时,`enc()` 按既有逻辑回落 base64(`{ enc: false }`),行为与 relays 的 `apiKeyEnc` 一致。

### 修复轮验证与提交

- `node --check` 两文件通过;`node --test test/*.test.js` → **81 pass, 0 fail**;`node lint-imports.js` → **ALL_CLEAN**
- `c48aa58` — `fix: opencode 路径无参兜底真实 home(~)+ store apiKey 走 safeStorage 加密落盘`(2 files, 19 insertions, 8 deletions)

### 剩余已知事项(非阻塞)

- D2(fetchModels 的 getRelay try/catch)为对 plan 死分支的意图修正,非缺陷。
- auth.json 损坏时 save 分支存在 opencode.json 已写、auth 未写的瞬间不一致 — 写前备份已生成可回滚,下次成功调用补齐。
- `dec()` 在系统凭据不可用时抛错,`listOpenCodeProviders` 不逐条兜底(与现有 `getRelay` 暴露方式一致,Task 4 渲染层如需可加 catch)。
