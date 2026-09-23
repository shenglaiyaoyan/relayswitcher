'use strict';
/**
 * catalog-patch.js — 官方目录跟进策略(v1.10.3,用户指令:配置活全部长在 RS 里)。
 *
 * 官方发布新模型而 codex.exe 内嵌快照滞后时,按官方公布参数把新条目补进目录;
 * 同时执行产品策略:被替代的旧线隐藏、无对位的退役。
 *
 * 当前策略(2026-09-23):
 *   - 补入 gpt-6-sol / gpt-6-luna(官方 2026-09-22 发布;上下文 1,050,000,
 *     默认档位 medium,档位 low→max —— 'none' 档客户端目录无先例,暂不引入)
 *   - gpt-5.6-sol / gpt-5.6-luna 被同名 6 系替代,6 系存在即隐藏
 *   - gpt-5.6-terra 无 6 系对位,直接退役
 *
 * 生效范围:official 模式补缺+校准;relay 模式只校准中转站已提供的条目(不替中转站做加法)。
 * 内嵌快照追上后(slug 原生存在):新增自然退化为参数校准;下个版本移除本表即完全回归快照。
 * 参数来源:developers.openai.com/api/docs/models/gpt-6-sol / gpt-6-luna
 */
const { mergeCustomModels } = require('./catalog-merge');

const PATCH_MODELS = [
  {
    templateSlug: 'gpt-6-astra', slug: 'gpt-6-sol', displayName: 'GPT-6-Sol',
    description: 'Built to power complex coding and agentic workflows.',
    contextWindow: 1050000, defaultEffort: 'medium',
    reasoningLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
    replaces: 'gpt-5.6-sol'
  },
  {
    templateSlug: 'gpt-6-astra', slug: 'gpt-6-luna', displayName: 'GPT-6-Luna',
    description: 'Our most efficient model for focused, high-volume tasks.',
    contextWindow: 1050000, defaultEffort: 'medium',
    reasoningLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
    replaces: 'gpt-5.6-luna'
  }
];

const RETIRED_SLUGS = ['gpt-5.6-terra'];

/**
 * 应用目录策略。
 * @param {object} catalog 已经过自定义模型合并的目录
 * @param {object} opts { addMissing:boolean } — true(官方模式):缺则补入;false(中转模式):只校准已有条目
 * @returns {object} 处理后的目录(补入/校准 + 隐藏被替代与退役条目)
 */
function applyCatalogPatch(catalog, opts = {}) {
  const addMissing = opts.addMissing !== false;
  const present = new Set(catalog.models.map(m => m.slug));
  const customs = PATCH_MODELS.filter(p => addMissing || present.has(p.slug));
  const out = customs.length ? mergeCustomModels(catalog, customs) : catalog;

  const nowPresent = new Set(out.models.map(m => m.slug));
  const hide = new Set(RETIRED_SLUGS);
  for (const p of PATCH_MODELS) {
    if (p.replaces && nowPresent.has(p.slug)) hide.add(p.replaces);
  }
  const models = out.models.filter(m => !hide.has(m.slug));
  if (models.length === 0) return out; // 补丁条目自身永不进 hide,此为防御
  return { ...out, models };
}

module.exports = { applyCatalogPatch, PATCH_MODELS, RETIRED_SLUGS };
