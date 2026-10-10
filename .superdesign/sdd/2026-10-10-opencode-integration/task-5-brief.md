### Task 5: 全量验证 + 版本号 + 发版

**Files:**
- Modify: `package.json` / `package-lock.json`(版本号 → 1.12.0)
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 全量测试 + lint + 冒烟**

Run: `node --test test/*.test.js && node lint-imports.js && npm run smoke`
Expected: 全绿(78+ 单测,39 冒烟)

- [ ] **Step 2: 版本号 1.12.0 + CHANGELOG**

- [ ] **Step 3: Commit + push + build + Release**

```bash
git add -A
git commit -m "feat(v1.12.0): OpenCode provider 管理 + 导航重构"
git push origin main
npm run dist
# 发 Release(走既有流程)
```
