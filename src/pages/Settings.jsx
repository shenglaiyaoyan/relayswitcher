import React, { useState } from 'react';
import { Icon, Spinner, Toggle, fmtK } from '../components/ui.jsx';

export default function Settings({ state, refresh, toast }) {
  const { settings, catalogBundled, status } = state;
  const [form, setForm] = useState({ ...settings });
  const [saving, setSaving] = useState(false);

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

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="klabel"><Icon name="settings" size={12} /> Codex 主目录 <small>CODEX_HOME</small></div>
        <input type="text" placeholder="留空 = 默认 ~/.codex"
               value={form.codexHome} onChange={e => setForm({ ...form, codexHome: e.target.value })} />
        <div className="muted" style={{ marginTop: 7 }}>当前生效: <span className="mono">{status.home}</span></div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="klabel"><Icon name="relay" size={12} /> Provider 标识 <small>{'写入 config.toml 的 [model_providers.<id>]'}</small></div>
        <input type="text" value={form.providerId} onChange={e => setForm({ ...form, providerId: e.target.value })} />
      </div>

      <div className="card" style={{ marginBottom: 14, borderColor: 'rgba(251, 191, 36, 0.25)' }}>
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

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="klabel"><Icon name="file" size={12} /> 模型目录 <small>撑起完整思考档位 / 快速模式 / 窗口元数据</small></div>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--txt-2)' }}>
            切换时部署目录 <Toggle on={form.catalogEnabled} onChange={v => setForm({ ...form, catalogEnabled: v })} />
          </div>
          <span className={'badge ' + (catalogBundled ? 'ok' : 'bad')}>{catalogBundled ? '内置目录已打包' : '内置目录缺失'}</span>
        </div>
        <input type="text" value={form.catalogFileName} onChange={e => setForm({ ...form, catalogFileName: e.target.value })} />
        <div className="muted" style={{ marginTop: 7 }}>部署到 CODEX_HOME 下的文件名,config.toml 的 model_catalog_json 将指向它</div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
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
          部署模型目录并设置 <span className="mono">model_catalog_json</span> → TOML/JSON 校验。
          <br />config.toml 其余内容(MCP、插件、项目信任等)逐行保留,绝不整体重写;顺带清理指向 localhost 的残留 sidecar 区块。
        </div>
      </div>
    </div>
  );
}
