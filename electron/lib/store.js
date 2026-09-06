'use strict';
/**
 * store.js — 账号/中转站/设置 的本地持久化。
 * 敏感字段(OAuth tokens、API Key)用 Electron safeStorage(Windows 上由 DPAPI 保护)加密后落盘。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let safeStorage = null;
try { safeStorage = require('electron').safeStorage; } catch { /* 测试环境无 electron */ }

function createStore(userDataDir) {
  const file = path.join(userDataDir, 'store.json');
  let data = { accounts: [], relays: [], settings: {
    providerId: 'codex_local_access',
    catalogFileName: 'relayswitcher-model-catalog.json',
    catalogEnabled: true,
    codexHome: '',
    fastMode: true,
    contextWindow: 872000,
    pruneLocalProviders: false
  }};

  function load() {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      data = { ...data, ...raw, settings: { ...data.settings, ...(raw.settings || {}) } };
    } catch { /* 首次运行 */ }
    return data;
  }

  function save() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  }

  function enc(plain) {
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      return { enc: true, data: safeStorage.encryptString(plain).toString('base64') };
    }
    return { enc: false, data: Buffer.from(plain, 'utf8').toString('base64') };
  }

  function dec(blob) {
    if (blob == null) return '';
    if (blob.enc) {
      if (safeStorage && safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(Buffer.from(blob.data, 'base64'));
      }
      throw new Error('加密数据无法解密(系统凭据不可用)');
    }
    return Buffer.from(blob.data, 'base64').toString('utf8');
  }

  /* ---------- JWT 解码(仅读声明,不验签) ---------- */
  function decodeJwt(jwt) {
    try {
      const part = String(jwt).split('.')[1];
      const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      return JSON.parse(json);
    } catch { return {}; }
  }

  /** 把 auth.json / Sub2API(k12) 等格式统一归一化为 tokens 对象 */
  function normalizeTokens(input) {
    if (typeof input === 'string') input = JSON.parse(input);
    const t = input.tokens && typeof input.tokens === 'object' ? input.tokens : input;
    const pick = (...keys) => { for (const k of keys) if (t[k]) return t[k]; return ''; };
    const tokens = {
      id_token: pick('id_token', 'IdToken'),
      access_token: pick('access_token', 'accessToken', 'token'),
      refresh_token: pick('refresh_token', 'refreshToken'),
      account_id: pick('account_id', 'accountId', 'chatgpt_account_id')
    };
    if (!tokens.access_token && !tokens.refresh_token) throw new Error('未找到 access_token/refresh_token,请检查 JSON 格式');
    return tokens;
  }

  function describeTokens(tokens) {
    const claims = decodeJwt(tokens.id_token || tokens.access_token || '');
    const email = claims.email || claims['https://api.openai.com/profile']?.email || '';
    const plan = claims['chatgpt_plan_type'] || claims['https://api.openai.com/auth']?.chatgpt_plan_type
      || claims.chatgpt_account_type || '';
    const exp = claims.exp ? new Date(claims.exp * 1000).toISOString() : '';
    return { email, plan, exp };
  }

  return {
    load, save,
    encrypt: enc, decrypt: dec,

    addAccount(rawJson, label) {
      const tokens = normalizeTokens(rawJson);
      const info = describeTokens(tokens);
      const account = {
        id: crypto.randomUUID(),
        label: label || info.email || ('账号 ' + (data.accounts.length + 1)),
        email: info.email, plan: info.plan, tokenExp: info.exp,
        accountId: tokens.account_id,
        tokensEnc: enc(JSON.stringify(tokens)),
        addedAt: new Date().toISOString()
      };
      data.accounts.push(account);
      save();
      return publicAccount(account);
    },

    deleteAccount(id) {
      data.accounts = data.accounts.filter(a => a.id !== id);
      save();
    },

    getAccount(id) {
      const a = data.accounts.find(x => x.id === id);
      if (!a) throw new Error('账号不存在');
      return { ...a, tokens: JSON.parse(dec(a.tokensEnc)) };
    },

    /** 刷新成功后更新存储的 tokens(refresh_token 轮换时以服务端返回为准) */
    updateTokens(id, tokens) {
      const a = data.accounts.find(x => x.id === id);
      if (!a) throw new Error('账号不存在');
      const info = describeTokens(tokens);
      a.tokensEnc = enc(JSON.stringify(tokens));
      if (info.email) a.email = info.email;
      if (info.plan) a.plan = info.plan;
      if (info.exp) a.tokenExp = info.exp;
      if (tokens.account_id) a.accountId = tokens.account_id;
      save();
      return publicAccount(a);
    },

    listAccounts() {
      return data.accounts.map(a => {
        const p = publicAccount(a);
        try {
          const tokens = JSON.parse(dec(a.tokensEnc));
          p.hasRefreshToken = !!tokens.refresh_token;
        } catch { p.hasRefreshToken = false; }
        return p;
      });
    },

    saveRelay(relay) {
      if (!relay.name || !relay.baseUrl) throw new Error('名称和 base_url 必填');
      if (relay.id) {
        const i = data.relays.findIndex(r => r.id === relay.id);
        if (i < 0) throw new Error('中转站不存在');
        const old = data.relays[i];
        data.relays[i] = { ...old, name: relay.name, baseUrl: relay.baseUrl.trim().replace(/\/+$/, ''),
          apiKeyEnc: relay.apiKey ? enc(relay.apiKey) : old.apiKeyEnc };
      } else {
        data.relays.push({ id: crypto.randomUUID(), name: relay.name,
          baseUrl: relay.baseUrl.trim().replace(/\/+$/, ''),
          apiKeyEnc: relay.apiKey ? enc(relay.apiKey) : null, lastTest: null });
      }
      save();
    },

    deleteRelay(id) { data.relays = data.relays.filter(r => r.id !== id); save(); },

    getRelay(id) {
      const r = data.relays.find(x => x.id === id);
      if (!r) throw new Error('中转站不存在');
      return { ...r, apiKey: r.apiKeyEnc ? dec(r.apiKeyEnc) : '' };
    },

    listRelays() {
      return data.relays.map(r => ({ id: r.id, name: r.name, baseUrl: r.baseUrl,
        hasKey: !!r.apiKeyEnc, lastTest: r.lastTest || null }));
    },

    setRelayTest(id, result) {
      const r = data.relays.find(x => x.id === id);
      if (r) { r.lastTest = result; save(); }
    },

    getSettings() { return { ...data.settings }; },
    saveSettings(s) { data.settings = { ...data.settings, ...s }; save(); return this.getSettings(); }
  };
}

function publicAccount(a) {
  return { id: a.id, label: a.label, email: a.email, plan: a.plan,
    tokenExp: a.tokenExp, accountId: a.accountId, addedAt: a.addedAt };
}

module.exports = { createStore };
