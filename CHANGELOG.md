# Changelog

## v1.13.1 (2026-10-26) — 修新增思考档位输入文字不可见

- **根因**:新增档位的输入框缺少 `type="text"`,没有命中全局深色输入框样式,
  回落为浏览器默认黑字,压在深色卡片上看起来像没输入;回车后变成普通档位卡才恢复可见
- **修复**:输入框显式声明文本类型,沿用现有白字与深色背景;回车提交、失焦提交及 Escape 取消逻辑不变
- **界面验证**:在隔离临时环境中输入 `xhigh` 且不按回车,文字颜色实测为 `rgb(245, 245, 244)`,
  输入框保持焦点、内容即时可见;截图确认未提交状态下也能读到输入
- 新增输入框样式回归测试;全量单测 104/104、smoke 39/39 通过

## v1.13.0 (2026-10-26) — OpenCode provider 统一原生 V2,修 compatibility 被忽略

- **根因**:RS 在旧 `provider` 块里混写 V2 的 `modelID` / `capabilities` / `settings` /
  `compatibility`,却保留 V1 对象 variants。OpenCode 2.1.4 对单个 provider/model
  不支持 V1/V2 混用,按 V1 解析后忽略全部 V2 字段;`supportsThinkingBlockBinding:false`
  即使已写入文件也不会生效,继续发送 `thinking.adaptive.block_binding`
- **统一原生 V2**:保存中的 provider 迁移到 `providers` / `package` / `settings`,
  同 id 的旧 `provider` 块移除;模型不再输出旧 `reasoning` / `attachment` / `temperature`,
  variants 统一转为 `{id, settings}` 数组
- **保真迁移**:已有 `compatibility`、`capabilities`、`modelID`、`settings` 原样保留;
  旧 variants 的 `effort` 转为 `settings.reasoningEffort`,DeepSeek `off` 档的
  `thinking:{type:'disabled'}` 不丢,`body` / `headers` 保留
- **验证**:OpenCode 2.1.4 在独立临时 HOME + 独立端口 28991 的 `debug config` 中,
  确认 `compatibility.supportsThinkingBlockBinding:false` 已进入生效模型配置;
  全程未修改用户正在由另一对话维护的真实 opencode 配置
- 全量单测通过,新增 V2 容器迁移/compatibility/variants/thinking 保留覆盖

## v1.12.12 (2026-10-26) — 修 opencode 配置带 BOM 时整份读取失败

- **症状**:编辑 Provider 后点「写入 opencode 配置」,报
  `opencode.json 解析失败: Unexpected token '﻿', "﻿{..." is not valid JSON`——
  连原来正常的 provider 都写不进去
- **根因**:`opencode.jsonc` 开头被写入了 UTF-8 BOM(EF BB BF)。Windows 记事本 /
  PowerShell `Set-Content` 保存 UTF-8 时默认带 BOM,而 `JSON.parse` 会把 BOM 当非法
  字符,直接拒绝整份配置。实测本机文件 BOM=True,历史备份全部 BOM=False
- **修复**:`readOpenCodeConfig` 读入后先剥掉 BOM 再解析。写回仍是标准 JSON(无 BOM)
- 实证:本机真实配置(11KB、7 个 provider)修复前解析失败,修复后完整读出
  dihuang-zcode / dihuang-workbuddy / dihuang-accio / muse / star / Argon / Pulse
- 单测 99/99(新增 BOM 场景)

## v1.12.11 (2026-10-19) — OpenCode 表单四处体验修复(手写站拉模型 / 不再默认推荐 / 回显 / 数字输入)

- **手写的中转站现在也能拉模型**:原来「从 /v1/models 拉取」按钮只在选中站库里的站时才出现,
  手填 Base URL 的站完全没有入口。现在按钮常驻,只要 Base URL 有值就能用当前填的
  Base URL + API Key 拉取(新增 `resolveFetchTarget`:表单值优先,缺了再回落到站库)
- **新建模型默认「自定义」**:原来打开就是「跟随推荐配置」开关 ON,字段被锁死。
  现在默认空配置,推荐值降级为一次性「套用推荐参数」按钮——点了只是把值填进表单,之后照样随便改
- **修「配好再点进去又变推荐值」**:原来 `follow` 初始恒为 true,重开弹窗一律套推荐值;
  更糟的是保存时 `follow` 为 true 会**用推荐值覆盖已存参数**。现在打开即回显真实保存值,
  推荐配置不再有"状态",只影响你主动点它的那一次
- **数字输入不再和 0 搏斗**:上下文窗口/最大输出原来 value 绑 `0`,`type=number` 下点进去
  光标落在 0 后面、要手动全选再删。现在改为受控文本输入:0 显示为空(0 本就是"不写入"的哨兵)、
  聚焦自动全选、非数字字符直接过滤
- 单测 98/98(新增 4 例 resolveFetchTarget:手写站/旧 relayId 调用/表单值优先/缺值报错)

## v1.12.10 (2026-10-15) — 新增 provider 的 variants 跟随文件形态(修「加一个,opencode 全部消失」)

- **修复写入后 opencode 里什么都没有**(真机复现):v1.12.9 只修了顶层键,
  新增 provider 的 `variants` 仍固定写数组形态。opencode 1.19 及更早要求
  variants 是对象,**一个数组就拒绝整份配置**——本机实证:RS 写入
  dihuang-accio 后,`opencode models` 直接报 Configuration is invalid,
  连原来正常的 dihuang-zcode / dihuang-workbuddy 一起消失
- **variants 形态跟随文件**:新增 provider 没有自己的形态记录,写回时扫描
  文件里已有 provider 的 variants 形态并跟随(旧版对象 / 新版数组);
  导入的 provider 仍按读到的形态原样写回
- 实证:以本机 19:57 写入前备份复现「新增 accio」,variants 写成对象、
  三个 provider 同在 `provider` 键下;只改形态后 OpenCode 1.19.0 即列出全部
