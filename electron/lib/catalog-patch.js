'use strict';
/**
 * catalog-patch.js — 官方目录跟进策略(v1.10.3,用户指令:配置活全部长在 RS 里)。
 *
 * 官方发布新模型而 codex.exe 内嵌快照滞后时,按官方公布参数把新条目补进目录;
 * 同时执行产品策略:被替代的旧线隐藏、无对位的退役。
 *
 * 当前策略(2026-09-24):
 *   - 补入/校准 gpt-6-sol / gpt-6-luna(官方 2026-09-22 发布;默认档位 medium;'none' 档
 *     客户端目录无先例,暂不引入;内嵌目录已收录后补入自然退化为参数校准)
 *   - 档位:low→max,sol 追加 ultra —— ultra 是客户端专属档(自动任务委派),API 文档
 *     系统性不列;sol 系历代有,luna 系历代没有,各随其脉
 *   - 上下文按官方客户端目录:软限 272K(=计费分档线,输入 >272K 整单 2x 输入/1.5x 输出),
 *     硬顶 872K;要吃满大窗口在切换面板手填顶层 model_context_window
 *   - 5.6-sol / 5.6-luna 恢复显示(2026-09-24 用户指令:6-sol 实战口碑不及 5.6-sol,
 *     官方目录亦未隐藏 5.6 系)——不再因 6 系在场而隐藏
 *   - gpt-5.6-terra 维持退役(用户指令;官方目录虽仍列出)
 *
 * 生效范围:official 模式补缺+校准;relay 模式只校准中转站已提供的条目(不替中转站做加法)。
 * 内嵌快照追上后(slug 原生存在):新增自然退化为参数校准;下个版本移除本表即完全回归快照。
 * 参数来源:2026-09-23 14:36 codex.exe 内嵌目录实测(272K/872K/medium,6-sol 含 ultra,
 * 6-luna 无 ultra)——API 文档写 1.05M 但客户端目录 872K,部署以客户端目录为准
 */
const { mergeCustomModels } = require('./catalog-merge');

const PATCH_MODELS = [
  {
    templateSlug: 'gpt-6-astra', slug: 'gpt-6-sol', displayName: 'GPT-6-Sol',
    description: 'Workhorse model for coding and everyday work.',
    contextWindow: 272000, maxContextWindow: 872000, defaultEffort: 'medium',
    reasoningLevels: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra']
  },
  {
    templateSlug: 'gpt-6-astra', slug: 'gpt-6-luna', displayName: 'GPT-6-Luna',
    description: 'Fast and affordable model for easier tasks.',
    contextWindow: 272000, maxContextWindow: 872000, defaultEffort: 'medium',
    reasoningLevels: ['low', 'medium', 'high', 'xhigh', 'max']
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
