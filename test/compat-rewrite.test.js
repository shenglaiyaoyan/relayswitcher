'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { rewriteOrphanToolOutputs } = require('../electron/lib/compat-rewrite');

test('缺 call_id 的工具结果改成 user 消息，其余条目原样，不改原对象', () => {
  const call = { type: 'function_call', call_id: 'call_1', name: 'shell', arguments: '{}' };
  const paired = { type: 'function_call_output', call_id: 'call_1', output: 'ok' };
  const body = { model: 'm', stream: true, input: [
    { type: 'function_call_output', id: 'fco_1', name: 'codex_apps_open_page', namespace: 'agent', output: '{"page_id":null}',
      internal_chat_message_metadata_passthrough: {} },
    { type: 'custom_tool_call_output', call_id: '  ', output: [{ type: 'input_text', text: 'a' }, { type: 'input_image', image_url: 'data:x' }, { type: 'other', v: 1 }] },
    { type: 'function_call_output', call_id: null, output: null },
    call, paired
  ] };
  const r = rewriteOrphanToolOutputs(body);
  assert.equal(r.count, 3);
  assert.deepEqual(r.body.input[0], { type: 'message', role: 'user', content: [{ type: 'input_text', text: '[codex_apps_open_page]\n{"page_id":null}' }] });
  assert.deepEqual(r.body.input[1], { type: 'message', role: 'user', content: [
    { type: 'input_text', text: 'a' }, { type: 'input_image', image_url: 'data:x' }, { type: 'input_text', text: '{"type":"other","v":1}' }] });
  assert.deepEqual(r.body.input[2], { type: 'message', role: 'user', content: [{ type: 'input_text', text: '' }] });
  assert.equal(r.body.input[3], call);
  assert.equal(r.body.input[4], paired);
  assert.equal(r.body.model, 'm');
  assert.equal(body.input[0].type, 'function_call_output');
});

test('有名字但没有文本时单独补一条名字；无需改写时返回原对象', () => {
  const r = rewriteOrphanToolOutputs({ input: [{ type: 'function_call_output', name: 'x', output: [{ type: 'input_image', image_url: 'u' }] }] });
  assert.deepEqual(r.body.input[0].content, [{ type: 'input_text', text: '[x]' }, { type: 'input_image', image_url: 'u' }]);
  const clean = { input: [{ type: 'message', role: 'user', content: [] }] };
  const same = rewriteOrphanToolOutputs(clean);
  assert.equal(same.count, 0);
  assert.equal(same.body, clean);
  assert.equal(rewriteOrphanToolOutputs({ input: 'text' }).count, 0);
  assert.equal(rewriteOrphanToolOutputs(null).count, 0);
});