- 单测 95/95(新增:旧形态文件新增 provider 的 variants 必须是对象)

## v1.12.9 (2026-10-14) — 双修:中转模式切换中止(补丁炸目录生成)+ OpenCode 写入跟随键形态

### 修复一:中转模式切换中止 —— 站清单无模板模型时补丁炸目录生成(本机)
- **根因**(最小复现百分百命中):中转模式目录补丁只对「站清单里已有的 slug」校准——
  站里有 `gpt-6-sol` 就会跑它的补丁(模板声明 `gpt-6-astra`),但派生目录只含站内模型,
  站清单没有 astra(dihuang 等站实测:有 sol/luna、无 astra)→「模板不存在于目录」→
  切换中止
- **修复**(`mergeCustomModels`):模板缺席但目标 slug 已在目录时,用既有条目当底做
  校准覆盖;模板与 slug 都不在才报错(真配置错误不放过)
- 端到端验证:真实提取目录 + dihuang 真实清单 → 补丁通过,gpt-6-sol 校准 272K/medium/五档,
  terra 照常隐藏;新增 test/catalog-merge.test.js(回落校准 + 双缺席守卫)

### 修复二:OpenCode 写入跟随配置文件的键形态(协作机)
- v1.12.6 起写回一律写顶层 `providers`(复数)键,但 opencode 1.19 及更早只认
  `provider`(单数)键,写进复数键的块被整块忽略——「RS 里加了,opencode 里没有」
- **写回跟随文件已有形态**:只有单数键的文件写单数键并用旧字段名(npm/options);
  已是复数键的维持新形态(package/settings)。dev 新版 schema 只认复数键,不能一律倒退
- 实证:写入产物交 OpenCode 1.19.0 加载,新块与旧块同时列出、退出码 0


## v1.12.8 (2026-10-14) — OpenCode 已有 provider 检测:兼容 jsonc 文件名与旧版 variants 对象形态

- **修复「小电脑一个 provider 都检测不到」**(真机复现):检测只读 `opencode.json`,而
  opencode 官方加载器认两个文件名(`opencode.json` 与 `opencode.jsonc`,jsonc 优先)。
  配置写在 `opencode.jsonc` 的机器上,检测读到的是空文件,列表永远为空
- **修复检测被静默打崩**:`variants` 有两种合法形态——新版是数组 `[{id, settings}]`,
  1.19 及更早是对象 `{id: {effort}}`(本机装的 OpenCode 桌面版 1.19.0 实测:**数组形态
  直接报 Configuration is invalid**)。旧代码只认数组,遇到对象形态抛 TypeError,
  异常被 `rs:oc:list` 吞掉,表现同样是「一个都没检测到」
- **写回跟随读到的形态**:读自 jsonc 写回 jsonc(不再另造一份 opencode 不优先读的 json);
  对象形态的 variants 原样写回,只做档位增删,绝不改写成数组(否则旧版 opencode 配置非法)
- 实证:本机真实 opencode.jsonc(2 provider / 5 模型)检测读全;RS 写回管线往返产物
  交 OpenCode 1.19.0 加载,5 个模型原样列出、退出码 0
- 单测 93/93(opencode 23→28,新增 jsonc 优先/双文件并存/jsonc 写回/对象形态读/对象形态写回)

## v1.12.7 (2026-10-14) — OpenCode baseURL 防呆:裸域名自动补 /v1(修 Not Found)

- **修复 404 Not Found 坑**(真机复现+矩阵实证):opencode 的 `@opencode/ai/providers/anthropic`
  包把 baseURL 当完整 API 根,只追加 `/messages`(不像 Anthropic 官方 SDK 自补 /v1)——
  baseURL 缺 `/v1` 时请求打到 `/messages` 直接 404。三种协议包统一要求 baseURL 含 `/v1`
- **保存时自动规范化**(`normalizeBaseUrl`):裸域名(如 `https://gw.example.com`)自动补
  `/v1`;已含 `/v1` 或自定义路径(如 `/api`)的不动,尊重显式选择;表单提示同步更新
- 实证记录:anthropic(message)与 openai(responses)包在该网关实测可用,`#variant`
  档位切换全通;openai-compatible(chat)包对自定义模型报 Model unavailable,建议中转站
  优先选 Anthropic Messages 协议
- 单测 88/88,冒烟 39/39,build + lint 全绿

## v1.12.6 (2026-10-14) — OpenCode 真 schema 全面切换 + 已有配置自动全量接管

- **Schema 迁移(重大修正)**:v1.12.0-v1.12.5 依据过时文档实现的 `provider`/`npm`/`options`
  + auth.json 是旧形态;本版以**本机 opencode-cli 二进制实测 + 用户真实 opencode.json** 为准
  全面切换真 schema:顶层 `providers`(复数)、块内 `package`(`@opencode/ai/providers/*`)与
  `settings`,**apiKey 存 provider settings(auth.json 彻底退役)**,模型条目
  `modelID`/`capabilities`(tools+input/output)/`settings`/`variants`/`limit`
- **自动全量接管**:打开 OpenCode 页即识别 opencode.json 里已有 provider(新旧双形态兼容读),
  自动导入 RS 管理(key/settings/模型全字段;原文件零改动);首次导入 toast 提示
- **档位卡片 ↔ 原生 variants 直译**:导入识别 variants(如 high/xhigh)为档位卡;选中档位写
  base `settings.reasoningEffort`,选中 variant 时其 settings/body 叠加为基础值;新增档位
  自动生成 variant、删除档位移除 variant;基础档(baseEffort)不误合成 variant
- **无痕保真**:RS 未建模内容全保留——块级未知键(rawExtra)、settings 内未知键如
  timeout(settingsExtra)、模型条目 cost/body/compatibility(rawExtra);写回时原样合回;
  **真机往返自检深度一致**;同 id 旧形态块写回时自动清理避免双写
