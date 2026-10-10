# Task 1 Report: opencode.js 纯函数层

**状态:DONE**(含审查修复轮)

## 交付物

| 文件 | 说明 |
|---|---|
| `electron/lib/opencode.js` | 新建(照抄 brief 实现,后经审查加固):PROTOCOL_ADAPTERS、configPath/authPath、stripJsonComments(JSONC→JSON)、readOpenCodeConfig(JSONC 容错 + `_hasComments` 标记)、writeOpenCodeConfig(剥 `_hasComments`、2 空格缩进 + LF)、readAuthFile/writeAuthFile、mergeProviderBlock(同 id 覆盖、其余保留、defaultModel 同步顶层 model)、removeProviderBlock(摘除 + 顶层 model 指向该 provider 时清除)、backupOpenCode(时间戳快照目录,两文件均不存在则清目录返回 null) |
| `test/opencode.test.js` | 新建(照抄 brief 测试 13 例,后补 3 例回归) |

未修改任何其他现有文件。

## TDD 流程实录(首轮)

1. **红**:先写测试并运行 → FAIL(Cannot find module `../electron/lib/opencode.js`),符合预期。
2. **绿**:写入实现后重跑 → 13 pass, 0 fail。
3. **全量**:`node --test test/*.test.js && node lint-imports.js` → 78 pass(65 旧 + 13 新), 0 fail;`LINT_IMPORTS: ALL_CLEAN`。

## 首轮提交

- `5b7e607` — `feat: opencode.js 纯函数 — JSONC 解析/合并/摘除/auth/备份/协议映射(13 例单测)`(2 files, 263 insertions)

---

## 审查修复轮(3 Important)

### F1 — mergeProviderBlock 变异输入(opencode.js)

**问题**:浅拷贝 `const out = { ...existing }` 后 `out.provider[pd.id] = ...` 原地修改了 `existing.provider`(共享引用),违反纯函数契约。
**修法**:`if (!out.provider) out.provider = {};` 替换为 `out.provider = { ...(out.provider || {}) };` — 赋值前先复制 provider 映射。
**回归测试**:`mergeProviderBlock: 不变异输入 existing(纯函数契约)` — 调用前深快照,调用后 `assert.deepEqual(existing, snapshot)`,并断言原对象里旧 provider 保持 `npm: 'old'`、输出里是新版。

### F2 — _hasComments 对 URL 误报(opencode.js)

**问题**:检测正则 `/\/\/|\/\*/` 会命中 `"https://"` 里的 `//`,每个含 baseURL 的真实配置都误报有注释。
**修法**:改为 `const stripped = stripJsonComments(raw); const hasComments = stripped !== raw;`,JSON.parse 复用 stripped(stripJsonComments 本身对字符串内 `//` 处理是正确的,问题只在检测正则)。
**回归测试**:`readOpenCodeConfig: 纯 JSON 含 https:// URL 不误报 _hasComments` — 纯 JSON 含 `"baseURL": "https://api.example.com/v1"` 断言 `_hasComments === undefined`。原有「真注释 → true」用例继续通过。

### F3 — readAuthFile 吞 parse 错误(opencode.js)

**问题**:`catch { return {} }` 不区分 ENOENT 与 JSON.parse 失败 — auth.json 损坏时 read→modify→write 链会静默清空全部 key。
**修法**:`catch (e) { if (e.code === 'ENOENT') return {}; throw new Error('auth.json 解析失败: ' + e.message); }`。
**回归测试**:`readAuthFile: auth.json 损坏时抛异常而非返回空对象` — 写入 `'{broken json'`,`assert.throws(() => readAuthFile(home), /auth\.json 解析失败/)`。

### 修复轮验证

- `node --test test/opencode.test.js` → **16 pass(13 + 3 回归), 0 fail**
- `node --test test/*.test.js && node lint-imports.js` → **81 pass(65 基线 + 16), 0 fail + LINT_IMPORTS: ALL_CLEAN**

### 修复轮提交

- `7cf3106` — `fix: opencode.js 纯函数加固 — 合并不变异输入 / _hasComments 防 URL 误报 / auth.json 损坏显式抛错(3 例回归)`(2 files, 35 insertions, 4 deletions)

## 备注 / 顾虑

- 无阻塞顾虑。备忘:
  1. `stripJsonComments` 按设计不处理字符串内部伪注释(brief 已注明"够用")。
  2. `backupOpenCode` 的 `fs.rmdirSync` 在新版 Node 有 deprecation 倾向,当前静默通过,后续可换 `fs.rmSync(bdir, { recursive: true })`。
  3. 测试文件中 `OC_HOME`/`OC_DATA` 为 brief 原文自带、未被引用,照抄保留。
  4. 报告路径勘误:首轮报告误写到 `.superdesign/sdd/...`,本轮已在本正确路径(`.superpowers/sdd/...`)重建完整报告并删除误置文件。
