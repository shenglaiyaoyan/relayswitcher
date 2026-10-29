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

test('新增档位输入框显式文本类型，标题不用衬线斜体', () => {
  const model = read('pages/opencode/ModelEditor.jsx');
  assert.match(model, /<input[^>]*type="text"[^>]*value=\{newEffort\}/);
  const editor = read('pages/opencode/ProviderEditor.jsx');
  assert.doesNotMatch(editor, /playfair/i);
  assert.match(editor, /className="oce-title"/);
});

test('API Key 小眼睛切换显示，已保存时提示留空保持不变', () => {
  const editor = read('pages/opencode/ProviderEditor.jsx');
  assert.match(editor, /type=\{showKey \? 'text' : 'password'\}/);
  assert.match(editor, /aria-label=\{showKey \? '隐藏 API Key' : '显示 API Key'\}/);
  assert.match(editor, /已保存 · 留空保持不变/);
});

test('编辑页撑满主区域：整页不滚动，保存栏贴底，只有表格和抽屉内部滚动', () => {
  const css = read('styles.css');
  assert.match(css, /\.main:has\(\.oce\)\s*\{[^}]*padding:\s*0[^}]*overflow:\s*hidden/);
  assert.match(css, /\.oce\s*\{[^}]*flex:\s*1[^}]*min-height:\s*0/);
  assert.doesNotMatch(css, /calc\(100vh - 108px\)/);
  assert.match(css, /\.oce-table-body\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(css, /\.oce-drawer-body\s*\{[^}]*overflow-y:\s*auto/);
});

test('表格 + 抽屉：批量复选框只在批量模式出现，拉取改为弹层，默认模型由抽屉星标设置', () => {
  const table = read('pages/opencode/ModelTable.jsx');
  assert.match(table, /\{batch && <input type="checkbox"/);
  assert.match(table, /className="oce-batch-bar"/);
  assert.match(table, /按名称自动匹配/);
  assert.match(table, /className="oce-search"/);
  for (const col of ['模型 ID', '名称', '模板', '上下文', '输出', '默认档位', '能力']) assert.match(table, new RegExp(col));
  const pop = read('pages/opencode/FetchPopover.jsx');
  assert.match(pop, /加入时自动套用匹配模板/);
  assert.match(pop, /已添加/);
  const source = read('pages/OpenCode.jsx');
  assert.match(source, /applyTemplate\(newModel\(id\)/);
  assert.doesNotMatch(source, /oc-fetched-models/);
  const editor = read('pages/opencode/ProviderEditor.jsx');
  assert.doesNotMatch(editor, /默认模型/);
  const model = read('pages/opencode/ModelEditor.jsx');
  assert.match(model, /设为默认/);
  assert.match(model, /删除此模型/);
});

test('参数抽屉：模板菜单即点即套用、存为新模板、已修改标记、全部控件保留', () => {
  const model = read('pages/opencode/ModelEditor.jsx');
  assert.doesNotMatch(model, /套用推荐参数|RECOMMENDED_EFFORTS/);
  assert.match(model, /存为新模板/);
  assert.match(model, /onChange\(applyTemplate\(model, t\)\)/);
  assert.match(model, /templateDiff\(model\)/);
  assert.match(model, /已修改/);
  for (const mod of ['text', 'image', 'audio', 'video', 'pdf']) assert.match(model, new RegExp(`'${mod}'`));
  for (const cap of ['推理', '附件', '工具', 'Temp']) assert.match(model, new RegExp(cap));
  assert.match(model, /添加档位/);
  const settings = read('pages/Settings.jsx');
  assert.match(settings, /<TemplateLibrary/);
  const lib = read('pages/opencode/TemplateLibrary.jsx');
  assert.match(lib, /恢复内置模板/);
  assert.match(lib, /ocTemplatesSave/);
});
test('编辑页每个按钮都有自定义背景和边框，不能露出系统默认白色按钮', () => {
  const css = read('styles.css');
  const files = ['ModelEditor.jsx', 'ModelTable.jsx', 'FetchPopover.jsx', 'ProviderEditor.jsx'].map(f => read('pages/opencode/' + f));
  const classes = new Set();
  for (const src of files) {
    for (const m of src.matchAll(/<button[^>]*?className=\{?["'`]([^"'`]+)/g)) classes.add(m[1].trim().split(/\s+/)[0]);
    assert.doesNotMatch(src, /<button(?![^>]*className)[^>]*>/, '按钮必须带 className');
  }
  const covered = c => {
    const rules = [...css.matchAll(new RegExp('[^}]*\\.' + c.replace(/[-]/g, '\\-') + '\\b[^{]*\\{([^}]*)\\}', 'g'))].map(m => m[1]);
    return rules.some(r => /background/.test(r)) && rules.some(r => /border\s*:/.test(r));
  };
  // .mono 仅用于档位名按钮，由 .oce-effort > button:first-child 负责样式
  for (const c of classes) if (c !== 'mono') assert.ok(covered(c), `按钮类 .${c} 缺少 background 或 border 样式`);
  assert.match(css, /\.oce-effort > button:first-child\s*\{[^}]*border:\s*0[^}]*background:\s*none/);
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
});
