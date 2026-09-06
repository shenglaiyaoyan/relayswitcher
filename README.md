# RelaySwitcher 中转站切换器

> **GitHub**:https://github.com/shenglaiyaoyan/relayswitcher

把「账号登录态」和「流量出口」解耦自由组合的桌面控制面板:用真实 OAuth 账号保住 Codex 客户端的订阅功能(快速模式、完整思考档位),同时把实际 API 流量指向自建中转站。一键切换、自动备份、随时回滚。

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
