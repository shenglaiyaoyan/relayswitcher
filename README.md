# RelaySwitcher 中转站切换器

> **GitHub**:https://github.com/shenglaiyaoyan/relayswitcher
> 
> **下载**: [最新安装包 Setup-1.4.1.exe](https://github.com/shenglaiyaoyan/relayswitcher/releases/latest/download/RelaySwitcher-Setup-1.4.1.exe)(79MB) | [Releases](https://github.com/shenglaiyaoyan/relayswitcher/releases)

把「账号登录态」和「流量出口」解耦自由组合的桌面控制面板:用真实 OAuth 账号保住 Codex 客户端的订阅功能(快速模式、完整思考档位),同时把实际 API 流量指向自建中转站。一键切换、自动备份、随时回滚。**支持自动更新**(安装版会自动检测新版本)。

## 功能

| 模块 | 说明 |
|---|---|
| 账号库 | 导入多个 OAuth 账号(auth.json / Sub2API k12 等格式自动归一化),自动解码显示邮箱与套餐(Free/Plus/Pro),tokens 用系统 DPAPI(safeStorage)加密落盘 |
| 中转站库 | 管理多个中转站(名称 / base_url / API Key 脱敏),一键 `/v1/models` 探活测延迟,顺便拉取可用模型列表 |
| 一键切换 | 备份 → 写 auth.json 登录态 → provider 区块指向中转站 → 部署模型目录 → 校验,全程步骤日志 |
| 备份回滚 | 每次切换/回滚前自动快照 `auth.json + config.toml`(连带模型目录文件),时间线展示,保留最近 20 份,回滚双向可退 |

## 它到底改了什么

只做外科手术式补丁,`config.toml` 其余内容(MCP、插件、项目信任等)逐行保留:

- `auth.json` ← 账号 OAuth tokens
- `model` / `model_provider` / `model_context_window` / `service_tier = "priority"`(顶层键)
- `[model_providers.<id>]` ← `base_url` + `requires_openai_auth = true` + `experimental_bearer_token`(登录态与流量出口解耦的命门)
- `model_catalog_json` ← 内置官方模型目录(撑起 6 档思考 / 快速模式 / 正确的窗口元数据)
- 顺带清理指向 `localhost/127.0.0.1` 的残留 sidecar provider 区块(防 CockpitTools 类工具回写)

## 用户故事(这软件为谁解决什么)

- **「我有 OAuth 账号,但流量想走自建中转」** → 账号库存 token(DPAPI 加密)+ 中转站库,一键把登录态和流量出口解耦组合
- **「官方出了新模型,应用还没更新」** → 设置页「从本机 Codex 提取」一键同步最新模型目录(US-01)
- **「中转站有自定义映射,客户端里没有对应模型」** → 派生式自定义模型:复制现有条目改 slug,配合中转站映射用任意上游(US-02)
- **「我囤了一堆号」** → 多文件拖放 / JSON 数组批量导入,逐条成败报告(US-03)
- **「切完才发现中转站挂了」** → 切换第 0 步自动预检中转站连通(US-04)
- **「手滑切坏了」** → 每次切换/回滚前自动快照,双向可退;写入是事务化的,失败自动恢复

## 故障排查(实战手册)

| 症状 | 原因与解法 |
|---|---|
| 切换后 Codex 要求登录 | ① auth.json 残留 `auth_mode:"apikey"`(v1.4.5 已修)② id_token 过期(寿命仅 1 小时;v1.4.4 起切换自动预刷新)→ 升级到最新版;应急用回滚 |
| Codex 打开报 `missing field base_instructions` | 目录 schema 缺字段(Codex 26.901.5003+ 必填)→ v1.4.6 已修 + 部署前预检拦截;应急回滚 |
| 切换后 Codex 像"被初始化" | account_id 变化 = Codex 按账号隔离会话空间,预期行为;回滚即复原(v1.4.2 起切换时明示预警) |
| 重启后"配置又弹回去" | 切换时 Codex 正在运行,退出时用内存态覆盖 → 切换前完全退出 Codex(应用会检测并警告) |
| 模型选择器变成一堆老模型 | 自定义 provider 下无目录覆盖时,客户端拉中转站 /v1/models 合成残血条目 → 保持"切换时部署目录"开启 |
| token 一天就到期 | access_token 寿命本就短,靠 refresh_token 续命;账号页「刷新」一键续(需能访问 auth.openai.com,走系统代理) |
| 下载链接 404 | GitHub 直连问题,用镜像 `https://ghproxy.net/<原链接>` |

## 开发

```bash
npm install
npm run smoke     # 无窗口自检:临时 CODEX_HOME 全流程演练(23 项断言)
npm run dev       # 构建前端并启动应用
npm run dist      # 打 NSIS 安装包 → release/RelaySwitcher-Setup-1.0.0.exe
```

## 目录

```
electron/main.js        主进程:窗口 + IPC + 冒烟自检
electron/lib/codex.js   配置手术刀(auth.json / config.toml / 备份 / 状态)
electron/lib/store.js   账号与中转站存储(safeStorage 加密)
src/                    React 前端(Neural Noir 主题)
resources/model-catalog.json  内置官方模型目录(切换时部署到 CODEX_HOME)
```
