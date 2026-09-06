'use strict';
/**
 * codex.js — 对 CODEX_HOME 的所有读写手术(事务化,普适安全版)。
 *
 * 安全原则(2026-09-06 重构,修复在他人机器上损坏配置的 4 个根因):
 * 1. 绝不删除不认识的东西:默认不清理任何 provider 区块(即便指向 localhost——
 *    那可能是用户本机合法网关);清理仅作为显式开关 pruneLocalProviders。
 * 2. 保留文件原有特征:换行符(CRLF/LF)、BOM、auth.json 的未知字段。
 * 3. 事务语义:全部新内容在内存生成并预校验(TOML/JSON 解析)→ 原子写
 *    (临时文件 + rename)→ 写后复查 → 任一环节失败自动恢复切换前备份。
 * 4. auth.json 只替换 tokens / 移除语义冲突的 OPENAI_API_KEY,其余字段原样保留。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const TOML = require('@iarna/toml');

const BACKUP_DIRNAME = 'relayswitcher-backups';
const MAX_BACKUPS = 20;

function defaultCodexHome() {
  return path.join(os.homedir(), '.codex');
}

function readText(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

/* ---------------- 文件 I/O:EOL / BOM / 原子写 ---------------- */

/** 读取并归一化:剥 BOM(记录之)、CRLF→LF(记录原 EOL),返回内部统一 LF 域文本 */
function readConfigText(p) {
  let s = readText(p);
  if (s == null) return null;
  const hasBom = s.charCodeAt(0) === 0xFEFF;
  if (hasBom) s = s.slice(1);
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  return { text: s.replace(/\r\n/g, '\n'), hasBom, eol };
}

/** 原子写入:先写临时文件再 rename(避免半截文件) */
function writeFileSyncSafe(p, content) {
  const tmp = p + '.rs-tmp';
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, p);
}

/** 按 I/O 元数据还原(EOL/BOM)后原子写入 */
function writeConfigText(p, text, meta) {
  let out = text.replace(/\n/g, '\n'); // text 已是 LF 域
  if (meta.eol === '\r\n') out = text.replace(/\n/g, '\r\n');
  if (meta.hasBom) out = '\uFEFF' + out;
  writeFileSyncSafe(p, out);
}

function tomlStr(v) {
  return '"' + String(v)
    .replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    .replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t') + '"';
}

function tomlValue(v) {
  if (typeof v === 'string') return tomlStr(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  throw new Error('不支持的 TOML 值类型: ' + typeof v);
}

/* ---------------- config.toml 顶层键补丁(LF 域) ---------------- */

function findTopEnd(lines) {
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*\[/.test(lines[i])) return i;
  }
  return lines.length;
}

function isValidProviderId(id) {
  return /^[A-Za-z0-9_-]+$/.test(id);
}

function patchTopLevelKeys(text, kv) {
  let lines = text.split('\n');
  for (const [key, value] of Object.entries(kv)) {
    const re = new RegExp('^\\s*' + key + '\\s*=');
    let topEnd = findTopEnd(lines);
    let found = -1;
    for (let i = 0; i < topEnd; i++) {
      if (re.test(lines[i])) { found = i; break; }
    }
    if (found >= 0) {
      if (value === null) lines.splice(found, 1);
      else lines[found] = key + ' = ' + tomlValue(value);
    } else if (value !== null) {
      let anchor = 0;
      for (let i = findTopEnd(lines) - 1; i >= 0; i--) {
        if (lines[i].trim() !== '') { anchor = i + 1; break; }
      }
      lines.splice(anchor, 0, key + ' = ' + tomlValue(value));
    }
  }
  return lines.join('\n');
}

