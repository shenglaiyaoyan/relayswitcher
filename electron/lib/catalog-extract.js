'use strict';
/**
 * catalog-extract.js — 从 codex.exe 二进制提取内置模型目录(US-01)。
 * 纯函数核心(可注入 buffer 单测)+ 文件定位/落盘薄壳。
 * 兜底策略:缺 base_instructions 的条目用 fallbackInstructions 填充(生产实践:
 * CockpitTools 与 v1.4.6 均采用 gpt-5.5 全文),并在 report.patchedSlugs 标注。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ANCHORS = [
  Buffer.from('{\r\n  "models": [\r\n', 'utf8'),
  Buffer.from('{\n  "models": [\n', 'utf8')
];

/**
 * 从二进制 buffer 提取目录。纯函数。
 * @param {Buffer} buffer codex.exe 内容(或测试构造)
 * @param {object} opts { fallbackInstructions: string } — 缺字段兜底文本(由调用方从已知完整目录取,不硬编码进源码)
 * @returns {{ catalog: object, report: { modelCount: number, patchedSlugs: string[] } }}
 * @throws 缺锚点 / JSON 损坏 / models 为空 / 无法兜底
 */
function extractCatalogFromBuffer(buffer, opts = {}) {
  let anchorIdx = -1;
  for (const a of ANCHORS) {
    anchorIdx = buffer.indexOf(a);
    if (anchorIdx >= 0) break;
  }
  if (anchorIdx < 0) throw new Error('二进制中未找到模型目录锚点({ "models": [)— 可能是全新的目录格式,需人工分析');

  const text = buffer.slice(anchorIdx, anchorIdx + 8 * 1024 * 1024).toString('utf8').replace(/\r\n/g, '\n');
  const objText = sliceJsonObject(text);
  if (!objText) throw new Error('目录对象未在扫描窗口内闭合(8MB)— 目录异常或格式已变更');
  let catalog;
  try {
    catalog = JSON.parse(objText);
  } catch (e) {
    throw new Error('目录 JSON 解析失败: ' + e.message);
  }

  if (!catalog || !Array.isArray(catalog.models) || catalog.models.length === 0) {
    throw new Error('目录 models 为空或缺失');
  }

  // schema 校验 + 兜底
  const patchedSlugs = [];
  const fallback = typeof opts.fallbackInstructions === 'string' && opts.fallbackInstructions.length > 0
    ? opts.fallbackInstructions : null;
  let fallbackFromCatalog = null;
  for (const m of catalog.models) {
    if (typeof m.base_instructions === 'string' && m.base_instructions) {
      if (m.slug === 'gpt-5.5') { fallbackFromCatalog = m.base_instructions; break; }
      if (!fallbackFromCatalog) fallbackFromCatalog = m.base_instructions;
    }
  }
  const patchText = fallback || fallbackFromCatalog;
  for (const m of catalog.models) {
    if (!m.slug) throw new Error('目录存在无 slug 条目');
    if (typeof m.base_instructions !== 'string' || !m.base_instructions) {
      if (!patchText) {
        throw new Error('条目 ' + m.slug + ' 缺 base_instructions 且无可用兜底文本(源目录中没有任何条目携带该字段)');
      }
      m.base_instructions = patchText;
      patchedSlugs.push(m.slug);
    }
  }
  return { catalog, report: { modelCount: catalog.models.length, patchedSlugs } };
}

/** 从文本起点扫描平衡大括号,截取完整 JSON 对象(正确处理字符串内的 { } 与转义) */
function sliceJsonObject(text) {
  let depth = 0, inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return text.slice(0, i + 1); }
  }
  return null;
}

/**
 * 定位本机 codex.exe:优先 %LOCALAPPDATA%\OpenAI\Codex\bin\*\codex.exe(取 mtime 最新),
 * 兜底 WindowsApps MSIX 安装目录。
 */
function locateCodexBinary() {
  const candidates = [];
  const binRoot = path.join(process.env.LOCALAPPDATA || '', 'OpenAI', 'Codex', 'bin');
  try {
    for (const d of fs.readdirSync(binRoot)) {
      const p = path.join(binRoot, d, 'codex.exe');
      try { candidates.push({ p, mtime: fs.statSync(p).mtimeMs }); } catch { /* skip */ }
    }
  } catch { /* 无 bin 目录 */ }
  const appsRoot = 'C:\\Program Files\\WindowsApps';
  try {
    for (const d of fs.readdirSync(appsRoot)) {
      if (/^OpenAI\.Codex/i.test(d)) {
        const p = path.join(appsRoot, d, 'app', 'resources', 'codex.exe');
        try { candidates.push({ p, mtime: fs.statSync(p).mtimeMs }); } catch { /* skip */ }
      }
    }
  } catch { /* WindowsApps 常见无权限,静默 */ }
  if (!candidates.length) throw new Error('未找到本机 codex.exe(LOCALAPPDATA\\OpenAI\\Codex\\bin 与 WindowsApps 均无)');
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0].p;
}

/**
 * 提取并落盘。
 * @returns {{ outPath, report, binPath }}
 */
function extractToFile(outDir, opts = {}) {
  const binPath = locateCodexBinary();
  const buffer = fs.readFileSync(binPath);
  const { catalog, report } = extractCatalogFromBuffer(buffer, opts);
  fs.mkdirSync(outDir, { recursive: true });
  const hash = crypto.createHash('sha256').update(binPath + ':' + buffer.length + ':' + report.modelCount).digest('hex').slice(0, 10);
  const outPath = path.join(outDir, 'extracted-' + hash + '.json');
  fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2));
  return { outPath, report, binPath };
}

module.exports = { extractCatalogFromBuffer, locateCodexBinary, extractToFile };
