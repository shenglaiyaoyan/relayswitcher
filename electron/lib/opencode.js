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

/* 官方加载器(packages/core/src/config/discovery.ts)认两个文件名:
   names = ["opencode.json", "opencode.jsonc"],且按 toReversed() 取用——jsonc 在场时胜出。
   只认 .json 会让「配置写在 opencode.jsonc」的机器一个 provider 都检测不到。 */
const CONFIG_NAMES = ['opencode.jsonc', 'opencode.json'];

function configDir(home) { return path.join(home || os.homedir(), '.config', 'opencode'); }

/** 实际在用的配置文件:jsonc 优先(对齐官方),都不存在时返回将要创建的 opencode.json */
function configPath(home) {
  const dir = configDir(home);
  for (const name of CONFIG_NAMES) {
    if (fs.existsSync(path.join(dir, name))) return path.join(dir, name);
  }
  return path.join(dir, 'opencode.json');
}
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
    cfg._configFile = path.basename(p); // 写回必须落回读到的那个文件,不能另造 opencode.json
    return cfg;
  } catch (e) {
    throw new Error('opencode.json 解析失败: ' + e.message);
  }
}

function writeOpenCodeConfig(home, cfg) {
  const clean = { ...cfg };
  delete clean._hasComments;
  // 读自哪个文件就写回哪个文件(jsonc 用户不能被拆出一份 opencode 不优先读的 json)
  const target = CONFIG_NAMES.includes(cfg._configFile) ? cfg._configFile : null;
  delete clean._configFile;
  const p = target ? path.join(configDir(home), target) : configPath(home);
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
  // 顶层键跟随文件里已有的形态:opencode 1.19 及更早只认 provider(单数),
  // dev 新版只认 providers(复数)——写错键的块会被整块忽略,表现为「RS 里加了,
  // opencode 里没有」。只有文件里已有复数键(或同 id 已在复数键下)才写新形态。
  const hasNew = !!(out.providers && Object.keys(out.providers).length);
  const hasOld = !!(out.provider && Object.keys(out.provider).length);
  const legacy = hasOld && !hasNew;
  // pd.models 两种来源:已写好的 opencode 块(对象,键是模型 id),或 RS 模型数组
  // (UI 保存时的 payload,元素带 id/efforts)。后者要按文件里已有 provider 的
  // variants 形态生成——新增 provider 没有自己的形态记录,默认走数组会让旧版
  // opencode 拒绝整份配置。
  const hint = fileVariantsShape(existing);
  const models = Array.isArray(pd.models) ? modelsToBlocks(pd.models, hint) : pd.models;
  const block = {
    ...(pd.rawExtra || {}), // RS 未建模的块级键原样保留(冲突时 RS 字段赢)
    name: pd.name,
    ...(models && Object.keys(models).length ? { models } : {})
  };
  if (legacy) {
    // 旧形态:npm + options。package/settings 是新形态字段名,写进去旧版不读
    block.npm = pd.package;
    block.options = pd.settings || {};
    out.provider = { ...(out.provider || {}), [pd.id]: block };
  } else {
    block.package = pd.package;
    block.settings = pd.settings || {};
    out.providers = { ...(out.providers || {}), [pd.id]: block };
    // 同 id 的旧形态块清理,避免双写(新版只读 providers,留着只会让检测读出两份)
    if (out.provider && Object.prototype.hasOwnProperty.call(out.provider, pd.id)) {
      const { [pd.id]: _legacy, ...rest } = out.provider;
      if (Object.keys(rest).length === 0) delete out.provider;
      else out.provider = rest;
    }
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
    // variants 有两种合法形态,由 opencode 版本决定(本机 1.19.0 实测):
    // 新版(dev)是数组 [{id, settings, body}];1.19 及更早是对象 {id: {effort|thinking|…}}。
    // 数组形态喂给旧版会直接判配置非法,所以形态必须记住并原样写回。
    const variantsShape = Array.isArray(variants) ? 'array' : (variants && typeof variants === 'object' ? 'object' : 'array');
    const variantIds = variantsShape === 'object'
      ? Object.keys(variants)
      : (variants || []).map(v => v && v.id).filter(Boolean);
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
      variantsShape,
      variantsRaw: variants || (variantsShape === 'object' ? {} : []),
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
/** 文件里已有 provider 的 variants 形态:旧版 opencode 全文件统一为对象,
    新版统一为数组。新增 provider 没有自己的形态记录,必须跟随文件,否则
    一个数组 variants 会让旧版 opencode 拒绝整份配置(所有 provider 一起消失)。 */
function fileVariantsShape(existing) {
  const blocks = [...Object.values((existing && existing.provider) || {}),
    ...Object.values((existing && existing.providers) || {})];
  for (const b of blocks) {
    for (const m of Object.values((b && b.models) || {})) {
      if (Array.isArray(m && m.variants)) return 'array';
      if (m && m.variants && typeof m.variants === 'object') return 'object';
    }
  }
  return null;
}

function modelsToBlocks(models, shapeHint) {
  return Object.fromEntries((models || []).filter(m => m && m.id).map(m => {
    const raw = { ...(m.rawExtra || {}) };
    const settings = { ...(m.options || {}) };
    // 模型自带形态优先(导入的原样写回);没有时跟随文件里已有 provider 的形态
    const objectShape = m.variantsShape ? m.variantsShape === 'object' : shapeHint === 'object';
    const rawVariants = m.variantsRaw || (objectShape ? {} : []);
    if (m.effort) {
      settings.reasoningEffort = m.effort;
      const v = objectShape ? rawVariants[m.effort] : (rawVariants || []).find(x => x && x.id === m.effort);
      if (v && !objectShape) {
        Object.assign(settings, v.settings || {});
        if (v.body || raw.body) raw.body = { ...(raw.body || {}), ...(v.body || {}) };
      }
    } else delete settings.reasoningEffort;
    const wanted = new Set((m.efforts || []).filter(Boolean));
    let variants;
    if (objectShape) {
      // 旧版 opencode 只认对象形态,改写成数组会被判配置非法——只做档位增删,条目原样保留
      variants = Object.fromEntries(Object.entries(rawVariants).filter(([k]) => wanted.has(k)));
      for (const e of wanted) if (!(e in variants)) variants[e] = { effort: e };
    } else {
      const kept = (rawVariants || []).filter(v => v && v.id && wanted.has(v.id));
      const fresh = [...wanted].filter(e => !kept.some(v => v.id === e) && e !== m.baseEffort)
        .map(e => ({ id: e, settings: { reasoningEffort: e } }));
      variants = [...kept, ...fresh];
    }
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
      ...(objectShape ? (Object.keys(variants).length ? { variants } : {}) : (variants.length ? { variants } : {}))
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

/** 解析「拉取模型」的目标:显式 baseUrl 优先(手动填的站也能拉),
    缺 baseUrl/apiKey 时回落到中转站库。target 可以是 relayId 字符串(兼容旧调用)。 */
function resolveFetchTarget(target, lookupRelay) {
  const t = typeof target === 'string' ? { relayId: target } : (target || {});
  let relay = null;
  if (t.relayId && typeof lookupRelay === 'function') {
    try { relay = lookupRelay(t.relayId); } catch { relay = null; }
  }
  const baseUrl = String(t.baseUrl || (relay && relay.baseUrl) || '').trim();
  const apiKey = t.apiKey || (relay && relay.apiKey) || '';
  if (!baseUrl) return { error: '先填 Base URL,或选一个中转站' };
  return { baseUrl, apiKey };
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
  for (const [src, name] of [[cfg, path.basename(cfg)], [auth, 'auth.json']]) {
    try { fs.copyFileSync(src, path.join(bdir, name)); copied++; } catch { /* 不存在则跳过 */ }
  }
  if (copied === 0) { fs.rmdirSync(bdir); return null; }
  return path.basename(bdir);
}

module.exports = {
  PROTOCOL_ADAPTERS, PROVIDER_PACKAGES, CONFIG_NAMES, configPath, authPath,
  readOpenCodeConfig, writeOpenCodeConfig,
  readAuthFile, writeAuthFile,
  mergeProviderBlock, removeProviderBlock,
  providerBlockToRS, modelsToBlocks, fileVariantsShape, normalizeBaseUrl, resolveFetchTarget,
  backupOpenCode, stripJsonComments
};