function readTopLevelKey(text, key) {
  const lines = text.split('\n');
  const topEnd = findTopEnd(lines);
  const re = new RegExp('^\\s*' + key + '\\s*=\\s*(.+)$');
  for (let i = 0; i < topEnd; i++) {
    const m = lines[i].match(re);
    if (m) {
      let v = m[1].trim();
      const q = v.match(/^"(.*)"$/);
      if (q) return { raw: v, value: q[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\') };
      return { raw: v, value: v };
    }
  }
  return null;
}

/* ---------------- [model_providers.*] 区块手术(LF 域) ---------------- */

function findProviderSection(lines, providerId) {
  const headerRe = new RegExp('^\\s*\\[model_providers\\.' + providerId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\]\\s*$');
  for (let i = 0; i < lines.length; i++) {
    if (headerRe.test(lines[i])) {
      let end = lines.length;
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\s*\[/.test(lines[j])) { end = j; break; }
      }
      return { start: i, end };
    }
  }
  return null;
}

/**
 * 写入/替换 [model_providers.<id>] 区块。fields: {name, baseUrl, apiKey}
 * opts.pruneLocalProviders 为 true 时，才清理其它指向 localhost/127.0.0.1 的
 * provider 区块 (默认 false —— 本地地址可能是用户合法的本机网关，绝不能默默删)。
 * 返回 {text, removedStale}
 */
function patchProviderBlock(text, providerId, fields, opts = {}) {
  let lines = text.split('\n');
  
  const removedStale = [];
  const sec = findProviderSection(lines, providerId);

  // 若已存在该 provider，先提取已有的 http_headers（如果有的话）
  let existingHeaders = null;
  if (sec) {
    for (let i = sec.start + 1; i < sec.end; i++) {
      const m = lines[i].match(/^\s*http_headers\s*=\s*(.+)$/);
      if (m) {
        existingHeaders = m[1].trim();
        break;
      }
    }
  }
  
  const newBlockHeader = '[model_providers.' + providerId + ']';
  const newBodyLines = [
    'name = ' + tomlStr(fields.name || providerId),
    'base_url = ' + tomlStr(fields.baseUrl),
    'wire_api = "responses"',
    'requires_openai_auth = true',
    'experimental_bearer_token = ' + tomlStr(fields.apiKey),
    'supports_websockets = false'
  ];
  
  // 若有旧 headers 且不是空字符串，追加到 body
  if (existingHeaders && existingHeaders.length > 0) {
    newBodyLines.push('http_headers = ' + existingHeaders);
  }
  
  const fullNewBlock = [newBlockHeader, ...newBodyLines];
  
  if (sec) {
    lines.splice(sec.start, sec.end - sec.start, ...fullNewBlock);
  } else {
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    lines.push('', ...fullNewBlock);
  }

  if (opts.pruneLocalProviders === true) {
    let guard = 0;
    while (guard++ < 20) {
      let stale = null;
      for (let i = 0; i < lines.length; i++) {
        const hm = lines[i].match(/^\s*\[model_providers\.([^\]]+)\]\s*$/);
        if (hm && hm[1] !== providerId) {
          let end = lines.length;
          for (let j = i + 1; j < lines.length; j++) {
            if (/^\s*\[/.test(lines[j])) { end = j; break; }
          }
          const body = lines.slice(i + 1, end).join('\n');
          if (/base_url\s*=\s*"(https?:\/\/)?(localhost|127\.0\.0\.1)/.test(body)) {
            stale = { id: hm[1], start: i, end };
            break;
          }
        }
      }
      if (!stale) break;
      lines.splice(stale.start, stale.end - stale.start);
      removedStale.push(stale.id);
    }
  }
  return { text: lines.join('\n'), removedStale };
}

/* ---------------- auth.json(merge 保留未知字段) ---------------- */

function buildAuthJson(existingText, tokens) {
  let obj = {};
  if (existingText) {
    try { obj = JSON.parse(existingText); } catch { /* 原文件损坏则从空开始 */ }
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) obj = {};
  }
  // OPENAI_API_KEY 与 OAuth tokens 语义冲突(分别对应 API 模式/订阅模式),
  // 切换为订阅态时移除;其余字段(用户或新版客户端写入的)一律保留
  delete obj.OPENAI_API_KEY;
  obj.tokens = {
    id_token: tokens.id_token || '',
    access_token: tokens.access_token || '',
    refresh_token: tokens.refresh_token || '',
    account_id: tokens.account_id || ''
  };
  obj.last_refresh = new Date().toISOString();
  return JSON.stringify(obj, null, 2) + '\n';
}

