# OpenCode 集成 + 导航重构设计

> 版本:v1.12.0 | 日期:2026-10-10 | 状态:待审阅

## 概述

RS 从"Codex 专属切换器"升格为"多客户端配置管理器"。本次新增:
1. **OpenCode provider 管理**(方案 A→2:配置生成 + 持久管理)
2. **导航重构**(ChatGPT / OpenCode 双客户端并列,设置按归属拆分)

## 一、导航重构

### 侧边栏(5 顶级项)

| 项 | 图标 | 说明 |
|---|---|---|
| ChatGPT | 品牌 | 原仪表盘改名,Codex/ChatGPT 侧全部功能 |
| OpenCode | 闪电 | 新页,provider 管理 + 设置 |
| 中转站 | 中转站 | 跨客户端共用 |
| 备份 | 备份 | 跨客户端共用 |
| 设置 | 齿轮 | **全局设置页(瘦身后)**:桌面集成 + About & Update |

### ChatGPT 页内(页头右侧图标,24px)

| 图标 | 功能 | 说明 |
|---|---|---|
| 👤 | 账号视图 | 原账号页整个搬入(账号管理只属 ChatGPT 侧) |
| ⚙ | ChatGPT 设置视图 | Codex 主目录 / Provider 标识 / 清理 provider / 模型目录(含自定义模型)/ 切换默认值 / 工作原理 |

### OpenCode 页内(页头右侧图标,24px)

| 图标 | 功能 | 说明 |
|---|---|---|
| ⚙ | OpenCode 设置视图 | 配置路径 / 备份策略(跟 provider 管理一起出生) |

### 右下角

「关于与更新」按钮保留,点了跳全局设置页。

## 二、OpenCode Provider 管理

### 研究结论(设计基础)

| 要点 | 实态 |
|---|---|
| 配置文件 | `~/.config/opencode/opencode.json`(JSON/JSONC,**无热重载**) |
| 自定义 provider | `provider.<id>` 块,含 `npm`(适配器)/ `options`(baseURL 等)/ `models`(模型清单) |
| 协议适配器 | message→`@ai-sdk/anthropic`,chat→`@ai-sdk/openai-compatible`,responses→`@ai-sdk/openai` |
| API key | 两条路:内联 `options.apiKey` 或独立 `~/.local/share/opencode/auth.json` |
| 默认模型 | 顶层 `model: "provider_id/model_id"` |
| 痛点 | 自定义 provider 的 limit 等元数据**必须手写**(内置 provider 走 models.dev 自动喂) |

### Provider 列表(OpenCode 页主视图)

已注入的 provider 卡片:名称、协议徽章(message/chat/responses)、模型数、默认模型。操作:编辑/更新/移除。

### 新建/编辑表单(全部字段可改,RS 只做预填)

| 项 | 形态 |
|---|---|
| 中转站 | 从 RS 库选(预填 baseURL)或纯手写 URL |
| **协议类型** | **三选一:message / chat / responses** → 决定适配器 |
| provider id | 预填站名 slug,可改 |
| API key | 表单输入,写入 auth.json(不进 opencode.json) |
| **模型条目** | **从 /v1/models 拉清单勾选 + 手动添加**;每条模型展开参数表单 |
| 默认模型 | 下拉选(provider_id/model_id) |

### 模型条目参数表单(全部可编辑)

| 字段 | 说明 | RS 预填逻辑 |
|---|---|---|
| `name` | 显示名 | 预填模型 ID |
| `limit.context` | 最大输入 tokens | **有目录元数据就预填,没有就空着** |
| `limit.output` | 最大输出 tokens | 同上 |
| `reasoning` | boolean(是否推理模型) | 预填(目录元数据判断) |
| `options.reasoningEffort` | 请求参数透传 | 用户选(low/medium/high/xhigh/max) |
| `options` 其他 | 任意 JSON 透传 | 用户手写 |

### 写入管线(electron/lib/opencode.js)

```
读取 opencode.json(JSONC 容错解析)
→ 备份(opencode.json + auth.json)
→ 外科合并:只动 RS 注入的 provider 块与顶层 model 键
  (用户手写的其他 provider/agent/tui 配置原样保留)
→ auth.json:写入/更新/摘除对应 provider 条目
→ 写回(标准 JSON;原文件含注释时提前警告用户)
→ 提示重启 opencode 生效
```

### RS 侧数据模型(store)

```json
{
  "opencodeProviders": [
    {
      "id": "provider slug",
      "relayId": "关联的中转站 ID(纯手写时为 null)",
      "protocol": "message|chat|responses",
      "models": [
        {
          "id": "model-id",
          "name": "显示名",
          "limit": { "context": 0, "output": 0 },
          "reasoning": false,
          "options": {}
        }
      ],
      "defaultModel": "provider_id/model_id"
    }
  ]
}
```

## 三、组件边界

| 组件 | 职责 | 依赖 |
|---|---|---|
| `electron/lib/opencode.js` | 纯函数:读写 opencode.json / auth.json / 合并 / 摘除 / 备份 | 无(纯 Node) |
| `electron/main.js` IPC 层 | `rs:oc:*` 系列 handler,调 opencode.js | opencode.js + store |
| `src/pages/OpenCode.jsx` | 列表 + 表单 + 页内设置 | preload + ui 组件 |
| `src/pages/Dashboard.jsx` | 改名 ChatGPT + 页头加图标按钮 | ui 组件 |
| `src/pages/Settings.jsx` | 拆分:ChatGPT 设置视图 + 全局设置视图 | ui 组件 |
| `src/App.jsx` | 导航重构 + 路由(子视图切换) | 各页面 |

## 四、测试策略

| 层 | 覆盖 |
|---|---|
| 单测 `test/opencode.test.js` | JSONC 解析(含注释)/ 合并(保留非 RS 键)/ 摘除 / auth 写入 / 备份生成 / 协议→适配器映射 |
| 单测(现有) | 65 例保持全绿 |
| 冒烟 | 新增:切换→opencode.json 存在且含 provider 块;备份→回滚 |
| superdesign | 导航重构 + OpenCode 页 + ChatGPT 页头图标(superdesign 管线) |

## 五、实施顺序

1. `electron/lib/opencode.js` 纯函数 + 单测
2. store 数据模型 + IPC handler
3. superdesign:OpenCode 页 + ChatGPT 页头 + 导航重构(三稿)
4. 前端:App.jsx 导航 + Dashboard 改名 + Settings 拆分 + OpenCode 页
5. 冒烟 + 全量测试
6. 打包发版
