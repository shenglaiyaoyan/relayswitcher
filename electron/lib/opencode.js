'use strict';
/**
 * opencode.js — OpenCode 配置管理(纯函数核心)。
 * 职责:读写 ~/.config/opencode/opencode.json(JSONC 容错)与
 * ~/.local/share/opencode/auth.json;外科手术式合并/摘除 provider 块;
 * 写前备份。路径可通过传入 home 覆盖(测试用)。
 */
const fs = require('fs');
const path = require('path');

const PROTOCOL_ADAPTERS = {
  message: '@ai-sdk/anthropic',
  chat: '@ai-sdk/openai-compatible',
  responses: '@ai-sdk/openai'
};

function configPath(home) { return path.join(home || '', '.config', 'opencode', 'opencode.json'); }
function authPath(home) { return path.join(home || '', '.local', 'share', 'opencode', 'auth.json'); }
function backupDir(home) { return path.join(home || '', '.config', 'opencode', 'relayswitcher-backups'); }

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
  out.provider = { ...(out.provider || {}) };
  out.provider[pd.id] = {
    npm: pd.npm,
    name: pd.name,
    options: pd.options || {},
    ...(pd.models && Object.keys(pd.models).length ? { models: pd.models } : {})
  };
  if (pd.defaultModel) out.model = pd.defaultModel;
  return out;
}

function removeProviderBlock(existing, providerId) {
  const out = { ...existing };
  if (out.provider) {
    const { [providerId]: removed, ...rest } = out.provider;
    out.provider = rest;
  }
  if (out.model && out.model.startsWith(providerId + '/')) delete out.model;
  return out;
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
  PROTOCOL_ADAPTERS, configPath, authPath,
  readOpenCodeConfig, writeOpenCodeConfig,
  readAuthFile, writeAuthFile,
  mergeProviderBlock, removeProviderBlock,
  backupOpenCode, stripJsonComments
};
