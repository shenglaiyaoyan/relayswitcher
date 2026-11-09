'use strict';
/**
 * 兼容模式改写规则(2026-11-09):Codex 桌面版 0.167 的 Page 功能每轮插入缺 call_id 的
 * function_call_output(codex_apps_open_page 等),Sub2API 系中转在请求里没有工具调用时整单拒绝。
 * 把这类条目改成普通 user 消息,其余条目原样。
 */
const TOOL_OUTPUT_TYPES = new Set(['function_call_output', 'custom_tool_call_output']);

function isOrphanToolOutput(item) {
  return !!item && typeof item === 'object' && TOOL_OUTPUT_TYPES.has(item.type)
    && !(typeof item.call_id === 'string' && item.call_id.trim());
}

function toParts(output) {
  if (typeof output === 'string') return [{ type: 'input_text', text: output }];
  if (Array.isArray(output)) {
    return output.map(part => {
      if (part && ['input_text', 'output_text', 'text'].includes(part.type) && typeof part.text === 'string') {
        return { type: 'input_text', text: part.text };
      }
      if (part && (part.type === 'input_image' || part.type === 'input_file')) return part;
      return { type: 'input_text', text: typeof part === 'string' ? part : JSON.stringify(part) };
    });
  }
  if (output == null) return [];
  return [{ type: 'input_text', text: JSON.stringify(output) }];
}

function toUserMessage(item) {
  const parts = toParts(item.output);
  if (item.name) {
    const label = `[${item.name}]`;
    const first = parts.findIndex(p => p.type === 'input_text');
    if (first >= 0) parts[first] = { type: 'input_text', text: label + '\n' + parts[first].text };
    else parts.unshift({ type: 'input_text', text: label });
  }
  if (!parts.length) parts.push({ type: 'input_text', text: '' });
  return { type: 'message', role: 'user', content: parts };
}

/** 返回 { body, count }:count 为 0 时 body 就是传入的原对象 */
function rewriteOrphanToolOutputs(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.input)) return { body, count: 0 };
  let count = 0;
  const input = body.input.map(item => {
    if (!isOrphanToolOutput(item)) return item;
    count++;
    return toUserMessage(item);
  });
  return count ? { body: { ...body, input }, count } : { body, count: 0 };
}

module.exports = { rewriteOrphanToolOutputs, isOrphanToolOutput };
