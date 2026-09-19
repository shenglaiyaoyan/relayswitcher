# pages.md — 页面依赖树

所有页面共享 `window.rs`(preload IPC 桥)与 `src/components/ui.jsx` 原语。

## #dash (Dashboard — 主功能页)
Entry: `src/pages/Dashboard.jsx`
Dependencies:
- src/components/ui.jsx (Icon, Select, Spinner, Modal, fmtK, planLabel)

## #accounts (Accounts)
Entry: `src/pages/Accounts.jsx`
Dependencies:
- src/components/ui.jsx (Icon, Spinner, Confirm, Empty, fmtAgo, planLabel)

## #relays (Relays)
Entry: `src/pages/Relays.jsx`
Dependencies:
- src/components/ui.jsx (Icon, Spinner, Modal, Confirm, Empty, Field, fmtAgo)

## #backups (Backups)
Entry: `src/pages/Backups.jsx`
Dependencies:
- src/components/ui.jsx (Icon, Spinner, Confirm, Empty, fmtAgo)

## #settings (Settings)
Entry: `src/pages/Settings.jsx`
Dependencies:
- src/components/ui.jsx (Icon, Spinner, Toggle, Modal, Field, fmtK)

## 外壳(每页生效)
Entry: `src/App.jsx`
Dependencies:
- src/components/TitleBar.jsx
  - src/components/ui.jsx (Icon)
- src/components/ui.jsx (Icon, Spinner)
- src/pages/*.jsx (全部五页)

样式全局唯一:`src/styles.css`(main.jsx 引入)。
