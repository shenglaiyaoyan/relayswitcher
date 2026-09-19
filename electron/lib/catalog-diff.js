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

module.exports = { diffCatalogSlugs };
