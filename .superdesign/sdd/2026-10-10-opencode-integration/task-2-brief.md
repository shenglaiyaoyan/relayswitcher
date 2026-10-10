### Task 2: store 数据模型 + IPC handler

**Files:**
- Modify: `electron/lib/store.js`(加 opencodeProviders 数组)
- Modify: `electron/main.js`(加 rs:oc:* 系列 handler)
- Modify: `electron/preload.js`(桥接新 IPC)
- Test: `test/opencode.test.js`(追加 store 集成测试)

**Interfaces:**
- Consumes: Task 1 的全部函数
- Produces: IPC `rs:oc:list` / `rs:oc:save` / `rs:oc:remove` / `rs:oc:readConfig` / `rs:oc:fetchModels`

- [ ] **Step 1: store.js 加 opencodeProviders 字段**

在 `createStore` 的 data 初始化中加:

```javascript
opencodeProviders: [],
```

在返回对象中加:

```javascript
listOpenCodeProviders() { return data.opencodeProviders || []; },
saveOpenCodeProvider(p) {
  if (!p.id) throw new Error('provider id 必填');
  const i = (data.opencodeProviders || []).findIndex(x => x.id === p.id);
  if (i >= 0) data.opencodeProviders[i] = p;
  else (data.opencodeProviders = data.opencodeProviders || []).push(p);
  save();
},
deleteOpenCodeProvider(id) {
  data.opencodeProviders = (data.opencodeProviders || []).filter(x => x.id !== id);
  save();
},
```

- [ ] **Step 2: main.js 加 IPC handler**

在现有 IPC 注册区(`ipcMain.handle` 集中区)加:

```javascript
const oc = require('./lib/opencode');

ipcMain.handle('rs:oc:list', () => store.listOpenCodeProviders());
ipcMain.handle('rs:oc:save', (_e, p) => {
  try {
    oc.backupOpenCode(); // 写前备份(真实 home)
    const cfg = oc.readOpenCodeConfig();
    const auth = oc.readAuthFile();
    const merged = oc.mergeProviderBlock(cfg, {
      id: p.id,
      npm: oc.PROTOCOL_ADAPTERS[p.protocol] || oc.PROTOCOL_ADAPTERS.chat,
      name: p.name || p.id,
      options: { baseURL: p.baseUrl },
      models: Object.fromEntries((p.models || []).map(m => [m.id, {
        name: m.name || m.id,
        ...(m.limit && m.limit.context ? { limit: m.limit } : {}),
        ...(m.reasoning ? { reasoning: true } : {}),
        ...(m.options && Object.keys(m.options).length ? { options: m.options } : {})
      }])),
      defaultModel: p.defaultModel || null
    });
    oc.writeOpenCodeConfig(undefined, merged);
    if (p.apiKey) {
      auth[p.id] = { type: 'api', key: p.apiKey };
      oc.writeAuthFile(undefined, auth);
    }
    store.saveOpenCodeProvider(p);
    return { ok: true, hasComments: !!cfg._hasComments };
  } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('rs:oc:remove', (_e, id) => {
  try {
    oc.backupOpenCode();
    const cfg = oc.readOpenCodeConfig();
    const auth = oc.readAuthFile();
    const updated = oc.removeProviderBlock(cfg, id);
    oc.writeOpenCodeConfig(undefined, updated);
    if (auth[id]) { delete auth[id]; oc.writeAuthFile(undefined, auth); }
    store.deleteOpenCodeProvider(id);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('rs:oc:readConfig', () => {
  try { return { ok: true, config: oc.readOpenCodeConfig() }; } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('rs:oc:fetchModels', (_e, relayId) => {
  const relay = store.getRelay(relayId);
  if (!relay) return { ok: false, error: '中转站不存在' };
  // 复用现有 fetchRelayModels 逻辑
  return fetchRelayModels(relay).then(r => ({ ok: true, models: r.ids }))
    .catch(e => ({ ok: false, error: e.message }));
});
```

- [ ] **Step 3: preload.js 桥接**

```javascript
ocList: () => ipcRenderer.invoke('rs:oc:list'),
ocSave: (p) => ipcRenderer.invoke('rs:oc:save', p),
ocRemove: (id) => ipcRenderer.invoke('rs:oc:remove', id),
ocReadConfig: () => ipcRenderer.invoke('rs:oc:readConfig'),
ocFetchModels: (relayId) => ipcRenderer.invoke('rs:oc:fetchModels', relayId),
```

- [ ] **Step 4: Run lint + full test**

Run: `node lint-imports.js && node --test test/*.test.js`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add electron/lib/store.js electron/main.js electron/preload.js
git commit -m "feat: opencode store + IPC(rs:oc:save/remove/list/readConfig/fetchModels)"
```

---

