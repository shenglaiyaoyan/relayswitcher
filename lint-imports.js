'use strict';
/**
 * lint-imports.js — 全文件全组件 import 审计(塞进冒烟流程,打包前自动跑)
 * 用法:node lint-imports.js;退出码非零 = 有问题
 */
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'src');
const UI_EXPORTS = [
  'Icon', 'Spinner', 'Select', 'Modal', 'Confirm', 'Empty', 'Field',
  'Toggle', 'fmtK', 'fmtAgo', 'planLabel', 'PLAN_LABEL', 'PLAN_LABELS'
];

function listJsxFiles(dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(listJsxFiles(p));
    else if (/\.(jsx|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

let issues = 0;
const files = listJsxFiles(SRC_DIR);

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const isUi = f.endsWith(path.join('components', 'ui.jsx'));

  // 检查从 ui.jsx 导入的组件使用
  if (!isUi) {
    for (const comp of UI_EXPORTS) {
      // JSX 使用 <Comp 或 {Comp 或 Comp( 调用
      const uses = (src.match(new RegExp('<' + comp + '[\\s/>]|\\{' + comp + '[\\s}]|[^\\w.]' + comp + '\\(', 'g')) || []).length;
      if (uses > 0) {
        const imports = new RegExp('import\\s*\\{[^}]*\\b' + comp + '\\b[^}]*\\}', 's').test(src);
        if (!imports) {
          console.error(`✗ ${path.relative(process.cwd(), f)}: 用 ${comp} ${uses} 处但未 import`);
          issues++;
        }
      }
    }
  }

  // 检查 React hook 使用(useState/useEffect 等)
  for (const hook of ['useState', 'useEffect', 'useMemo', 'useRef', 'useCallback', 'useContext']) {
    if (new RegExp('[^\\w.]' + hook + '\\(').test(src) && !/import.*\buse/.test(src)) {
      console.error(`✗ ${path.relative(process.cwd(), f)}: 用 ${hook} 但未从 react import`);
      issues++;
    }
  }
}

// 检查跨页面 props 解构(props 里用了但没从 props 拿)
// 这个较难静态分析,暂跳过(catalogBundled 那类靠渲染错误兜层)

if (issues > 0) {
  console.error(`\nLINT_IMPORTS: ${issues} 个问题`);
  process.exit(1);
} else {
  console.log('LINT_IMPORTS: ALL_CLEAN');
}