- 单测 86/86,冒烟 39/39,build + lint 全绿

## v1.12.5 (2026-10-14) — OpenCode 配置三层架构落地(ZCode 式):嵌套模型弹窗 + 跟随推荐配置 + 思考强度档位卡片

- **信息架构重构**(参照 ZCode 桌面客户端「模型供应商」设置,逆向其 asar 提取结构;
  设计稿:主 Modal = superdesign e904bc75 收敛版,模型弹窗 = byok-design-mcp/GLM-5.3 三迭代定稿 ffc4ad1b):
  - **主 Modal 只管连接**(收窄到 680px):分组「接入」(中转站/Base URL/协议/API Key)、「标识」
    (Provider ID + 新增 Provider 名称字段)、「模型清单」、「默认模型」
  - **模型清单 = 行列表**(取代 v1.12.3 的参数海):每行 = mono 金色 ID + 显示名 + ctx 徽章 +
    effort 徽章 + 编辑(笔)/移除(✕)hover 图标钮;点击行打开编辑弹窗
  - **嵌套「编辑模型」弹窗**(640px,portal 挂 body 叠于主 Modal 之上):标题 + 金色 mono 模型
    ID 徽章;**「跟随推荐配置」开关**(ON = 绿色提示条 + 字段显示推荐值禁改,OFF = 全字段可编辑)
  - **思考强度档位卡片**(取代 options JSON 手写):low/medium/high/max 卡片,点击选中(金色高亮)、
    行尾 ✕ 删除、虚线「+ 新增档位」卡内联输入自定义档位(如 ultra);选中档位写入
    `options.reasoningEffort`,未选中不写,其余 options 键保留
  - 弹窗 footer:左「删除模型」红字钮,右 取消/保存模型;基本组四字段统一居左对齐
- **设计管线**:新增 byok-design-mcp(用户自研设计 MCP)通道;`#opencode-demo-dialog` 截图态
- 单测 81/81,冒烟 39/39,build + lint 全绿;DOM 探针实证跟随推荐配置生效(绿条+推荐值+仅工具开)

## v1.12.4 (2026-10-11) — 自动更新挂死修复:硬超时弃船 + 更新日志落盘

- **修复更新循环永久冻结**(2026-10-11 实证:v1.12.2 升 v1.12.3 时代理抖动,downloadUpdate
  挂死、`cts.cancel()` 掐不断挂死的请求、`await` 永不返回 → 重试循环整体冻结,UI 卡在
  "下载中"再无事件;取证:RS 进程一条到 Clash 的 ESTABLISHED 连接零流量 + pending/ 不再被触碰):
  - **checkForUpdates 超时 45s**:此前看门狗只护下载阶段,check 挂死处于无保护真空
  - **单次尝试硬超时 5min**(Promise.race 弃船):不依赖 `cancel()` 生效,任何阶段挂死
    到点即弃,循环立即进入下一轮;挂死的旧 promise 任其自然了结、结果弃置
  - **更新日志落盘** `%APPDATA%\relayswitcher\logs\update.log`(超 1MB 自动翻新):
    attempt start/noop/ok/fail 全记录,线上挂死类问题不再无据可查
- 单测 81/81,冒烟 39/39,build + lint 全绿
- 注:v1.12.2 及更早版本若已卡死,需手动完全退出 RS(托盘右键退出)重开一次才能收到本版

## v1.12.3 (2026-10-11) — OpenCode 模型条目 superdesign v4 卡片网格重构

- **模型条目从「表格式」推翻重做为「卡片网格」**(superdesign v4 定稿,用户裁定 v1.12.2
  表格比例失衡不合格):
  - 每模型一张 12 列网格卡:ID/显示名 竖排(3 列)| CTX/OUT 竖排带左右分隔线(2 列)|
    能力与选项(6 列)| 圆形移除钮(1 列)——字段竖排填满卡高,表格时代"单行字悬浮在
    大片空白里"的死区彻底消失
  - 卡片上方保留 3/2/6/1 列头带对齐语义;卡片 hover 金色描边
  - 移除钮(垃圾桶)默认 40% 暗,整卡 hover 才点亮,hover 自身红底
  - 数字输入隐藏 Chromium 原生上下箭头(styles.css 补 webkit 规则);CTX/OUT mono 居中,
    6-7 位数字完整显示
  - options JSON 空值时 60% 暗显占位,有值时全亮;「手动添加模型」金色文字钮固定在
    区块标题右侧(不再底部游离)
- 上一版(v1.12.2)已按 v3 设计稿锁列宽但仍保留能力列,真实数据下依旧失衡,故有本版
- 单测 81/81,冒烟 39/39,build + lint 全绿;--capture 三态出图正常

## v1.12.2 (2026-10-10) — OpenCode 表单 superdesign v2 重构 + 界面卡顿修复

- **OpenCode 表单按 superdesign v2 设计稿重构**(用户裁定 v1 不合格):
  - 模型条目改为**表格式布局**:ID(mono)/ 显示名 / CTX / OUT / 能力与选项 / 移除 六列,
    多模型纵向对比一目了然;CTX/OUT 全宽居中,7 位数字完整可见
  - 能力开关排成 **2×2 网格**(推理/附件/工具/Temp),模态 chips 紧凑化(输入/输出两行)
  - options JSON 输入框收入能力列,行尾灰色 ✕(hover 变红)专职移除
  - 基本信息区两列排布(中转站独占一行;Base URL↔协议类型、Provider ID↔API Key 成对);
    Modal 加宽 720→860
  - demo 截图状态新增 `#opencode-demo-rows`(预填两行模型,验证表格布局)
- **界面卡顿修复**:`webPreferences.backgroundThrottling: false` — 窗口失焦/被遮挡时
  Chromium 不再节流渲染,切回不再卡一帧
