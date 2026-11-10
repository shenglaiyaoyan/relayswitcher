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
  // Windows 编辑器(记事本/PowerShell Set-Content)常给 UTF-8 文件加 BOM。
  // JSON.parse 会把 BOM 当非法字符直接拒绝整份配置,所以先剥掉。
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
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
  const oldBlock = (out.provider && out.provider[pd.id]) || {};
  const newBlock = (out.providers && out.providers[pd.id]) || {};
  // 只迁移正在保存的 provider:以现有块为基础保留未建模字段,再统一写原生 V2。
  // 不能在旧 provider 下混入 V2 模型字段——OpenCode 会把整个模型当 V1,
  // 忽略 capabilities/settings/compatibility(包括 supportsThinkingBlockBinding)。
  const models = Array.isArray(pd.models) ? modelsToBlocks(pd.models, pd.package) : pd.models;
  const block = {
    ...oldBlock,
    ...newBlock,
    ...(pd.rawExtra || {}),
    package: pd.package,
    name: pd.name,
    settings: pd.settings || {},
    ...(models && Object.keys(models).length ? { models } : {})
  };
  delete block.npm;
  delete block.options;
  out.providers = { ...(out.providers || {}), [pd.id]: block };
  if (out.provider && Object.prototype.hasOwnProperty.call(out.provider, pd.id)) {
    const { [pd.id]: _legacy, ...rest } = out.provider;
    if (Object.keys(rest).length === 0) delete out.provider;
    else out.provider = rest;
  }
  if (pd.defaultModel) out.model = pd.defaultModel;
  else if (pd.clearDefaultModel && typeof out.model === 'string' && out.model.startsWith(pd.id + '/')) delete out.model; // 用户明确取消本 Provider 的默认
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

/* 推理/温度三态(2026-11-10):'unset' = 不写入配置,交给 OpenCode 默认;'yes'/'no' = 写入声明。
   旧草稿里的布尔值兼容:true 视为支持,false 视为未设置(旧版 RS 的 false 只是默认值,不代表不支持)。 */
const TRI_STATES = new Set(['unset', 'yes', 'no']);
const triState = v => (TRI_STATES.has(v) ? v : v === true ? 'yes' : 'unset');
const boolToTri = v => (v === true ? 'yes' : v === false ? 'no' : 'unset');
const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);

