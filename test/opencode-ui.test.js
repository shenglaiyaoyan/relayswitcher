'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = name => fs.readFileSync(path.join(__dirname, '../src', name), 'utf8');

test('OpenCode 编辑为整页 Provider 工作区，不叠加 Provider/模型弹窗', () => {
  const source = read('pages/OpenCode.jsx');
  assert.match(source, /<ProviderEditor/);
  assert.doesNotMatch(source, /Modal open=\{!!editing\}/);
  assert.match(source, /<ModelEditor/);
  const editor = read('pages/opencode/ProviderEditor.jsx');
  assert.doesNotMatch(editor, /<Modal|createPortal/);
  assert.match(editor, /保存并写入 OpenCode 配置/);
});

test('Provider 接入和标识全部手动输入，拉模型只使用当前表单值', () => {
  const editor = read('pages/opencode/ProviderEditor.jsx');
  for (const field of ['baseUrl', 'apiKey', 'id', 'name']) {
    assert.match(editor, new RegExp(`value=\\{data\\.${field}`), field);
  }
  assert.doesNotMatch(editor, /已关联|pickRelay|data\.relayId|relays\.map/);
  assert.match(editor, /onFetchModels\(providerFetchTarget\(draft\)\)/);
});

test('OpenCode 输入保持局部渲染，保存/离开前同步完整草稿', () => {
  const editor = read('pages/opencode/ProviderEditor.jsx');
  const model = read('pages/opencode/ModelEditor.jsx');
  const fields = read('pages/opencode/fields.jsx');
  assert.match(editor, /<DraftTextInput registerFlush=\{registerInput\} field="baseUrl"/);
  assert.match(model, /export default memo\(function ModelEditor/);
  assert.match(fields, /if \(latest\.current\.text !== value\) latest\.current\.onCommit/);
  assert.match(editor, /editingRef\.current = draft/);
  assert.match(model, /provider\.models\[current\.modelIndex\]/);
  const source = read('pages/OpenCode.jsx');
  assert.match(source, /const isDirty = JSON\.stringify\(draft\) !== baselineRef\.current/);
});

test('新增档位输入框显式文本类型，标题使用正常功能字号', () => {
  const model = read('pages/opencode/ModelEditor.jsx');
  assert.match(model, /<input[^>]*type="text"[^>]*value=\{newEffort\}/);
  const editor = read('pages/opencode/ProviderEditor.jsx');
  assert.doesNotMatch(editor, /playfair/);
  assert.match(editor, /className="oc-editor-title"/);
});

test('API Key 小眼睛切换显示，已保存时提示留空保持不变', () => {
  const editor = read('pages/opencode/ProviderEditor.jsx');
  assert.match(editor, /type=\{showKey \? 'text' : 'password'\}/);
  assert.match(editor, /aria-label=\{showKey \? '隐藏 API Key' : '显示 API Key'\}/);
  assert.match(editor, /已保存 · 留空保持不变/);
});

test('模型模板：拉取自动套用、批量套用、单模型模板选择，移除硬编码推荐参数', () => {
  const source = read('pages/OpenCode.jsx');
  assert.match(source, /applyTemplate\(newModel\(id\)/);
  assert.match(source, /className="oc-batch-bar"/);
  assert.match(source, /按名称自动匹配/);
  assert.match(source, /className="oc-model-search"/);
  const model = read('pages/opencode/ModelEditor.jsx');
  assert.doesNotMatch(model, /套用推荐参数|RECOMMENDED_EFFORTS/);
  assert.match(model, /存为新模板/);
  assert.match(model, /templateDiff\(model\)/);
  assert.match(model, /已修改/);
  for (const mod of ['text', 'image', 'audio', 'video', 'pdf']) assert.match(model, new RegExp(`'${mod}'`));
  assert.match(model, /新增档位/);
  const settings = read('pages/Settings.jsx');
  assert.match(settings, /<TemplateLibrary/);
  const lib = read('pages/opencode/TemplateLibrary.jsx');
  assert.match(lib, /恢复内置模板/);
  assert.match(lib, /ocTemplatesSave/);
});

test('未保存编辑离开有确认，Provider 统计数字使用正常字号', () => {
  const source = read('pages/OpenCode.jsx');
  assert.match(source, /setNavigationGuard/);
  assert.match(source, /放弃未保存的修改/);
  assert.match(source, /JSON\.stringify\(editing\)/);
  assert.match(source, /\(resume \|\| close\)\(\)/);
  const app = read('App.jsx');
  assert.match(app, /canLeavePage\(navigate\)/);
  const css = read('styles.css');
  assert.match(css, /\.oc-directory-tools[^}]*font-size:\s*13px/);
  assert.match(css, /\.oc-model-count[^}]*font-size:\s*13px/);
  assert.match(css, /\.oc-editor-title[^}]*font-size:\s*16px[^}]*font-weight:\s*500/);
});