- 单测 81/81,冒烟 39/39,build + lint 全绿;--capture 全 12 态出图正常

## v1.12.1 (2026-10-10) — OpenCode 表单完善:能力开关全量 + apiKey 自动带入 + 布局修复

- **模型条目表单补全**(用户反馈,对照官方 schema 18 字段):
  - 能力开关补至四个:**推理 / 附件 / 工具调用 / 支持 temperature**(全部 Toggle)
  - 新增**输入/输出模态多选**(text / image / audio / video / pdf,chip 形态)——"收图"能力在此声明
  - options JSON 透传保留(留空不写入,JSON 不完整红字提示)
  - 所有字段写入 opencode.json 的模型条目(main.js 映射同步)
- **apiKey 自动带入**:选中转站后 key 留空 → 从站库自动带入(safeStorage 解密),
  不再要求用户手动复制粘贴
- **布局修复**(用户反馈):移除按钮移回行内(不再脱离);数字框加宽(110px,能装 7 位)
- 单测 81/81,冒烟 39/39,build + lint 全绿

## v1.12.0 (2026-10-10) — OpenCode Provider 管理 + 导航重构:RS 升格为多客户端配置管理器

- **OpenCode Provider 管理**(方案 A→2):
  - 独立 OpenCode 页:Provider 列表(协议徽章/模型数/默认模型)+ 新建/编辑/移除
  - 表单:中转站选库(自动拉 /v1/models)或手写 URL;**协议三选一**(message/chat/responses
    → @ai-sdk/anthropic / openai-compatible / openai);Provider ID;API Key(safeStorage
    加密落盘);**模型条目勾选+手动添加**(每条可编辑 name/limit/context/output/reasoning/options
    JSON 透传);默认模型下拉
  - 写入管线:备份(opencode.json+auth.json)→ 外科合并(只动 RS 注入的 provider 块,
    用户手写配置原样)→ auth.json 操作 → 提示重启 opencode(无热重载)
  - JSONC 容错解析(含注释检测与写回警告);apiKey 走 auth.json 不进 opencode.json
