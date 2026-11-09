# 兼容模式：本机改写代理（设计）

日期：2026-11-09 · 状态：用户已确认（效果图 `designs/compat-mode-mockup.html`）

## 背景

Codex 桌面版 0.167 的 Page 功能在每轮对话开头插入 `codex_apps_open_page`、`codex_apps_selected_page_part_*` 两条 `function_call_output`，没有 `call_id`（`page_id` 为 null 也插）。Sub2API 及其衍生中转在请求里没有任何带 `call_id` 的工具调用时拒绝，返回：

> function_call_output requires call_id on HTTP requests; continuation via previous_response_id is only supported on Responses WebSocket v2

新对话第一条消息必挂，之后整个对话一直挂。已用 `api.zeniths.codes` 实测：只带页面记录 400，前面加一组配对工具调用后 200。桌面版代码不检查任何配置开关，只能在请求离开本机前改写。

## 目标与范围

- ChatGPT 页加手动开关「兼容模式」。开启并切换后，Codex 经 RS 本机代理访问中转，代理把缺 `call_id` 的工具结果改成普通用户消息。
- 不做自动检测，不支持 WebSocket（RS 仍写 `supports_websockets = false`）。
- 关闭时行为与现在完全一致。

## 设置项（store.settings）

| 键 | 默认 | 含义 |
|---|---|---|
| `compatMode` | `false` | 最近一次切换选的兼容模式 |
| `compatPort` | `18767` | 下次开启兼容模式时使用的端口 |
| `compatRelayId` | `''` | 代理转发目标的中转站 id |

## 切换流程

- 开关属于切换选项，点「立即切换」才生效；开关与当前生效状态不一致时，按钮下方提示「兼容模式改动需重新切换才生效」。
- **开启**：写配置前先确保代理在 `127.0.0.1:<compatPort>` 监听（已在该端口运行则复用）。监听失败则中止切换、不写任何文件，报「兼容代理端口 N 被占用，可在设置里改端口」。provider 的 `base_url` 写 `http://127.0.0.1:<port>`，Key 仍写中转站 Key。成功后保存 `compatMode=true`、`compatRelayId`。日志新增一步「兼容代理」，「流量指向中转站」详情写「经本机兼容代理 → <中转地址>」。
- **关闭**：`base_url` 写中转站地址；成功后保存 `compatMode=false` 并停止代理。
- 写后复查按实际写入的地址比对，不再固定比中转地址。

## 代理何时运行

只看 Codex 配置：当前 provider 的 `base_url` 形如 `http://127.0.0.1:<端口>`，且 `compatMode` 为真、`compatRelayId` 指向存在的中转站，就在**该端口**运行，否则停止。在启动时、切换后、回滚后各同步一次。端口从配置里取，所以设置里改端口不影响正在生效的代理，下次切换才用新端口。

## 代理（`electron/lib/compat-proxy.js`）

- 只监听 `127.0.0.1`。目标地址在每个请求时解析：`compatRelayId` 对应中转站的 `baseUrl` 去掉末尾 `/`，拼上请求路径（Codex 请求 `/responses` → `<中转>/v1/responses`）。中转站被删除时返回 503 JSON 错误。
- 请求头原样转发，去掉逐跳头（host、connection、content-length、transfer-encoding、keep-alive、upgrade、te、trailer、proxy-*）。
- 请求体先完整读入。仅对路径为 `/responses` 或 `/responses/compact` 的 POST 尝试改写：按 `content-encoding` 解码（identity、gzip、deflate、br、zstd），解析 JSON 后改写。有改动则发未压缩 JSON 并去掉 `content-encoding`；无改动、解码或解析失败都发**原始字节**。
- 上游用 Electron `net.fetch`（走系统代理，和测速、拉模型一致）。响应状态和头转发（去掉逐跳头、`content-encoding`、`content-length`，因为 `net.fetch` 已解压），正文按块流式写回。Codex 断开时中止上游请求。
- 上游失败返回 502：`{"error":{"message":"RelaySwitcher 兼容代理连不上中转站：…","type":"relay_unreachable"}}`。
- 统计：请求数、累计改写条数、最近一次错误，供状态行显示。

## 改写规则（`electron/lib/compat-rewrite.js`，纯函数）

- 对象：`input` 数组里 `type` 为 `function_call_output` 或 `custom_tool_call_output`，且 `call_id` 缺失、为 null 或去空白后为空。
- 替换为 `{type:"message", role:"user", content:[…]}`：
  - `output` 是字符串 → 一个 `input_text`；
  - `output` 是数组 → `input_text`/`output_text`/`text` 转成 `input_text`，`input_image`、`input_file` 原样保留，其它部分 `JSON.stringify` 成 `input_text`；
  - 有 `name` 时在第一个文本前加 `[<name>]` 和换行，没有文本部分时单独补一条 `[<name>]`；既没有内容也没有 `name` 时给一个空 `input_text`。
- 丢弃原条目的 `id`、`name`、`namespace`、`internal_chat_message_metadata_passthrough`。其余条目和字段不动，顺序不变。

## 界面

- **ChatGPT 页切换卡片**：「上下文窗口」下加「兼容模式」行：开关 +「修复桌面版 call_id 报错」+ 说明「经本机代理把桌面版的页面记录改成普通消息再转给中转站。开启后 RelaySwitcher 需保持运行。」初始值取 `compatMode`。
- **当前状态 · 流量出口**：中转站行仍显示真实中转（兼容模式下按 `compatRelayId` 找）。新增「兼容模式」行：开启时 `运行中 · 127.0.0.1:端口 · 已改写 N 条`（未运行显示红点「未运行」和原因）；关闭时「关闭 · 直连中转」。
- **设置 · ChatGPT**：新增「兼容代理端口」数字输入（1024–65535），说明「改端口后需重新切换才生效」。
- **退出确认**：兼容模式生效时，托盘「退出」和不进托盘的关窗退出先弹确认：「兼容模式正在使用，退出后 Codex 将连不上中转站」，按钮「取消」「仍要退出」。自动更新重启不弹。

## 依赖

- 新增 `fzstd`（纯 JS zstd 解码，MIT）。Electron 33 自带 Node 20，zlib 不支持 zstd。

## 测试与验收

- 单测：改写规则（字符串/数组输出、空白 call_id、配对条目不动、custom_tool_call_output、无改动返回原值）；代理（改写后上游收到的 body、配对请求字节不变、gzip/zstd 请求体、SSE 分块透传、GET 透传、上游不可达 502、中转站删除 503）；切换写入本机地址与复查；状态映射；UI 源码断言与按钮样式扫描。
- smoke：临时 CODEX_HOME 跑一次兼容模式切换，经代理转发到本地假中转。
- 实测：用真实 Codex 在隔离目录请求本机抓包服务，确认请求体编码；用 `api.zeniths.codes` 发带页面记录的请求，直连 400、经代理 200。
- 隔离截图：切换卡片开关、状态行开启/关闭、设置页端口。
