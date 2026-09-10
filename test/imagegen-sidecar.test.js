'use strict';
/* Test: imagegen-sidecar 注入逻辑(US-07,纯函数) */
const { test } = require('node:test');
const assert = require('node:assert');
const { injectImageGenTool, isResponsesRequest, IMAGE_GEN_TOOL } = require('../electron/lib/imagegen-sidecar.js');

test('注入:普通模型 + 无 tools → 添加 image_generation', () => {
  const out = injectImageGenTool({ model: 'gpt-6-astra', input: 'hi' });
  assert.ok(Array.isArray(out.tools));
  assert.equal(out.tools.length, 1);
  assert.deepStrictEqual(out.tools[0], IMAGE_GEN_TOOL);
});

test('注入:已有 image_generation → 不重复添加', () => {
  const input = { model: 'gpt-6-astra', tools: [{ type: 'image_generation' }, { type: 'function', name: 'x' }] };
  const out = injectImageGenTool(input);
  assert.equal(out.tools.length, 2);
  assert.strictEqual(out, input, '无变化时返回原对象(避免无谓序列化)');
});

test('注入:spark 系模型 → 跳过(不支持画图)', () => {
  const out = injectImageGenTool({ model: 'gpt-5.3-codex-spark', tools: [] });
  assert.strictEqual(out.tools.length, 0, 'spark 不注入');
  const out2 = injectImageGenTool({ model: 'gpt-5.3-codex-spark' });
  assert.strictEqual(out2.tools, undefined, 'spark 无 tools 字段也不加');
});

test('注入:已有其它工具但无 image_generation → 追加到末尾', () => {
  const out = injectImageGenTool({ model: 'gpt-5.5', tools: [{ type: 'function', name: 'read_file' }] });
  assert.equal(out.tools.length, 2);
  assert.equal(out.tools[0].name, 'read_file');
  assert.equal(out.tools[1].type, 'image_generation');
});

test('注入:非对象/null → 原样返回不崩', () => {
  assert.strictEqual(injectImageGenTool(null), null);
  assert.strictEqual(injectImageGenTool(undefined), undefined);
  assert.strictEqual(injectImageGenTool('string'), 'string');
});

test('路径判断:POST /responses → true;其它 → false', () => {
  assert.ok(isResponsesRequest('POST', '/v1/responses'));
  assert.ok(isResponsesRequest('POST', '/v1/responses/'));
  assert.ok(isResponsesRequest('POST', '/responses'));
  assert.ok(!isResponsesRequest('GET', '/v1/responses'));
  assert.ok(!isResponsesRequest('POST', '/v1/models'));
  assert.ok(!isResponsesRequest('POST', '/v1/chat/completions'));
});