/* ---------------- 备份 / 回滚 ---------------- */

function listBackupFiles(home) {
  const files = ['auth.json', 'config.toml'];
  const meta = readConfigText(path.join(home, 'config.toml'));
  if (meta) {
    const cat = readTopLevelKey(meta.text, 'model_catalog_json');
    if (cat && /^[\w.-]+$/.test(cat.value)) files.push(cat.value);
  }
  return files;
}

function backup(home, reason) {
  const dir = path.join(home, BACKUP_DIRNAME);
  fs.mkdirSync(dir, { recursive: true });
  const ts = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
  const safeReason = String(reason || 'manual').replace(/[^\w\u4e00-\u9fa5-]/g, '_').slice(0, 40);
  const bdir = path.join(dir, stamp + '_' + safeReason);
  fs.mkdirSync(bdir, { recursive: true });
  const copied = [];
  for (const f of listBackupFiles(home)) {
    const src = path.join(home, f);
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.dirname(path.join(bdir, f)), { recursive: true });
      fs.copyFileSync(src, path.join(bdir, f));
      copied.push(f);
    }
  }
  if (copied.length === 0) { fs.rmdirSync(bdir); return null; }
  fs.writeFileSync(path.join(bdir, 'meta.json'), JSON.stringify({
    id: path.basename(bdir), time: ts.toISOString(), reason, files: copied
  }, null, 2));
  pruneBackups(home);
  return path.basename(bdir);
}

function pruneBackups(home) {
  const dir = path.join(home, BACKUP_DIRNAME);
  let entries = [];
  try { entries = fs.readdirSync(dir).filter(d => fs.statSync(path.join(dir, d)).isDirectory()); } catch { return; }
  entries.sort();
  while (entries.length > MAX_BACKUPS) {
    fs.rmSync(path.join(dir, entries.shift()), { recursive: true, force: true });
  }
}

function listBackups(home) {
  const dir = path.join(home, BACKUP_DIRNAME);
  let out = [];
  let entries = [];
  try { entries = fs.readdirSync(dir).filter(d => fs.statSync(path.join(dir, d)).isDirectory()); } catch { return out; }
  for (const e of entries) {
    const meta = readText(path.join(dir, e, 'meta.json'));
    if (meta) {
      try { out.push(JSON.parse(meta)); } catch { /* skip */ }
    }
  }
  out.sort((a, b) => b.id.localeCompare(a.id));
  return out;
}

function restoreBackup(home, id) {
  if (!/^[\w\u4e00-\u9fa5-]+$/.test(id)) throw new Error('非法备份 id');
  const bdir = path.join(home, BACKUP_DIRNAME, id);
  if (!fs.existsSync(bdir)) throw new Error('备份不存在: ' + id);
  backup(home, 'pre-restore');
  let restored = [];
  try {
    const meta = JSON.parse(readText(path.join(bdir, 'meta.json')) || '{}');
    for (const f of (meta.files || [])) {
      if (!/^[\w.-]+$/.test(f)) continue;
      const src = path.join(bdir, f);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(home, f));
        restored.push(f);
      }
    }
  } catch { /* meta 缺失则尝试主文件 */ }
  for (const f of ['auth.json', 'config.toml']) {
    if (restored.includes(f)) continue;
    const src = path.join(bdir, f);
    if (fs.existsSync(src)) { fs.copyFileSync(src, path.join(home, f)); restored.push(f); }
  }
  return restored;
}

/* ---------------- 一键切换(事务) ---------------- */

/**
 * opts: {
 *   home, account{tokens}, relay{name,baseUrl,apiKey},
 *   model, contextWindow|null, fastMode, providerId,
 *   catalogEnabled, catalogSourcePath, catalogFileName,
 *   pruneLocalProviders (默认 false),
 *   onStep(name, ok, detail)
 * }
 */
