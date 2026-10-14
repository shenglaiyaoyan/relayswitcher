'use strict';
/**
 * opencode.js — OpenCode 配置管理(纯函数核心)。
 * 职责:读写 ~/.config/opencode/opencode.json(JSONC 容错)与
 * ~/.local/share/opencode/auth.json;外科手术式合并/摘除 provider 块;
 * 写前备份。路径默认真实 home(~),可通过传入 home 覆盖(测试用)。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROTOCOL_ADAPTERS = {
  message: '@ai-sdk/anthropic',
  chat: '@ai-sdk/openai-compatible',
  responses: '@ai-sdk/openai'
};
/* v1.12.6 真 schema(实证自本机 opencode-cli 二进制 + 用户真实 opencode.json):
   顶层 providers(复数);块内 package/settings;apiKey 存 settings;模型条目
   modelID/capabilities(tools+input/output)/settings/variants(id+settings+body) */
const PROVIDER_PACKAGES = {
  message: '@opencode/ai/providers/anthropic',
  chat: '@opencode/ai/providers/openai-compatible',
  responses: '@opencode/ai/providers/openai'
};
const PACKAGE_TO_PROTOCOL = Object.fromEntries(
  Object.entries(PROVIDER_PACKAGES).map(([k, v]) => [v, k])
);
const LEGACY_ADAPTER_TO_PROTOCOL = Object.fromEntries(
  Object.entries(PROTOCOL_ADAPTERS).map(([k, v]) => [v, k])
);

function configPath(home) { return path.join(home || os.homedir(), '.config', 'opencode', 'opencode.json'); }
function authPath(home) { return path.join(home || os.homedir(), '.local', 'share', 'opencode', 'auth.json'); }
function backupDir(home) { return path.join(home || os.homedir(), '.config', 'opencode', 'relayswitcher-backups'); }

/** JSONC → JSON(剥掉 // 与 /* 注释;不处理嵌套在字符串内的伪注释——够用) */
function stripJsonComments(text) {
  let out = '', inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (inStr) {
      out += c;
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n'; continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++; continue;
    }
    out += c;
  }
  return out;
}

function readOpenCodeConfig(home) {
  const p = configPath(home);
  let raw;
  try { raw = fs.readFileSync(p, 'utf8'); } catch { return {}; }
  const stripped = stripJsonComments(raw);
  const hasComments = stripped !== raw;
  try {
    const cfg = JSON.parse(stripped);
    if (hasComments) cfg._hasComments = true;
    return cfg;
  } catch (e) {
    throw new Error('opencode.json 解析失败: ' + e.message);
  }
}

function writeOpenCodeConfig(home, cfg) {
  const clean = { ...cfg };
  delete clean._hasComments;
  const p = configPath(home);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(clean, null, 2) + '\n');
}

function readAuthFile(home) {
  try { return JSON.parse(fs.readFileSync(authPath(home), 'utf8')); }
  catch (e) {
    if (e.code === 'ENOENT') return {};
    throw new Error('auth.json 解析失败: ' + e.message);
  }
}

function writeAuthFile(home, auth) {
  const p = authPath(home);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(auth, null, 2) + '\n');
}

function mergeProviderBlock(existing, pd) {
  const out = { ...existing };
  out.providers = { ...(out.providers || {}) };
  out.providers[pd.id] = {
    ...(pd.rawExtra || {}), // RS 未建模的块级键原样保留(冲突时 RS 字段赢)
    package: pd.package,
    name: pd.name,
    settings: pd.settings || {},
    ...(pd.models && Object.keys(pd.models).length ? { models: pd.models } : {})
  };
  // 同 id 旧形态块(v1.12.0-1.12.5 写的 provider/npm/options)清理,避免双写
  if (out.provider && Object.prototype.hasOwnProperty.call(out.provider, pd.id)) {
    const { [pd.id]: _legacy, ...rest } = out.provider;
    if (Object.keys(rest).length === 0) delete out.provider;
    else out.provider = rest;
  }
  if (pd.defaultModel) out.model = pd.defaultModel;
  return out;
}

function removeProviderBlock(existing, providerId) {
  const out = { ...existing };
  if (out.providers) {
    const { [providerId]: _r1, ...rest1 } = out.providers;
    if (Object.keys(rest1).length === 0) delete out.providers;
    else out.providers = rest1;
  }
  if (out.provider && Object.prototype.hasOwnProperty.call(out.provider, providerId)) {
    const { [providerId]: _r2, ...rest2 } = out.provider;
    if (Object.keys(rest2).length === 0) delete out.provider;
    else out.provider = rest2;
  }
  if (out.model && out.model.startsWith(providerId + '/')) delete out.model;
  return out;
}

/* ---------------- v1.12.6:识别配置文件已有 provider(自动全量接管) ----------------
   逆向映射:opencode.json provider 块 → RS provider 对象,兼容真 schema
   (providers/package/settings)与旧形态(provider/npm/options)。
   RS 未建模的内容不丢:块级未知键进 rawExtra,settings 内 baseURL/apiKey
   之外的键进 settingsExtra,模型条目未知键(cost/body/compatibility…)进
   各模型的 rawExtra —— 写回时全部原样合回 */

