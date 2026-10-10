### Task 3: 导航重构 — App.jsx 五项 + Dashboard 改名 ChatGPT + Settings 拆分

**Files:**
- Modify: `src/App.jsx`(NAV 数组 + 页面路由)
- Modify: `src/pages/Dashboard.jsx`(标题改 ChatGPT + 页头加图标按钮)
- Modify: `src/pages/Settings.jsx`(拆分:ChatGPT 设置视图 + 全局设置视图)
- Modify: `src/styles.css`(如需新增 .header-icon-btn 类)

**Interfaces:**
- Consumes: Task 2 的 preload IPC(`window.rs.ocList` 等)
- Produces: 路由 `page` 状态新增 `opencode` 值;`subView` 状态(main/accounts/settings)

- [ ] **Step 1: App.jsx NAV 改五项 + 新路由**

```javascript
const NAV = [
  { key: 'dash', ico: 'dash', label: 'ChatGPT' },
  { key: 'opencode', ico: 'bolt', label: 'OpenCode' },
  { key: 'relays', ico: 'relay', label: '中转站' },
  { key: 'backups', ico: 'backup', label: '备份' },
  { key: 'settings', ico: 'settings', label: '设置' }
];
const VALID_PAGES = ['dash', 'opencode', 'accounts', 'relays', 'backups', 'settings'];
```

页面渲染区:

```javascript
{page === 'dash' && <Dashboard state={state} refresh={refresh} toast={showToast} goto={setPage} />}
{page === 'opencode' && <OpenCode state={state} refresh={refresh} toast={showToast} goto={setPage} />}
{page === 'accounts' && <Accounts state={state} refresh={refresh} toast={showToast} />}
{page === 'relays' && <Relays state={state} refresh={refresh} toast={showToast} />}
{page === 'backups' && <Backups state={state} refresh={refresh} toast={showToast} goto={setPage} />}
{page === 'settings' && <Settings state={state} refresh={refresh} toast={showToast} />}
```

- [ ] **Step 2: Dashboard.jsx 页头加图标按钮 + 标题改 ChatGPT**

找到页头区域(如有标题/头部),加:

```javascript
// ChatGPT 页头右侧:👤账号 + ⚙设置(设计稿:24px 图标按钮,悬停变亮)
<div className="row" style={{ gap: 8 }}>
  <button className="header-icon-btn" title="账号" onClick={() => goto('accounts')}>
    <Icon name="account" size={16} />
  </button>
  <button className="header-icon-btn" title="ChatGPT 设置" onClick={() => goto('chatgpt-settings')}>
    <Icon name="settings" size={16} />
  </button>
</div>
```

> 注:`chatgpt-settings` 是子视图,通过 Dashboard 内部 state 或 hash 路由切换,不是独立页面。

- [ ] **Step 3: Settings.jsx 拆分**

Settings 组件接收 prop `mode`(全局=默认 / chatgpt / opencode),按 mode 渲染不同卡片集:

```javascript
// 全局设置页(侧边栏「设置」点进来):只装应用级
if (!mode || mode === 'global') {
  renderCards = [
    桌面集成卡(托盘+开机自启),
    AboutAndUpdate卡(版本+检查更新+更新状态三态)
  ];
}
// ChatGPT 设置视图(Dashboard ⚙ 点进来):装 ChatGPT 专属
if (mode === 'chatgpt') {
  renderCards = [
    Codex主目录卡,
    Provider标识卡,
    清理provider卡,
    模型目录卡(内置/提取+对比+自定义模型),
    切换默认值卡,
    工作原理卡
  ];
}
```

- [ ] **Step 4: styles.css 加 .header-icon-btn**

```css
.header-icon-btn {
  width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
  background: transparent; border: none; color: var(--txt-3); cursor: pointer;
  border-radius: 6px; transition: color .15s, background .15s;
}
.header-icon-btn:hover { color: var(--txt-1); background: rgba(255,255,255,0.04); }
```

- [ ] **Step 5: Build + lint + smoke**

Run: `npx vite build && node lint-imports.js && npm run smoke`
Expected: 全绿

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx src/pages/Dashboard.jsx src/pages/Settings.jsx src/styles.css
git commit -m "feat: 导航重构 — ChatGPT/OpenCode/中转站/备份/设置 五项 + Dashboard 改名 + Settings 拆分"
```

---

