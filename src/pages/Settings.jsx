import React, { useEffect, useState } from 'react';
import { Icon, Spinner, Toggle, Modal, Field, fmtK } from '../components/ui.jsx';

export default function Settings({ state, refresh, toast }) {
  const { settings, catalogBundled, status } = state;
  const [form, setForm] = useState({ ...settings });
  const [saving, setSaving] = useState(false);
  const [updateBusy, setUpdBusy] = useState(false);
  const [updateResult, setUpdResult] = useState(null); // {found:true/false, version?, error?}
  const [appVersion, setAppVer] = useState('');
  const [catInfo, setCatInfo] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extractReport, setExtractReport] = useState(null);
  const [editCm, setEditCm] = useState(null); // null=关闭 {}=新建 {...}=编辑

  const loadCatInfo = async () => {
    try { setCatInfo(await window.rs.getCatalogInfo()); } catch { /* ignore */ }
  };
  useEffect(() => { loadCatInfo(); }, []);
  useEffect(() => {
    if (window.rs.getVersion) window.rs.getVersion().then(v => setAppVer(v)).catch(() => {});
  }, []);

  const doExtract = async () => {
    setExtracting(true); setExtractReport(null);
    try {
      const r = await window.rs.extractCatalog();
      if (r.ok) {
        setExtractReport(r);
        toast(`提取成功:${r.report.modelCount} 个模型${r.report.patchedSlugs.length ? `,修补 ${r.report.patchedSlugs.length} 条` : ''}`, 'ok');
        await loadCatInfo(); setForm(f => ({ ...f, catalogMode: 'extracted' }));
      } else toast('提取失败: ' + r.error, 'bad');
    } catch (e) { toast('提取异常: ' + e.message, 'bad'); }
    finally { setExtracting(false); }
  };

  const setMode = async (mode) => {
    try {
      await window.rs.setCatalogMode(mode);
      setForm(f => ({ ...f, catalogMode: mode }));
      await loadCatInfo();
      toast(mode === 'extracted' ? '已切换到本机提取目录' : '已切换到内置目录快照', 'ok');
    } catch (e) { toast(e.message, 'bad'); }
  };

  const saveCm = async () => {
    try {
      await window.rs.saveCustomModel(editCm);
      toast('自定义模型已保存,下次切换生效', 'ok');
      setEditCm(null); await loadCatInfo();
    } catch (e) { toast(e.message, 'bad'); }
  };

  const delCm = async (id, slug) => {
    try { await window.rs.deleteCustomModel(id); toast('已删除 ' + slug, 'ok'); await loadCatInfo(); }
    catch (e) { toast(e.message, 'bad'); }
  };

  const checkUpdateManually = async () => {
    setUpdBusy(true);
    try {
      const r = await window.rs.checkUpdate();
      setUpdResult(r);
      if (r.found) toast(`发现新版本 v${r.version}`, 'ok');
      else toast(r.error || '已是最新版', 'warn');
    } catch (e) {
      setUpdResult({ found: false, error: e.message });
      toast('检查失败: ' + e.message, 'bad');
    } finally {
      setUpdBusy(false);
    }
  };

  const downloadAndInstall = () => {
    window.open(updateResult.url, '_blank');
  };

  const save = async () => {
    setSaving(true);
    try {
      await window.rs.saveSettings({
        codexHome: form.codexHome.trim(), providerId: form.providerId.trim() || 'codex_local_access',
        catalogFileName: form.catalogFileName.trim() || 'relayswitcher-model-catalog.json',
        catalogEnabled: form.catalogEnabled, fastMode: form.fastMode,
        pruneLocalProviders: !!form.pruneLocalProviders,
        contextWindow: Number(form.contextWindow) || 872000
      });
      toast('设置已保存', 'ok');
      await refresh();
    } catch (e) { toast(e.message, 'bad'); }
    finally { setSaving(false); }
  };

  const dirty = JSON.stringify(form) !== JSON.stringify(settings);

  return (
    <div>
      <div className="page-title"><h1>设置</h1><span className="sub">Settings</span></div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="klabel"><Icon name="settings" size={12} /> Codex 主目录 <small>CODEX_HOME</small></div>
        <input type="text" placeholder="留空 = 默认 ~/.codex"
               value={form.codexHome} onChange={e => setForm({ ...form, codexHome: e.target.value })} />
        <div className="muted" style={{ marginTop: 7 }}>当前生效: <span className="mono">{status.home}</span></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="klabel"><Icon name="relay" size={12} /> Provider 标识 <small>{'写入 config.toml 的 [model_providers.<id>]'}</small></div>
        <input type="text" value={form.providerId} onChange={e => setForm({ ...form, providerId: e.target.value })} />
      </div>

      <div className="card" style={{ marginBottom: 14, borderColor: 'rgba(251, 191, 36, 0.2)' }}>
        <div className="klabel"><Icon name="alert" size={12} style={{ color: 'var(--warn)' }} /> 清理本机 provider 区块 <small>高级 · 默认关闭</small></div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--txt-2)', flex: 1 }}>
            切换时删除其它指向 localhost / 127.0.0.1 的 provider 区块
            <Toggle on={form.pruneLocalProviders} onChange={v => setForm({ ...form, pruneLocalProviders: v })} />
          </div>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>
          ⚠ 仅当你确定本机没有正在使用的本地网关(sub2api / new-api / CLIProxyAPI 等以 127.0.0.1 形式配置在 config.toml 里)时才开启。
          指向本地服务是完全合法的配置——开启此选项会把它们当作残留删除,可能导致 Codex 报 provider 不存在。
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="klabel"><Icon name="file" size={12} /> 模型目录 <small>撑起完整思考档位 / 快速模式 / 窗口元数据</small></div>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--txt-2)' }}>
            切换时部署目录 <Toggle on={form.catalogEnabled} onChange={v => setForm({ ...form, catalogEnabled: v })} />
          </div>
          <span className={'badge ' + (catalogBundled ? 'ok' : 'bad')}>{catalogBundled ? '内置目录已打包' : '内置目录缺失'}</span>
        </div>

        {/* 目录源切换(US-01) */}
        {catInfo && (
          <div className="opt-row" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none', marginBottom: 10 }}>
            <div className="field-inline">
              目录源
              <span className={'chip' + (form.catalogMode !== 'extracted' ? ' on' : '')} onClick={() => setMode('builtin')}
                    title="应用打包时内置的官方目录快照,永远可回退">
                内置快照 · {catInfo.builtinCount} 模型
              </span>
              <span className={'chip' + (form.catalogMode === 'extracted' ? ' on' : '')}
                    onClick={() => catInfo.extracted && !catInfo.extracted.error && setMode('extracted')}
                    title={catInfo.extracted ? catInfo.extracted.file : '尚未提取 — 点右侧按钮从本机 Codex 提取'}>
                本机提取 {catInfo.extracted && !catInfo.extracted.error ? `· ${catInfo.extracted.modelCount} 模型` : '· 未提取'}
              </span>
            </div>
            <button className="btn btn-sm btn-gold" disabled={extracting} onClick={doExtract} title="从本机 codex.exe 二进制提取最新目录,官方出新模型后点这里即可同步">
              {extracting ? <><Spinner size={11} /> 提取中…</> : <><Icon name="download" size={12} /> 从本机 Codex 提取</>}
            </button>
          </div>
        )}
        {extractReport && (
          <div className="parse-preview">
            <div className="pv-title"><Icon name="check" size={14} style={{ color: 'var(--ok)' }} /> 提取成功:{extractReport.report.modelCount} 个模型</div>
            <div className="pv-line">来源 <b className="mono ellipsis" style={{ maxWidth: 320 }} title={extractReport.binPath}>{extractReport.binPath}</b></div>
            {extractReport.report.patchedSlugs.length > 0 && (
              <div className="pv-line muted">自动修补 base_instructions:{extractReport.report.patchedSlugs.join('、')}</div>
            )}
          </div>
        )}

        {/* 自定义模型(US-02) */}
        {catInfo && (
          <div style={{ marginTop: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="muted">自定义模型(基于现有条目派生,配合中转站映射用任意上游)</span>
              <button className="btn btn-sm" onClick={() => setEditCm({ templateSlug: 'gpt-6-astra', slug: '', displayName: '', contextWindow: 872000 })}>
                <Icon name="plus" size={12} /> 新建
              </button>
            </div>
            {catInfo.customModels.length === 0 ? (
              <div className="muted" style={{ fontSize: 12 }}>暂无 — 新建一个,下次切换会合并进部署目录</div>
            ) : catInfo.customModels.map(cm => (
              <div key={cm.id} className="row" style={{ padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <span className="mono" style={{ color: 'var(--gold-light)' }}>{cm.slug}</span>
                <span className="muted">{cm.displayName || '—'}</span>
                <span className="muted">基于 {cm.templateSlug} · 窗口 {fmtK(cm.contextWindow)}</span>
                <span className="spacer" style={{ flex: 1 }} />
                <button className="icon-btn" title="编辑" onClick={() => setEditCm({ ...cm })}><Icon name="edit" size={13} /></button>
                <button className="icon-btn" title="删除" onClick={() => delCm(cm.id, cm.slug)}><Icon name="trash" size={13} /></button>
              </div>
            ))}
          </div>
        )}

        <input type="text" value={form.catalogFileName} onChange={e => setForm({ ...form, catalogFileName: e.target.value })} />
        <div className="muted" style={{ marginTop: 7 }}>部署到 CODEX_HOME 下的文件名,config.toml 的 model_catalog_json 将指向它</div>
      </div>

      {/* 自定义模型编辑模态(US-02,按设计稿) */}
      <Modal open={!!editCm} title={<><Icon name="bolt" size={15} /> {editCm && editCm.id ? '编辑自定义模型' : '新建自定义模型'}</>}
        onClose={() => setEditCm(null)}
        footer={<>
          <button className="btn" onClick={() => setEditCm(null)}>取消</button>
          <button className="btn btn-primary" disabled={!editCm || !editCm.slug || !editCm.templateSlug} onClick={saveCm}>保存</button>
        </>}>
        {editCm && <>
          <Field label="基于模板" hint="深拷贝该条目全部元数据(档位/快速模式/提示词)">
            <select value={editCm.templateSlug} onChange={e => setEditCm({ ...editCm, templateSlug: e.target.value })}>
              {(catInfo ? catInfo.modelSlugs : []).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="模型 slug" hint="切换/选择器里显示与使用的名字,中转站按它路由到真实上游">
            <input type="text" placeholder="如 gpt-6.5-mymodel" value={editCm.slug} onChange={e => setEditCm({ ...editCm, slug: e.target.value.trim() })} />
          </Field>
          <Field label="显示名(可选)">
            <input type="text" placeholder="如 我的 6.5" value={editCm.displayName} onChange={e => setEditCm({ ...editCm, displayName: e.target.value })} />
          </Field>
          <Field label="上下文窗口">
            <input type="number" step={1000} value={editCm.contextWindow} onChange={e => setEditCm({ ...editCm, contextWindow: Number(e.target.value) })} />
          </Field>
        </>}
      </Modal>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="klabel"><Icon name="bolt" size={12} /> 切换默认值 <small>仪表盘的初始选项</small></div>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--txt-2)' }}>
            默认开启快速模式 <span className="mono muted">service_tier=priority</span>
            <Toggle on={form.fastMode} onChange={v => setForm({ ...form, fastMode: v })} />
          </div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--txt-2)' }}>默认上下文窗口</span>
          <input type="number" style={{ width: 130 }} value={form.contextWindow} step={1000}
                 onChange={e => setForm({ ...form, contextWindow: e.target.value })} />
          <span className="muted">= {fmtK(Number(form.contextWindow))} tokens</span>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 16 }}>
        <button className="btn btn-gold" disabled={saving || !dirty} onClick={save}>
          {saving ? <><Spinner size={12} /> 保存中…</> : '保存设置'}
        </button>
        {dirty && <span className="muted">有未保存的修改</span>}
      </div>

      <div className="card">
        <div className="klabel"><Icon name="info" size={12} /> 工作原理 <small>What it actually does</small></div>
        <div className="muted" style={{ lineHeight: 2.1 }}>
          切换 = 备份 <span className="mono">auth.json + config.toml</span> → 账号 OAuth tokens 写入 auth.json(保持客户端订阅功能)→
          provider 区块指向中转站(<span className="mono">requires_openai_auth=true + experimental_bearer_token</span>,登录态与流量出口解耦)→
          部署模型目录并设置 <span className="mono">model_catalog_json</span> → TOML/JSON 校验。<br />
          config.toml 其余内容(MCP、插件、项目信任等)逐行保留,绝不整体重写;顺带清理指向 localhost 的残留 sidecar 区块。
        </div>
      </div>

      {/* 关于与更新(design-with-your-model 路径:superdesign 额度用尽,按设计系统 tokens 手工对齐) */}
      <div className="card" style={{ marginTop: 14, borderColor: 'rgba(167, 139, 113, 0.3)' }}>
        <div className="klabel"><Icon name="logo" size={12} style={{ color: 'var(--gold)' }} /> About & Update <small>关于与更新</small></div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="row" style={{ gap: 12 }}>
            <div className="brand-mark" style={{ width: 32, height: 32, borderRadius: 10 }}><Icon name="logo" size={15} /></div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>RelaySwitcher <span className="badge gold mono">v{appVersion || '…'}</span></div>
              <div className="muted" style={{ marginTop: 3 }}>Codex 账号 × 中转站 一键切换器</div>
            </div>
          </div>
          <button className="btn btn-sm" onClick={checkUpdateManually} disabled={updateBusy}>
            {updateBusy ? <><Spinner size={11} /> 检查中…</> : <><Icon name="refresh" size={11} /> 检查更新</>}
          </button>
        </div>
        {updateResult && updateResult.found && (
          <div className="parse-preview" style={{ marginTop: 12 }}>
            <div className="pv-title"><Icon name="download" size={14} style={{ color: 'var(--ok)' }} /> 发现新版本 v{updateResult.version}</div>
            <div className="row" style={{ marginTop: 6 }}>
              <button className="btn btn-sm btn-gold" onClick={downloadAndInstall}>
                <Icon name="download" size={11} /> 立即下载安装
              </button>
              <a href={updateResult.url} target="_blank" rel="noreferrer" className="muted" style={{ fontSize: 11, textDecoration: 'none' }}>
                直接下载 exe(慢可加 ghproxy.net 前缀)
              </a>
            </div>
          </div>
        )}
        {updateResult && !updateResult.found && (
          <div className="row" style={{ marginTop: 10 }}>
            <Icon name="check" size={13} style={{ color: 'var(--ok)' }} />
            <span className="muted">当前已是最新版本{updateResult.version ? ` (服务端 v${updateResult.version})` : ''}</span>
          </div>
        )}
      </div>
    </div>
  );
}