function providerBlockToRS(id, block, cfg) {
  const b = block || {};
  const pkg = b.package || b.npm || PROVIDER_PACKAGES.chat;
  const protocol = PACKAGE_TO_PROTOCOL[pkg] || LEGACY_ADAPTER_TO_PROTOCOL[pkg] || pkg;
  const known = protocol === 'message' || protocol === 'chat' || protocol === 'responses';
  const settings = b.settings || b.options || {};
  const { baseURL, apiKey, ...settingsExtra } = settings;
  const models = Object.entries(b.models || {}).map(([mid, mm]) => {
    const m = mm || {};
    // effort 是 Anthropic 包的字段，reasoningEffort 是 OpenAI 包的字段；两种都认（旧版 RS 曾给 Anthropic 错写 reasoningEffort）。
    const { reasoningEffort: reEffort, effort: anthEffort, ...restOpts } = m.settings || {};
    const reasoningEffort = anthEffort || reEffort;
    const { tools, input, output, reasoning: capReasoning, temperature: capTemperature, ...capExtra } = m.capabilities || {};
    const { name, modelID, capabilities, settings: _s, limit, variants,
      reasoning, attachment, tool_call, temperature, ...mExtra } = m;
    const reasoningRaw = capReasoning && typeof capReasoning === 'object' ? capReasoning : null;
    const reasoningState = reasoningRaw ? boolToTri(reasoningRaw.supported) : boolToTri(reasoning);
    const temperatureState = typeof capTemperature === 'boolean' ? boolToTri(capTemperature) : boolToTri(temperature);
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
    // 档位顺序就是 OpenCode 显示的顺序:跟随文件里的 variants;默认档只写在 settings 里时追加到末尾
    const efforts = [...new Set([...variantIds, reasoningEffort].filter(Boolean))];
    return {
      id: mid,
      name: name || mid,
      limit: limit || { context: 0, output: 0 },
      reasoning: reasoningState,
      tool_call: tools === undefined ? true : !!tools,
      temperature: temperatureState,
      modalities: { input: input || ['text'], output: output || ['text'] },
      ...(Object.keys(capExtra).length ? { capExtra } : {}),
      ...(reasoningRaw ? { reasoningRaw } : {}),
      effort: reasoningEffort || '',
      // 基础档:只写在 settings、不是 variant 的默认档,写回时不合成为 variant
      baseEffort: reasoningEffort && !variantIds.includes(reasoningEffort) ? reasoningEffort : '',
      efforts,
      effortsAtLoad: [...efforts],
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

/** 思考档位字段随包而异（2026-10-29 用 opencode 2.2.1 抓请求体实测）：
    Anthropic Messages 只认 settings.effort → output_config.effort，忽略 reasoningEffort；
    OpenAI Chat / Responses 只认 reasoningEffort → reasoning_effort / reasoning.effort，忽略 effort。 */
function effortKeyFor(pkg) {
  return /anthropic|\/messages$/.test(pkg || '') ? 'effort' : 'reasoningEffort';
}

/** 把一组 settings 里的档位字段统一成目标包认的那个，另一个删掉。 */
function fixEffortKey(settings, key) {
  const out = { ...(settings || {}) };
  const value = out.effort || out.reasoningEffort;
  delete out.effort; delete out.reasoningEffort;
  if (value) out[key] = value;
  return out;
}

function modelsToBlocks(models, pkg) {
  const key = effortKeyFor(pkg);
  return Object.fromEntries((models || []).filter(m => m && m.id).map(m => {
    const raw = { ...(m.rawExtra || {}) };
    const settings = fixEffortKey(m.options, key);
    // 输入形态只用于迁移旧对象 variants;输出统一为原生 V2 数组。
    const objectShape = m.variantsShape === 'object';
    const rawVariants = m.variantsRaw || (objectShape ? {} : []);
    if (m.effort) {
      settings[key] = m.effort;
      const v = objectShape ? rawVariants[m.effort] : (rawVariants || []).find(x => x && x.id === m.effort);
      if (v && !objectShape) {
        Object.assign(settings, fixEffortKey(v.settings, key));
        if (v.body || raw.body) raw.body = { ...(raw.body || {}), ...(v.body || {}) };
      }
    } else { delete settings.effort; delete settings.reasoningEffort; }
    const efforts = [...new Set((m.efforts || []).filter(Boolean))];
    const reasoning = triState(m.reasoning);
    const temperature = triState(m.temperature);
    // 统一输出原生 V2 variants 数组,严格按 efforts 顺序(OpenCode 按文件顺序显示档位)。
    // OpenCode 按 provider/model 判定 V1/V2,对象 variants 与 V2 capabilities/settings/compatibility 混用会让后者被忽略。
    const variants = [];
    for (const e of efforts) {
      if (objectShape) {
        if (Object.prototype.hasOwnProperty.call(rawVariants, e)) {
          const value = rawVariants[e];
          variants.push({
            id: e,
            settings: {
              ...fixEffortKey(value && value.settings, key),
              ...(value && value.effort ? { [key]: value.effort } : {}),
              ...(value && value.thinking ? { thinking: value.thinking } : {})
            },
            ...(value && value.body ? { body: value.body } : {}),
            ...(value && value.headers ? { headers: value.headers } : {})
          });
          continue;
        }
      } else {
        const v = (rawVariants || []).find(x => x && x.id === e);
        if (v) { variants.push(v.settings ? { ...v, settings: fixEffortKey(v.settings, key) } : v); continue; }
      }
      if (e !== m.baseEffort) variants.push({ id: e, settings: { [key]: e } });
    }
    let reasoningCap = null;
    if (reasoning === 'yes') {
      const r = m.reasoningRaw;
      if (r && r.supported === true && sameList(efforts, m.effortsAtLoad)) reasoningCap = r;
      else {
        const { supported: _sup, effort: _eff, ...rest } = r || {};
        reasoningCap = { ...rest, supported: true, ...(efforts.length ? { effort: efforts } : {}) };
      }
    } else if (reasoning === 'no') {
      reasoningCap = m.reasoningRaw && m.reasoningRaw.supported === false ? m.reasoningRaw : { supported: false };
      // 不支持推理:档位留在 RS 里,不写进配置
      delete settings.effort; delete settings.reasoningEffort;
      variants.length = 0;
    }
    return [m.id, {
      ...raw,
      name: m.name || m.id,
      modelID: raw.modelID || m.id,
      ...(m.limit && (m.limit.context || m.limit.output) ? { limit: m.limit } : {}),
      capabilities: {
        ...(m.capExtra || {}),
        tools: m.tool_call !== false,
        ...((m.modalities && (m.modalities.input?.length || m.modalities.output?.length))
          ? { input: m.modalities.input, output: m.modalities.output } : {}),
        ...(temperature !== 'unset' ? { temperature: temperature === 'yes' } : {}),
        ...(reasoningCap ? { reasoning: reasoningCap } : {})
      },
      ...(Object.keys(settings).length ? { settings } : {}),
      ...(variants.length ? { variants } : {})
    }];
  }));
}

/** 编辑器以配置文件为准(2026-11-10):从文件读出的 Provider 只叠加 RS 自己的元数据 ——
    关联的中转站、模型套用的模板来源,以及「不支持推理」时没写进配置的档位。 */
function mergeRsMeta(fromFile, stored) {
  if (!stored) return fromFile;
  const byId = new Map((stored.models || []).filter(m => m && m.id).map(m => [m.id, m]));
  const models = (fromFile.models || []).map(m => {
    const s = byId.get(m.id);
    if (!s) return m;
    const out = { ...m };
    if (s.template) out.template = s.template;
    if (m.reasoning === 'no' && !(m.efforts || []).length && (s.efforts || []).length) {
      out.efforts = [...s.efforts];
      out.effort = s.effort || '';
      out.effortsAtLoad = [...s.efforts];
    }
    return out;
  });
  return { ...fromFile, ...(stored.relayId ? { relayId: stored.relayId } : {}), models };
}

/** 保存时用哪个 Key:输入框 > 关联中转站 > 配置文件里已有的 Key。输入框留空 = 保持不变。 */
function resolveSaveKey({ id, typed, relayKey, cfg }) {
  const t = typeof typed === 'string' ? typed.trim() : '';
  if (t) return t;
  if (relayKey) return relayKey;
  const c = cfg || {};
  const fromV2 = c.providers && c.providers[id] && c.providers[id].settings && c.providers[id].settings.apiKey;
  const legacy = c.provider && c.provider[id];
  const fromV1 = legacy && ((legacy.options && legacy.options.apiKey) || (legacy.settings && legacy.settings.apiKey));
  return fromV2 || fromV1 || null;
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
    裸域名自动补 /v1,与保存时的 API 根规则一致,不改传入的表单。
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
  return { baseUrl: normalizeBaseUrl(baseUrl), apiKey };
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
  mergeRsMeta, resolveSaveKey, backupOpenCode, stripJsonComments
};
