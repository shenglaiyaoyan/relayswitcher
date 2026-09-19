# routes.md — 页面/路由映射

无路由库;`src/App.jsx` 用 hash 路由 + 条件渲染。Electron 环境,页面通过 `window.rs.*`(preload IPC 桥)与主进程通信。

| hash | 页面组件 | 文件 | 内容 |
|---|---|---|---|
| `#dash`(默认) | Dashboard | `src/pages/Dashboard.jsx` | 状态卡行(账号/中转站/模型/快速模式)、一键切换面板(账号×中转站×模型 三步 + 窗口/快速模式选项 + 执行按钮 + 流式日志)、Codex 运行警告弹窗、竞品工具警告条、备份条(一键回滚) |
| `#accounts` | Accounts | `src/pages/Accounts.jsx` | 账号库:单条导入(JSON 粘贴/文件)、批量导入(多文件拖放/数组)、token 刷新、删除确认、计划徽章 |
| `#relays` | Relays | `src/pages/Relays.jsx` | 中转站库:增删改、连通测试(/v1/models,模型列表展示)、从本机 Codex 导入 |
| `#backups` | Backups | `src/pages/Backups.jsx` | 备份时间线 + 回滚 |
| `#settings` | Settings | `src/pages/Settings.jsx` | CODEX_HOME、Provider 标识、桌面集成(托盘/开机自启)、清理本机 provider 开关、模型目录(源切换/提取/对比/自定义模型)、切换默认值、工作原理、关于与更新 |

入口链:`src/main.jsx`(createRoot)→ `src/App.jsx`(外壳/路由)→ 页面组件。
