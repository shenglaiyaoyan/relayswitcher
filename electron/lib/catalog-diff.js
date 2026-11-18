'use strict';
/**
 * catalog-diff.js — 目录版本对比(US-09)。
 * 内置快照 vs 本机提取目录的 slug 差异:官方出新模型时,用户一眼看出
 * 提取目录比内置快照多了什么(提示切换目录源),少了什么(快照过期)。
 */
function diffCatalogSlugs(builtinSlugs, extractedSlugs) {
  const a = new Set(builtinSlugs || []);
  const b = new Set(extractedSlugs || []);
  const added = [...b].filter(s => !a.has(s)).sort();   // 提取目录新增(官方新模型)
  const removed = [...a].filter(s => !b.has(s)).sort(); // 提取目录缺失(仅内置快照有)
  return { added, removed };
}

/**
 * 实际用哪份官方目录(2026-11-18)。选了「本机提取」但内置快照更新时 —— 内置包含本机全部模型且多出新模型
 * (RS 先于本机 Codex 跟进官方,如 GPT-6.2)—— 用内置快照,免得点过「提取」就被卡在旧目录;
 * 本机提取有新模型、两边一致或各有独有时照旧用本机提取。
 */
function pickOfficialSource(mode, builtinSlugs, extractedSlugs) {
  if (mode !== 'extracted' || !Array.isArray(extractedSlugs)) return { source: 'builtin', builtinNewer: false };
  const { added, removed } = diffCatalogSlugs(builtinSlugs, extractedSlugs);
  const builtinNewer = added.length === 0 && removed.length > 0;
  return { source: builtinNewer ? 'builtin' : 'extracted', builtinNewer };
}

module.exports = { diffCatalogSlugs, pickOfficialSource };
