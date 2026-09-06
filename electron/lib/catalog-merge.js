'use strict';
/**
 * catalog-merge.js — 把自定义模型(US-02)合并进目录。
 * 派生式:基于现有模板条目深拷贝后覆盖少量字段,不做自由编辑(坏目录会炸 Codex,已实证)。
 */
function mergeCustomModels(catalog, customModels) {
  if (!Array.isArray(customModels) || customModels.length === 0) return catalog;
  const bySlug = new Map(catalog.models.map(m => [m.slug, m]));
  const out = { ...catalog, models: catalog.models.slice() };
  for (const cm of customModels) {
    if (!cm || !cm.templateSlug || !cm.slug || !/^[a-z0-9][a-z0-9._-]*$/i.test(cm.slug)) {
      throw new Error('自定义模型配置非法(缺 templateSlug/slug 或 slug 含非法字符): ' + JSON.stringify(cm));
    }
    const tpl = bySlug.get(cm.templateSlug);
    if (!tpl) throw new Error('自定义模型 ' + cm.slug + ' 的模板 ' + cm.templateSlug + ' 不存在于目录');
    const merged = JSON.parse(JSON.stringify(tpl)); // 深拷贝
    merged.slug = cm.slug;
    if (cm.displayName) merged.display_name = cm.displayName;
    if (cm.description != null) merged.description = cm.description;
    if (cm.contextWindow && Number(cm.contextWindow) > 0) {
      merged.context_window = Number(cm.contextWindow);
      merged.max_context_window = Math.max(Number(cm.contextWindow), merged.max_context_window || 0);
    }
    if (Array.isArray(cm.reasoningLevels) && cm.reasoningLevels.length) {
      merged.supported_reasoning_levels = cm.reasoningLevels.map(r => ({ effort: r, description: '' }));
    }
    const idx = out.models.findIndex(m => m.slug === cm.slug);
    if (idx >= 0) out.models[idx] = merged; // 同 slug = 改写既有条目(用户意图:改现有模型)
    else out.models.push(merged);
    bySlug.set(cm.slug, merged);
  }
  return out;
}

module.exports = { mergeCustomModels };