function providerBlockToRS(id, block, cfg) {
  const b = block || {};
  const pkg = b.package || b.npm || PROVIDER_PACKAGES.chat;
  const protocol = PACKAGE_TO_PROTOCOL[pkg] || LEGACY_ADAPTER_TO_PROTOCOL[pkg] || pkg;
  const known = protocol === 'message' || protocol === 'chat' || protocol === 'responses';
  const settings = b.settings || b.options || {};
  const { baseURL, apiKey, ...settingsExtra } = settings;
  const models = Object.entries(b.models || {}).map(([mid, mm]) => {
    const m = mm || {};
    const { reasoningEffort, ...restOpts } = m.settings || {};
    const { tools, input, output, ...capExtra } = m.capabilities || {};
    const { name, modelID, capabilities, settings: _s, limit, variants,
      reasoning, attachment, tool_call, temperature, ...mExtra } = m;
    const rawExtra = {
      ...mExtra,
      ...(modelID && modelID !== mid ? { modelID } : {}) // modelID 与键名不同时保真
    };
    const variantIds = (variants || []).map(v => v && v.id).filter(Boolean);
    const efforts = [...new Set([reasoningEffort, ...variantIds].filter(Boolean))];
    return {
      id: mid,
      name: name || mid,
      limit: limit || { context: 0, output: 0 },
      reasoning: !!reasoning, attachment: !!attachment,
      tool_call: tools === undefined ? true : !!tools,
      temperature: !!temperature,
      modalities: { input: input || ['text'], output: output || ['text'] },
      ...(Object.keys(capExtra).length ? { capExtra } : {}),
      effort: reasoningEffort || '',
      baseEffort: reasoningEffort || '', // 基础档:写回时不合成为 variant(它就是 base settings)
      efforts,
      variantsRaw: variants || [],
      options: restOpts,
      ...(Object.keys(rawExtra).length ? { rawExtra } : {})
    };
  });
  const { package: _p, npm: _n, name: _nm, settings: _st, options: _o, models: _m, ...rawExtra } = b;
  return {
    id,
    name: b.name || id,
    protocol,
    baseUrl: baseURL || '',
    apiKey: apiKey || '',
    ...(known ? {} : { pkg }),
    ...(Object.keys(settingsExtra).length ? { settingsExtra } : {}),
    ...(Object.keys(rawExtra).length ? { rawExtra } : {}),
    models,
    defaultModel: (cfg && cfg.model && String(cfg.model).startsWith(id + '/')) ? cfg.model : '',
    imported: true
  };
}

/** RS models → opencode.json models 对象(真 schema:modelID/capabilities/settings/variants;
    档位选中写基础 settings.reasoningEffort,选中 variant 时其 settings/body 叠加为基础值;
    档位增删同步 variants;rawExtra/cost/body 保真) */
function modelsToBlocks(models) {
  return Object.fromEntries((models || []).filter(m => m && m.id).map(m => {
    const raw = { ...(m.rawExtra || {}) };
    const settings = { ...(m.options || {}) };
    if (m.effort) {
      settings.reasoningEffort = m.effort;
      const v = (m.variantsRaw || []).find(x => x && x.id === m.effort);
      if (v) {
        Object.assign(settings, v.settings || {});
        if (v.body || raw.body) raw.body = { ...(raw.body || {}), ...(v.body || {}) };
      }
    } else delete settings.reasoningEffort;
    const kept = (m.variantsRaw || []).filter(v => v && v.id && (m.efforts || []).includes(v.id));
    const fresh = (m.efforts || []).filter(e => e && !kept.some(v => v.id === e) && e !== m.baseEffort)
      .map(e => ({ id: e, settings: { reasoningEffort: e } }));
    const variants = [...kept, ...fresh];
    return [m.id, {
      ...raw,
      name: m.name || m.id,
      modelID: m.id,
      ...(m.limit && (m.limit.context || m.limit.output) ? { limit: m.limit } : {}),
      ...(m.reasoning ? { reasoning: true } : {}),
      ...(m.attachment ? { attachment: true } : {}),
      ...(m.temperature ? { temperature: true } : {}),
      capabilities: {
        ...(m.capExtra || {}),
        tools: m.tool_call !== false,
        ...((m.modalities && (m.modalities.input?.length || m.modalities.output?.length))
          ? { input: m.modalities.input, output: m.modalities.output } : {})
      },
      ...(Object.keys(settings).length ? { settings } : {}),
      ...(variants.length ? { variants } : {})
    }];
  }));
}

/** baseURL 防呆:opencode 三种协议包都把 baseURL 当完整 API 根(anthropic 包只追加
 * /messages,不像 Anthropic 官方 SDK 自补 /v1)——裸域名缺 /v1 会 404 Not Found。
 * 只在路径为空时自动补 /v1;已含 /v1 或自定义路径的尊重用户显式选择。 */
function normalizeBaseUrl(url) {
  const u = (url || '').trim().replace(/\/+$/, '');
  if (!u) return '';
  try {
    const parsed = new URL(u);
    if (parsed.pathname === '' || parsed.pathname === '/') return u + '/v1';
  } catch { /* 非 URL 原样返回,让上游报错 */ }
  return u;
}

function backupOpenCode(home) {
  const cfg = configPath(home);
  const auth = authPath(home);
  const bdirRoot = backupDir(home);
  const ts = new Date();
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
  const bdir = path.join(bdirRoot, stamp + '_opencode');
  fs.mkdirSync(bdir, { recursive: true });
  let copied = 0;
  for (const [src, name] of [[cfg, 'opencode.json'], [auth, 'auth.json']]) {
    try { fs.copyFileSync(src, path.join(bdir, name)); copied++; } catch { /* 不存在则跳过 */ }
  }
  if (copied === 0) { fs.rmdirSync(bdir); return null; }
  return path.basename(bdir);
}

module.exports = {
  PROTOCOL_ADAPTERS, PROVIDER_PACKAGES, configPath, authPath,
  readOpenCodeConfig, writeOpenCodeConfig,
  readAuthFile, writeAuthFile,
  mergeProviderBlock, removeProviderBlock,
  providerBlockToRS, modelsToBlocks, normalizeBaseUrl,
  backupOpenCode, stripJsonComments
};