- **导航重构**(superdesign 三稿定稿):
  - 侧边栏五项:**ChatGPT / OpenCode / 中转站 / 备份 / 设置**
  - ChatGPT 页头双图标(👤账号 / ⚙设置);Settings 按归属拆分(global/chatgpt/opencode)
  - 「仪表盘」全部更名为「ChatGPT 页」;hash 路由支持子模式(#settings-chatgpt 等)
- **新文件**:`electron/lib/opencode.js`(纯函数 16 例单测)+ `src/pages/OpenCode.jsx`
- 单测 81/81(含 opencode 16 例),冒烟 39/39,build + lint 全绿

## v1.11.12 (2026-10-01) — 6.1-sol 按原生目录校准:补回 max 档,修正默认档与硬顶

- **背景**:2026-10-01 06:53 的 codex.exe 已原生收录 gpt-6.1-sol,原生参数把 API 文档页
  全部推翻 —— 文档写 4M 硬顶/默认 high/无 max,客户端目录实为 **872K/默认 low/含 max**
  (文档少列档位是惯例:此前 astra 的 ultra 也被隐)。exe 收录后我们的补丁条目反而会
  覆盖原生值造成降级(删 max/改默认/放大硬顶),必须立即校准
- **变更**:补丁条目改为原生参数 —— efforts 补回 max(low→…→max→ultra 全梯)、默认档
  low、硬顶 872K、描述同步原生;ultrafast 速度档声明保留(RS 增值,原生不声明)
- 单测 65/65,冒烟 39/39

## v1.11.11 (2026-10-01) — 备份瘦身:同内容硬链接去重 + 存量压缩

- **背景**:备份目录 11MB/20 份,单份 545KB 里 **522KB 是模型目录文件**(占 99%),而目录
  内容很少变化——每次切换都在重复存同一坨
- **新增**:
  - **写入去重**:新备份写文件时,若既有备份已有同名同内容文件,硬链接复用(sha256 校验,
    失败回退拷贝)——目录不变时新增备份近乎零磁盘
  - **存量压缩**:每次备份前对全部既有备份跑一遍 compactBackupDupes,同内容文件硬链接
    合一(旧备份立即受益,预期 11MB → ~1.5MB)
  - 轮转上限维持 20 份;硬链接只读语义不变,回滚照常读
- 单测 +3(写入去重/不误伤独立文件/存量压缩),共 65/65;冒烟 39/39

## v1.11.10 (2026-09-30) — 切换时顺手清理官方已废弃配置键

- **背景**:2026-09-30 Codex 更新把 `[features.guardianv2].thread_context` 标记废弃(线程级
  Guardian 上下文已永远开启),配置页每次打开弹警告催清理
- **新增** `codex.js stripDeprecatedKeys`:切换管线里行级摘除官方点名废弃的键(含 profile
  覆盖段,段被清空则连段头一起移除);废弃键走 `DEPRECATED_KEYS` 清单,官方再点名就追加
- 单测 +5(段内保留/空段收尾/profile 段/防误伤/无命中不变),冒烟 +1;共 62/39 全过

## v1.11.9 (2026-09-30) — 目录补声明 Ultra Fast 档:速度选择器解锁三档

- **机制认知修正**:客户端速度档选择器由**目录元数据驱动**(`service_tiers` /
  `additional_speed_tiers`,标签来自数据而非二进制硬编码)——提取快照每模型只声明 Fast
  一档,选择器就被限在两档;用户实证正常桌面客户端有三档
- **变更**:catalog-patch 给 gpt-6-astra(官方 ultrafast guide 实锤全面开放)与
  gpt-6.1-sol(媒体报道,~300 tok/s)补声明 `ultrafast` 档:service_tiers 增加
  {id: ultrafast, name: "Ultra Fast"},additional_speed_tiers 同步;其余模型不动
- catalog-merge 新增 `serviceTiers` / `additionalSpeedTiers` 覆盖支持
- 能否真正使用 Ultra Fast 仍由服务端按模型/账号门控(astra 开放,价格 6x Standard =
  3x Fast);选项出现是第一步
- 单测 57 例全过,冒烟 38/38

## v1.11.8 (2026-09-30) — 速度档彻底归还客户端:RS 不再写 service_tier

- **背景(调研实锤)**:官方速度档已多档化 —— `priority` 已更名 Fast(新值 `fast`,旧值仍受),
  并新增 **`ultrafast`** 最快档(gpt-6-astra 全面开放,价格 6x Standard=3x Fast;gpt-5.6-sol
  邀请制 preview;gpt-6.1-sol 媒体报道 ~300 tok/s 官方文档未收录),可用性由服务端按模型/账号
  门控,客户端目录与二进制均滞后
- **问题**:RS 自 v1.4 起每次切换把 `service_tier` 钉死为 `priority`(旧名),**踩掉客户端
  自己的档位选择**——用户在客户端选的档,下次切换就被打回 priority,这就是"我们实际只有两档"
  的根源
- **修复**:applySwitch 不再写/删 `service_tier`(已存在的值原样保留,由客户端选择器接管)——
  v1.7.2「快速模式归还客户端」的彻底完成:UI 当时删了,写入现在也拆了
- 冒烟断言更新:service_tier 不再由 RS 写入;单测 57 例全过

## v1.11.7 (2026-09-28) — 桥接 gpt-6.1-sol(4M 上下文,exe 滞后期先行补入)

- **背景**:gpt-6.1-sol 官方 2026-09-28 发布(模型页已上线),codex.exe 内嵌目录尚未收录
  ——沿用 v1.10.3 桥接打法,策略表先行补入
- **参数(官方文档实测)**:上下文 4,194,304(4M,为 6-sol 的 4.8 倍)、默认档位 **high**、
  档位 low→ultra(ultra 需额外权限层)、定位 "Near-Astra performance at Sol prices";
  6.1 家族暂只有 Sol
- **计费注意**:>272K 长上下文整单 **2x 且输出也是 2x**($5/$0.50/$24,非 6 系的 1.5x 输出);
  软限仍压 272K 计费线,吃满 4M 需手填顶层 model_context_window
- 中转模式同样校准该条目;exe 收录后自动退化为参数校准
- 单测 57 例全过,冒烟 38/38

## v1.11.6 (2026-09-27) — tasklist/taskkill 全部加超时:进程枚举病态慢不再卡死切换

- **背景(小电脑 2026-09-27 事故)**:Codex 桌面版更新后,本机 `tasklist` 跑一次实测 2m03s
  (正常 <1s)。doSwitch 首步 Promise.all 里的 detectRivalTools 用 execFile('tasklist') 无超时
  裸跑 → 每次点切换都卡在竞品检测等两分多钟,表现为「一直处理中」,且连 switch 备份都未产生
  (流程没进 applySwitch)
- **修复**:三处 execFile 全部加超时 —— detectCodexRunning / detectRivalTools 5s(超时按
  「未检测到」处理,跳过继续);stopCodexRunning 的 taskkill 8s。竞品检测/进程检测均为辅助
  功能,超时跳过零影响切换正确性
- 来源:小电脑分支(11ff28f),本机复核:单测 57/57、冒烟 38/38

## v1.11.5 (2026-09-25) — 看门狗补滴漏盲区:慢速卡 1% 也会自动重试

- **背景(实测)**:v1.11.0 的停滞看门狗只拦「30 秒完全无进展」,**慢速滴漏**(每几十秒挪几个
  字节)永不触发——实际发生:下载卡 1%(1.87MB/83MB)不动,而同时刻同路径实测 4MB/s,节点
  瞬时拥堵造成滴漏,看门狗全程无感
- **修复**:看门狗升级为滴漏感知——30 秒窗口内新增字节 <200KB(≈6.7KB/s)即视同停滞,取消
  重来;健康路径(4MB/s)秒级刷新不误伤
- 单测 57 例全过

## v1.11.4 (2026-09-24) — 5.6-sol / 5.6-luna 恢复显示

- **背景**:6-sol 发布后社区重度用户口碑普遍弱于 5.6-sol(产品线重排:sol 挪中端、Astra 接
  旗舰;跑分编码小涨但知识工作掉 ~100 Elo,高档位推理 token 2x 致净成本反高),官方客户端目录
  亦未隐藏 5.6 系。用户指令:恢复显示
- **变更**:catalog-patch 取消「6 系在场即隐藏同名 5.6 前任」策略,5.6-sol / 5.6-luna 回到
  选择器与 6 系并存(官方/中转两模式一致);gpt-5.6-terra 维持退役(用户此前指令)
- 历史说明顺带修正:头注中硬顶参数同步为官方客户端目录的 872K(v1.11.3 实测口径)
- 单测 57 例全过

## v1.11.3 (2026-09-23) — 策略表对齐官方原生:6 系已随客户端发布

- **背景**:2026-09-23 14:36 codex.exe 更新,内嵌目录正式收录 gpt-6-sol / gpt-6-luna
  (11 模型,含 ultra 于 6-sol,6-luna 无 ultra,软限 272K/硬顶 872K,medium 默认)
- **变更**:catalog-patch 补丁条目从「补入(API 文档参数)」降级为「按官方客户端目录实测
  参数校准」——硬顶从 API 文档的 1.05M 校准为客户端目录的 872K,描述文本同步官方原生;
  5.6 系替代隐藏与 terra 退役策略保留(RS 策略,官方方向一致)
- 顺带发现:官方此版把 daybreak-blue/red、gpt-5.4、auto-review 在客户端选择器隐藏
  (visibility: hide,API 仍可用);5.6 系官方仍可见,RS 更激进地按用户指令隐藏
- 单测 57 例全过

## v1.11.2 (2026-09-23) — 修复:设置页「本机提取目录」渲染崩溃

- **根因**:v1.10.2 拆 base_instructions 兜底时改了提取 report 结构(删 patchedSlugs),
  Settings 提取成功报告卡里「自动修补」行仍引用 `report.patchedSlugs.length` → TypeError
  触发渲染错误边界(v1.11.0 只修了同处 toast 的引用,漏了报告卡这一处)
- **修复**:报告卡引用改为空安全;单测 57 例全过
- 教训已沉淀:拆字段时全仓搜字段名兜底(v1.10.2 只搜了 electron/ 与 test/,漏了 src/)

## v1.11.1 (2026-09-23) — exe 图标/版本信息回归(告别 Electron 蓝灰原子)

- **背景**:`signAndEditExecutable: false`(历史解压问题防御)让 electron-builder 跳过 rcedit,
  打包出的 exe 没嵌自定义图标/版本信息 —— 安装器/桌面快捷方式全是 Electron 默认蓝灰原子
- **查证(2026-09-23)**:win32 上 rcedit 走 app-builder 自带预编译二进制,不碰 winCodeSign
  /darwin symlink,该防御属过度防御;签名无证书自动跳过,行为安全
- **修复**:electron-builder.yml 移除 signAndEditExecutable: false;构建产物实测验证
  —— 版本信息(FileDescription/ProductVersion)+ 自定义图标 256 档指纹均内嵌于 exe
- 快捷方式/任务栏/资源管理器随安装自动换回金色 RelaySwitcher 图标

## v1.11.0 (2026-09-23) — 自动更新全自动:停滞看门狗 + 自动重试,浏览器降级全删

- **背景(实测)**:v1.10.6 一键更新卡在 5%——electron-updater 差分下载在代理抖动下停滞且无
  超时机制,pending 烂尾文件不清理还影响后续下载;用户指令:浏览器降级整条删掉,全自动扛到底
- **更新器重构**(`electron/lib/auto-update.js`):
  - **停滞看门狗**:30 秒无下载进展自动取消重来(根治永久卡 5%)
  - **自动重试**:短期 3 连试,之后每 60 秒循环再战,直到成功;进度/重试/就绪状态全程事件驱动
  - **全量下载**:禁用差分下载(代理抖动环境全量更稳);每次尝试前清理 pending 烂尾缓存
  - **开机即自动下载**:启动检查发现新版直接后台开拉,装好后 autoInstallOnAppQuit 兜底;
    手点路径下载完立即重启安装;就绪后也可随时手点「立即重启安装」
  - **永不降级浏览器**:任何失败都走自动重试循环
- **更新卡(布局锁定 superdesign 迭代)**:三态呈现——下载中 N%(停滞时琥珀色『· 停滞自动
  重试(第 N 次)』)/ 时钟态『60 秒后自动重试 — 无需干预』/ 绿色就绪 + 金色「立即重启安装」
  (右对齐);删除『直接下载 exe』外部链接与全部浏览器降级 toast
- 顺手修复:目录提取成功 toast 引用已删的 patchedSlugs 会 TypeError(v1.10.2 遗留);
  preload 死接口 quitAndInstall 替换为 restartInstall
- 单测 57 例全过

## v1.10.6 (2026-09-23) — gpt-6-sol 补 ultra 档

- **定性(实测)**:ultra 是**客户端专属档位**(Max 推理 + 自动任务委派),API 文档页系统性不列
  ——astra / 5.6-sol / 5.6-luna 三页 effort 行全写到 max 为止,但客户端目录里 astra 和
  5.6-sol 明明有 ultra。v1.10.3 照文档落档把 sol 砍狠了
- **修正**:gpt-6-sol 追加 ultra(sol 系历代有,5.6-sol 就有);gpt-6-luna 维持 max——
  luna 系历代无 ultra(5.6-luna 也没有,效率线定位,ultra 的任务委派开销与它相悖)
- 单测 57 例全过;本版可用应用内一键更新升级(v1.10.5 起更新器已修复)

## v1.10.5 (2026-09-23) — 修复自动更新:electron-updater 未打进应用包

- **根因(实测 asar 实锤)**:v1.9.0 给 package.json 加了 electron-updater 依赖,但构建机的
  node_modules 从未真正安装(`--package-lock-only` 只写 lock 不装包),而 electron-builder 只打包
  node_modules 里实际存在的生产依赖 → 1.10.1~1.10.4 的 asar 里都没有 electron-updater,
  运行时 require 抛错 → 自动更新永远降级浏览器下载,还误报成"updater inactive (dev/未打包环境)"
- **修复**:真装依赖重新打包;构建后实测验证 asar 内 electron-updater 及传递依赖
  (builder-util-runtime / fs-extra / js-yaml)齐全
- 报错文案改诚实:区分「模块没打进包(装一次新版即修复)」与「dev/未安装环境运行」
- 单测 57 例全过

## v1.10.4 (2026-09-23) — 修正 6 系上下文计费档:软限回归 272K 省钱线

- **背景(官方模型页实证)**:计费按上下文规模分档 —— 输入 >272K 的请求**整单**按 2x 输入
  (含缓存)/ 1.5x 输出计费;目录软限(`context_window`,压缩线)在官方目录里全线压在
  272K(分档线),硬顶(`max_context_window`)才是能力上限
- **修正**:v1.10.3 把 gpt-6-sol/luna 写成 1050000/1050000(压缩线放到 1.05M,日常对话
  轻松越线、之后每单双倍计费)。本版改为官方模式:**软限 272K(省钱档)+ 硬顶 1.05M**;
  要吃满大窗口时在切换面板手填顶层 `model_context_window`(按需为单次任务开大)
- catalog-merge 新增 `maxContextWindow` 独立覆盖;单测 57 例全过

## v1.10.3 (2026-09-23) — 官方目录跟进策略:6 系上线,5.6 系交替,terra 退役

- **背景**:官方 2026-09-22 发布 GPT-6 Sol / GPT-6 Luna(API 已可用,中转站已同步),
  codex.exe 内嵌目录快照尚未收录。配置策略全部长在 RS 里(用户指令):改目录行为 = 更新 RS
- **新增 `electron/lib/catalog-patch.js`**:
  - 官方模式:按官方公布参数补入 `gpt-6-sol` / `gpt-6-luna`(上下文 1,050,000、默认档位
    medium、档位 low→max;模板继承 gpt-6-astra 的其余元数据)
  - 产品策略:被替代的 `gpt-5.6-sol` / `gpt-5.6-luna` 在 6 系在场时隐藏;`gpt-5.6-terra` 无
    6 系对位,直接退役
  - 中转模式:只校准中转站已提供的条目(参数对齐官方),不替中转站做加法
  - 内嵌快照追上后:已有条目自动退化为参数校准;下版移除策略表即完全回归快照
- catalog-merge 支持 `defaultEffort`(默认档位覆盖);单测 57 例全过(+4)

## v1.10.2 (2026-09-23) — 全面跟进官方原生:目录不再注入 base_instructions

- **背景(实测)**:2026-09-23 起官方 codex.exe 内嵌目录已不含 base_instructions —— 数据本身
  移出了二进制(全 320MB 只剩 15 处代码层字段名引用),客户端改为按需获取。旧机制给缺字段
  条目注入 gpt-5.5 全文兜底,外来文本反而可能覆盖客户端原生提示词
- **提取**:catalog-extract 拆除兜底注入,产物忠实镜像官方形态;结构校验只要求 slug 必有
- **部署预检**:不再要求 base_instructions(旧版 Codex 26.901.5003+ 的必填约束已随官方移除
  该字段而失效);预检改为只拦结构性损坏(JSON 损坏 / models 空 / 缺 slug),坏目录依然绝不写入
- **中转目录**:派生条目随模板镜像 —— 模板带 instructions 就继承,不带就不注入
- 冒烟场景 E 重写(官方原生形态必须可部署 + 缺 slug 坏目录必须被拒);单测 53 例全过
- 升级后首次启动,自动重提取会在 15 秒内产出官方原生形态的新目录(指纹已变自动触发)

## v1.10.1 (2026-09-22) — 修复:中转目录拉取在代理环境下必挂

- **根因(矩阵实证)**:切换时 `probeRelay` 与 `fetchRelayModels` 同一瞬间对同一网关双发 `/models`,
  均走系统代理(Clash)——实测该路径下并发双发只有一路能活(另一路挂死),probe 恒抢到活路,
  fetch 恒超时;且 `.catch(() => null)` 吞掉真实报错,只显示笼统的"拉取失败或为空"。网关本身无辜
  (直连单发/并发均亚秒级 200)。UI"测试"按钮单发所以从不复现
- **修复**:选「中转目录」时 `/models` 全程只发一枪,预检结论从该次拉取派生;失败自动串行补一枪
  (15s + 10s);真实错误原因(超时/HTTP 状态)直接进切换日志,不再吞
- 「官方目录」模式仍走独立 3s 轻探,行为不变

## v1.10.0 (2026-09-22) — 会话迁移

- 切换清场删掉旧 provider 后,自动迁移旧对话里对旧 provider 的串引用,旧会话不再断链
  (新增 `electron/lib/session-migrate.js`,单测)

## v1.9.0 (2026-09-22) — 真·一键更新

- electron-updater 自动检测/下载/安装更新;失败降级为浏览器下载,不再手动下安装包

## v1.8.1 (2026-09-21) — 切换清场

- 切换时清掉 config.toml 里的远端老路由区块,旧会话不再打废弃网关;本机网关(IPv4/IPv6)保护
- 构建:非管理员环境跳过 rcedit 编辑,winCodeSign 缓存解压不再挂

## v1.8.0 (2026-09-20) — 切换即切目录:官方目录 × 中转目录

- **切换粒度从"模型"升格为"目录"**:仪表盘第三步从模型选择器改为目录选择器,每个中转站两个选项 —
  - **官方目录**:内置快照 / 本机 Codex 提取的官方全套(档位/Fast 模式元数据完整)
  - **中转目录**:切换时从中转站 `/v1/models` 实时拉取模型清单,自动生成目录 — 每个模型按名字家族匹配官方模板(gpt-6* 配 astra,认不出的用默认满血模板),继承档位/Fast/提示词;Codex 选择器里出现的就是中转站提供的模型
- **模型名不再由 RS 决定**:切换时当前模型在新目录中存在则保留(不动 Codex 客户端里的选择),不存在才落新目录第一个条目
- **官方目录自动跟进**:启动时检测 codex.exe 指纹,变了后台静默重提取 — 官方出新模型零操作
- 中转清单拉取失败时回落官方目录并红字警告(切换继续,可回滚);非对话类模型(embedding/whisper/tts 等)自动排除
- 切换日志新增「目录生成」步骤;新增 `electron/lib/relay-catalog.js`(单测 6 例)

## v1.7.2 (2026-09-20) — 移除快速模式 UI(归还 Codex 客户端)

- **仪表盘**:删除切换面板的「快速模式 priority」开关与状态卡的快速模式显示;状态行重排为三卡(Account / Relay / Model),窗口值折进 Model 卡
- **设置**:删除「切换默认值」卡片里的默认开启快速模式开关
- 快速模式由 Codex 客户端内自己开关(目录 service_tiers 元数据已支持);RS 不再在界面层干预,切换写入行为不变

## v1.7.1 (2026-09-19) — 修复 Insider 版 Windows 打开白屏

- **根因**:Electron 33 在 win32 10.0.26200(Windows 11 Insider Canary)上渲染进程原生崩溃(exit 143,GPU/network 进程同崩),最小 20 行窗口同样复现 — 与业务代码无关
- **修复**:Electron 33.4.11 → 44.4.3,electron-builder 25.1.8 → 26.15.3;托盘创建加防护降级(失败不阻塞窗口)
- 现象复现路径:v1.7.0 安装后原生框架 + File/Edit 菜单 + 全白窗口(渲染进程即崩,自绘标题栏根本没机会绘制)

## v1.7.0 (2026-09-19) — P1 路线图:一键止停 · 托盘常驻 · 目录对比 · 竞品防护

- **一键止停 Codex(US-07)**:切换前检测到 Codex 运行的警告弹窗,新增「帮我关闭并切换」— 主进程 `taskkill /T` 强杀进程树并复查,通过后直接继续切换,不用再手动退托盘
- **托盘常驻 + 开机自启 + 关窗最小化(US-08)**:托盘图标(点击显示/右键退出);默认关窗进托盘后台保持 token 自动保养;设置页「桌面集成」卡片两个开关;开机自启仅打包版注册 `setLoginItemSettings`
- **目录版本对比(US-09)**:设置页目录源下方新增「本机提取 vs 内置快照」对比块 — 官方出新模型时一眼看出提取目录多了什么(绿)+ 缺了什么(红),提示切换目录源
- **竞品工具防护(FEAT-002)**:仪表盘检测 CockpitTools / cc-switch / CLIProxyAPI 进程,运行中常驻琥珀警告条;切换日志新增「竞品工具检测」步骤 — 配置"莫名回退"的元凶提前亮出
- **UI**:全部新元素经 Superdesign 布局锁定 replace 迭代(设计稿 v2):警告条琥珀形态 + 工具名 chip 化;弹窗三按钮层级(主操作辉光/逃生口 ghost 降级);设置页选项列表形态;对比块 mono 语义着色
- 新增 `electron/lib/rival-guard.js` 与 `electron/lib/catalog-diff.js` 纯函数模块,单测 7 例

## v1.6.4 (2026-09-19) — token 刷新失败报错修复

- **对象形态 error 兼容**:`auth.openai.com /oauth/token` 实测会返回 `{"error":{message,type,code}}` 对象形态(如 401 `token_expired`),旧逻辑直接拼接产生 `[object Object]`,且 `token_expired` 被误判为"请检查网络"
- 新增 `electron/lib/oauth-errors.js`:对象/字符串双形态解析,`token_expired`/`invalid_grant` 映射为"refresh_token 已失效"提示,429 频控、5xx 服务端错误各有专用提示;单测 6 例覆盖(小电脑侧修复,commit 90e29b8)

## v1.5.0 (2026-09-06) — 前瞻迭代:目录自愈 · 自定义模型 · 批量导入 · 工程化

- **目录自愈(US-01)**:设置页「从本机 Codex 提取」一键从 codex.exe 二进制提取最新模型目录;缺 `base_instructions` 自动兜底(优先 gpt-5.5)并在报告标注;目录源可切换(内置快照 / 本机提取),无提取产物自动回落内置
- **自定义模型(US-02)**:基于现有条目派生新模型(slug/显示名/窗口),切换部署时自动合并;同 slug 可改写既有条目;刻意不做自由编辑(坏目录会炸 Codex)
- **批量导入(US-03)**:多文件拖放 / 粘贴 JSON 数组,逐条独立成败 + 结果列表
- **切换预检(US-04)**:切换第 0 步自动探测中转站 /v1/models(3s),不通提前警告
- **工程化(US-05)**:GitHub Actions CI(单测+构建)、CHANGELOG、README 用户故事与故障排查手册
- 设计文档:`docs/superpowers/specs/2026-09-06-v1.5-forward-iteration-design.md`(P1/P2 路线图)

## v1.4.6 — catalog 缺字段修复(Codex 5003+ 启动失败)

- 内置目录 gpt-6-astra 缺 `base_instructions`,Codex 26.901.5003+ 必填 → 启动报错打不开;补齐(gpt-5.5 全文,与 CockpitTools 生产配置一致)
- 部署目录前 schema 预检:坏目录宁可切换失败,绝不写入 CODEX_HOME;catalog 合规单测防回归

## v1.4.5 — 登录态丢失真凶修复

- `buildAuthJson` 切换到 tokens 模式时清除残留的 `auth_mode:"apikey"`(API-key 模式伴生标记)——残留会让 Codex 走 API-key 路径找不到 key 判定未登录(另一台机器定位,commit 70fb8b3)

## v1.4.4 — 切换自动预刷新 + 登录态寿命可视化

- 切换瞬间用 refresh_token 换新 token 再写入(id_token 寿命仅约 1 小时)
- 仪表盘显示 id_token 剩余分钟(过期变红)/ access_token 剩余天数

## v1.4.3 — 账号 token 一键刷新

- OAuth2 refresh grant(走系统代理);refresh_token 轮换自动保存;可续期/一次性徽章;导入预览缺 refresh_token 红字警告

## v1.4.1/v1.4.2 — 稳定性

- v1.4.0 安装包启动即崩(主进程语法错误)作废重发;合并 http_headers 保留修复;账号变更预警(account_id 变化 = 会话空间切换提示);切换前失效路径体检(MCP 死路径提前亮出)

## v1.2.x — 普适安全重构

- 事务化写入:备份 → 内存生成 → 写前校验 → 原子写 → 写后复查 → 失败自动回滚
- 保留文件特征:CRLF / BOM / auth.json 未知字段;localhost provider 默认绝不删除;切换前 Codex 进程检测

## v1.0.0 (2026-09-05) — 首发

- 账号库(safeStorage 加密)/ 中转站库(连通测试)/ 一键切换 / 备份回滚;Neural Noir 设计(Superdesign)
