# Changelog

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
