'use strict';
/**
 * oauth-errors.js — token 刷新失败响应的错误提取。
 * auth.openai.com /oauth/token 的 error 有两种形态:
 *   字符串: {"error": "invalid_grant"}          (经典 OAuth)
 *   对象:   {"error": {message, type, code}}    (实测 2026-09-18, 401 token_expired 即此形态)
 * 对象直接字符串拼接会产生 "[object Object]",且 error.code 里的失效语义
 * (token_expired 等)必须映射到"已失效"提示,否则会被伪装成"请检查网络"。
 */

const DEAD_CODES = new Set(['token_expired', 'invalid_grant', 'refresh_token_reused']);

function isDeadTokenCode(code) {
  const s = String(code || '');
  return DEAD_CODES.has(s) || s.startsWith('refresh_token_');
}

function extractTokenError(j, status) {
  const e = j && j.error;
  let err, dead = false;
  if (e && typeof e === 'object') {
    err = e.code || e.type || ('HTTP ' + status);
    dead = isDeadTokenCode(e.code);
  } else if (typeof e === 'string' && e) {
    err = e;
    dead = e === 'invalid_grant';
  } else {
    err = 'HTTP ' + status;
  }
  let hint;
  if (dead) hint = 'refresh_token 已失效(多为渠道共享池被他人刷新轮换),需重新获取账号';
  else if (status === 429) hint = '被 OpenAI 频控,稍后再试(后台自动保养与手动刷新叠加可能触发)';
  else if (status >= 500) hint = 'OpenAI 服务端错误,稍后再试';
  else hint = '请检查网络(需能访问 auth.openai.com)';
  return err + ' — ' + hint;
}

module.exports = { extractTokenError };
