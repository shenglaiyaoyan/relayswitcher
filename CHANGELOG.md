# Changelog

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
