# RS 图像生成支持方案（gpt-image-2 / codex 画图）

> 2026-09-09 小电脑侧调查结论 + 实测证据 + 推荐实现路径。目标：让"账号 × 中转站"切换后的 codex 能画图。
> 本文档自包含，所有结论均有实测/取证依据，无推测项。

## 一、问题

用户在 codex 里要求画图，当前链路（apikey 模式 + 中转站）不可用。需要 RS 补齐图像生成支持。

## 二、机制结论（codex 画图怎么工作的）

codex 客户端有两条原生画图模式（内置系统技能 `~/.codex/skills/.system/imagegen/SKILL.md` 明文规定）：

1. **内置 `image_gen` 工具模式（默认首选）**：文档原话 "Does not require `OPENAI_API_KEY`" —— 靠**服务端注入**（官方 OAuth 链路由 ChatGPT backend 注入 agentic 工具）。
2. **CLI 兜底模式**（`scripts/image_gen.py`）：硬性要求 `OPENAI_API_KEY` 环境变量，走 `/v1/images/generations` 端点。

**核心架构事实：客户端消费、但不构造。** codex 二进制取证（codex-cli 0.142.5，323MB）：

- `image_generation_call` 是 ResponseItem 解析枚举的正式成员（与 function_call / web_search_call 平级，含 revised_prompt 字段）→ 客户端原生能消费图像调用
- `"image_generation"` 作为字符串在二进制中 **0 次出现** → 客户端自己从不构造 `{"type":"image_generation"}` 工具定义
- `gpt-image-1 / 1-mini / 1.5 / 2` 模型名与 `images/generations` 端点在二进制内 → 消费链路完整

所以：**请求里有没有人注入工具定义，是画图能不能用的唯一开关。**

## 三、实测证据链（小电脑，2026-09-09）

| # | 实验 | 结果 | 结论 |
|---|------|------|------|
| 1 | 中转站 `POST /v1/responses`，请求带 `tools:[{"type":"image_generation","size":"1024x1024","quality":"low"}]`，model=gpt-6-astra | **HTTP 200，output 含 `image_generation_call`，图已生成** | **中转对 responses 的 image_generation 工具透传完全支持** |
| 2 | 中转站 `POST /v1/images/generations`，model=gpt-image-2 | HTTP 400，报错为 "The 'gpt-5.4-mini' model is not supported..."（模型映射错乱） | 传统 images 端点在中转上是坏的，CLI 兜底路线不通 |
| 3 | 纯净 CODEX_HOME 对照实验：catalog 中给激活模型加 `experimental_supported_tools=["image_generation"]` 后 codex exec 画图 | codex 回复 "image generation isn't available in this session" | **catalog 字段路线证伪**：该字段不控制图像工具（且命名体系不同：内置工具叫 `image_gen`，Responses 工具 type 叫 `image_generation`） |
| 4 | 二进制全文检索 `"image_generation"` | 0 次 | 客户端不自发构造工具定义 |

对照参考：CockpitTools（对标产品）正因为此才做了 sidecar 注入——见其 `src-tauri/src/modules/codex_local_access.rs`：

- `ensure_image_generation_tool_in_object`（约 1487 行）：转发 responses 请求前往 body 的 tools 数组注入 `{"type":"image_generation"}`，已有则不重复
- `should_inject_image_generation_tool`（约 1482 行）：`*-spark` 模型不注入
- `build_image_generation_tool`（约 1447 行）：构造带 size/quality/background/output_format/moderation 参数的工具定义，图像模型白名单校验（`validate_image_model` 只认 `gpt-image-2`，常量 `CODEX_IMAGE_MODEL_ID`）
- 账号健康度含 `image_generation_status`（Available/Unavailable/Disabled）——官方 OAuth 链路的图像能力是账号级状态

## 四、推荐实现：mini sidecar 注入

**唯一已验证可行的路径**（证据 #1）。CT 的完整架构是重型的（账号池/健康检查/多号轮换），RS 只需要其中最小的一块：**透明代理 + 工具注入**。

### 架构

```
codex → http://localhost:<RS_PORT>/v1 (RS sidecar) → 真实中转站
```

- RS 切换时，provider 的 `base_url` 写 sidecar 地址而非中转站直连（`experimental_bearer_token` 仍为中转站 key，sidecar 原样透传）
- sidecar 对每个 responses 请求：解析 JSON body → 无条件向 `tools` 注入 `{"type":"image_generation"}`（已有不重复；model 以 `spark` 结尾跳过）→ 转发中转站 → 响应流原样透传回 codex
- 非 responses 路径（/models 等）纯透传
- Node 实现（Electron 主进程内起 http server 即可，无新依赖），预计 100-200 行

### 实现要点（避坑）

1. **流式透传**：responses 是 SSE 流，注入只改请求体，响应必须原样 pipe 回去（codex 的 websocket 选项：catalog 里 sol 有 `prefer_websockets: true`，sidecar 建议首版只做 HTTP，config 侧确保 `supports_websockets = false`——RS 现有 patchProviderBlock 已写这个值，正好）
2. **端口**：避开 20573（CockpitTools sidecar 在用），建议可配置、默认如 21683
3. **开关**：Settings 加"图像生成"开关（默认开或关由产品定）；关闭时 base_url 直写中转站、sidecar 不启动
4. **不碰用户已有配置**：`http_headers` 等字段按现有 v1.4.x 行为保留；切换/回滚逻辑不变
5. **失败降级**：sidecar 启动失败或端口被占时，切换回退为直连中转站并给出步骤警告（画图不可用但对话不受影响）
6. **花费提示**：图像按张计费，UI 可在开关旁注明

### 验收标准

- [ ] RS 切换后（sidecar 模式），`codex exec "Generate an image of a red circle, save as red_circle.png" --skip-git-repo-check` 产出真实图片文件
- [ ] 同链路普通对话请求零影响（响应与直连逐字节一致，除注入的 tools 字段）
- [ ] 图像开关关闭时行为与现状完全一致
- [ ] 应用内一键回滚后 sidecar 停止、配置恢复
- [ ] 冒烟自检新增 sidecar 注入用例（mock 上游断言请求体含 image_generation 工具）

## 五、已证伪/放弃的路线（勿走回头路）

- catalog `experimental_supported_tools` 加图像工具 → 证伪（实验 #3）
- 等 codex 客户端自发携带工具 → 二进制证据 #4 排除
- CLI 兜底（image_gen.py）走中转 → images 端点坏（实验 #2），且需真官方 key
- 官方 OAuth 直连画图可用但与 RS 的中转场景无关（那是 backend 注入，账号需 Plus/Pro 额度）

## 六、测试素材

- 中转站 responses 透传验证脚本口径（可并入仓库测试）：
  `POST /v1/responses`，body：`{"model":"<对话模型>","input":"...","tools":[{"type":"image_generation","size":"1024x1024","quality":"low"}]}`，断言 output 数组含 `image_generation_call` 类型项
- 注意请求需带浏览器 UA（中转前置的 Cloudflare 拦 Python/默认 UA，error 1010）