function applySwitch(opts) {
  const log = [];
  const step = (name, ok, detail) => { log.push({ name, ok, detail }); opts.onStep && opts.onStep(name, ok, detail); };
  const home = opts.home;

  // 输入预检:非法 providerId 会在生成阶段被拒,但更早失败更干净
  if (!isValidProviderId(opts.providerId)) {
    step('输入校验', false, 'providerId 含非法字符: ' + JSON.stringify(opts.providerId));
    return { ok: false, log, error: '非法 providerId' };
  }

  let backupId = null;
  let wroteAnything = false;
  const configPath = path.join(home, 'config.toml');
  const authPath = path.join(home, 'auth.json');

  try {
    fs.mkdirSync(home, { recursive: true });
    step('准备目录', true, home);

    // 1. 读取现状(保留 EOL/BOM 元数据)
    const cfgIn = readConfigText(configPath);
    const authIn = readText(authPath);

    // 2. 备份(文件此刻仍是原样)
    backupId = backup(home, 'switch');
    step('备份当前配置', true, backupId ? '快照 ' + backupId : '无需备份(无现有文件)');

    // 2.5 账号变更检测:account_id 变化 = Codex 会话空间切换(历史/设置按账号隔离)
    try {
      const oldAuth = JSON.parse(authIn || '{}');
      const oldAcc = oldAuth.tokens && oldAuth.tokens.account_id;
      const newAcc = opts.account.tokens.account_id;
      if (oldAcc && newAcc && String(oldAcc) !== String(newAcc)) {
        step('账号变更', true,
          `登录账号将切换(${String(oldAcc).slice(0, 8)}… → ${String(newAcc).slice(0, 8)}…)。` +
          'Codex 的会话历史按账号隔离,重启客户端后会像"新初始化" — 这是预期行为,回滚即可复原原账号的全部数据');
      }
    } catch { /* 无旧 auth 或格式异常则跳过 */ }

    // 2.6 失效路径体检:MCP server 指向不存在的可执行文件(Codex 自动更新后常见)
    //     这不是切换造成的,但切换后重启 Codex 会因 config_load 失败卡在初始化界面 — 提前亮出来
    try {
      if (cfgIn) {
        const cfgObj = TOML.parse(cfgIn.text);
        const dead = [];
        for (const [name, srv] of Object.entries(cfgObj.mcp_servers || {})) {
          const cmd = srv && srv.command;
          if (!cmd) continue;
          // '...node_modules\.bin\x.cmd' 这类相对/内嵌参数命令无法直接判断,只查绝对路径可执行文件
          if (/^[A-Za-z]:[\\/]/.test(cmd) && !fs.existsSync(cmd)) {
            dead.push(`${name} → ${cmd}`);
          }
        }
        if (dead.length) {
          step('失效路径警告', true,
            `config.toml 里有 ${dead.length} 个 MCP server 指向不存在的文件(多为 Codex 自动更新换了运行时目录):` +
            dead.join(' | ') +
            ' — 这与本切换无关,但重启 Codex 可能卡初始化界面;若出现,用备份回滚或手动修正这些路径');
        }
      }
    } catch { /* 体检失败不阻塞切换 */ }

    // 3. 内存中生成全部新内容(LF 域)
    let text = cfgIn ? cfgIn.text : '';
    const topKV = { model: opts.model, model_provider: opts.providerId };
    if (opts.contextWindow != null) topKV.model_context_window = opts.contextWindow;
    if (opts.fastMode !== undefined) topKV.service_tier = opts.fastMode ? 'priority' : null;
    text = patchTopLevelKeys(text, topKV);

    let catalogContent = null;
    if (opts.catalogEnabled) {
      catalogContent = fs.readFileSync(opts.catalogSourcePath);
      text = patchTopLevelKeys(text, { model_catalog_json: opts.catalogFileName });
    } else {
      text = patchTopLevelKeys(text, { model_catalog_json: null });
    }

    const r = patchProviderBlock(text, opts.providerId, {
      name: opts.relay.name, baseUrl: opts.relay.baseUrl, apiKey: opts.relay.apiKey
    }, { pruneLocalProviders: !!opts.pruneLocalProviders });
    text = r.text;

    const newAuth = buildAuthJson(authIn, opts.account.tokens);

    // 4. 写前校验:任何解析失败都不落盘
    TOML.parse(text);
    JSON.parse(newAuth);
    if (catalogContent) JSON.parse(catalogContent.toString('utf8'));
    step('写前校验', true, 'TOML/JSON 解析通过' + (r.removedStale.length ? '(清理本地区块: ' + r.removedStale.join(', ') + ')' : ''));

    // 5. 原子写入
    writeConfigText(configPath, text, cfgIn || { hasBom: false, eol: '\n' });
    wroteAnything = true;
    writeFileSyncSafe(authPath, newAuth);
    if (catalogContent) writeFileSyncSafe(path.join(home, opts.catalogFileName), catalogContent);
    step('写入登录态 auth.json', true, 'account_id=' + (opts.account.tokens.account_id || '?') + ',未知字段已保留');
    step('流量指向中转站', true, opts.relay.baseUrl);

    // 6. 写后复查:读回重解析;失败则自动恢复备份
    const cfgBack = readConfigText(configPath);
    TOML.parse(cfgBack.text);
    JSON.parse(fs.readFileSync(authPath, 'utf8'));
    const cfgObj = TOML.parse(cfgBack.text);
    const prov = (cfgObj.model_providers || {})[opts.providerId];
    if (cfgObj.model_provider !== opts.providerId || !prov || prov.base_url !== opts.relay.baseUrl) {
      throw new Error('校验失败: provider 指向不正确');
    }
    step('校验完成', true, '写后复查通过,绑定生效');
    return { ok: true, log };
  } catch (e) {
    step('失败', false, e.message);
    // 自动回滚:只要写过任何文件,恢复本次切换前的备份
    if (wroteAnything && backupId) {
      try {
        restoreBackup(home, backupId);
        step('自动回滚', true, '已恢复到切换前快照 ' + backupId);
      } catch (re) {
        step('自动回滚失败', false, re.message + ' — 请从备份页手动恢复 ' + backupId);
      }
    }
    return { ok: false, log, error: e.message };
  }
}

/* ---------------- 状态读取 ---------------- */

function getStatus(home) {
  const meta = readConfigText(path.join(home, 'config.toml'));
  const status = {
    home,
    configExists: meta != null,
    model: null, modelProvider: null, baseUrl: null,
    serviceTier: null, contextWindow: null, catalog: null,
    accountId: null, tomlOk: true
  };
  if (meta != null) {
    try {
      const cfg = TOML.parse(meta.text);
      status.model = cfg.model || null;
      status.modelProvider = cfg.model_provider || null;
      status.serviceTier = cfg.service_tier || null;
      status.contextWindow = cfg.model_context_window || null;
      status.catalog = cfg.model_catalog_json || null;
      const prov = (cfg.model_providers || {})[cfg.model_provider || ''];
      if (prov) status.baseUrl = prov.base_url || null;
    } catch {
      status.tomlOk = false;
    }
  }
  const authText = readText(path.join(home, 'auth.json'));
  status.authExists = authText != null;
  if (authText) {
    try {
      const auth = JSON.parse(authText);
      status.accountId = (auth.tokens && auth.tokens.account_id) || auth.account_id || null;
      status.hasTokens = !!(auth.tokens && auth.tokens.access_token);
    } catch { status.hasTokens = false; }
  }
  return status;
}

module.exports = {
  defaultCodexHome, readText, tomlStr, isValidProviderId,
  patchTopLevelKeys, readTopLevelKey, patchProviderBlock, buildAuthJson,
  backup, listBackups, restoreBackup, applySwitch, getStatus
};
