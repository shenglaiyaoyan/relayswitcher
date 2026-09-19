'use strict';
/**
 * relay-catalog.js — 从中转站 /v1/models 清单自动生成模型目录(v1.8.0)。
 * 每个模型 ID 派生一个条目:按名字家族匹配官方模板,继承档位/Fast/提示词等
 * 全部元数据;认不出的家族用默认满血模板。生成产物走既有部署预检
 * (缺 base_instructions 绝不写进 CODEX_HOME — v1.4.6 事故防回归)。
 */

// 非对话类模型:进目录只会污染 Codex 选择器,直接排除
const EXCLUDE_RE = /embedding|whisper|tts|moderation|dall-e/i;

// 家族匹配:模型名 → 优先捐赠元数据的官方模板 slug(存在才用,否则回落默认)
const FAMILY_RULES = [
  { re: /gpt-6/i, tpl: 'gpt-6-astra' },
  { re: /gpt-5\.6/i, tpl: 'gpt-5.6-sol' },
  { re: /gpt-5\.5/i, tpl: 'gpt-5.5' },
  { re: /gpt-5\.4/i, tpl: 'gpt-5.4' },
  { re: /gpt-5|gpt-4|o3|o4|codex/i, tpl: 'gpt-5.5' }
];
const DEFAULT_TEMPLATE = 'gpt-6-astra';

function pickTemplate(slug, availableSlugs) {
  for (const r of FAMILY_RULES) {
    if (r.re.test(slug) && availableSlugs.includes(r.tpl)) return r.tpl;
  }
  return availableSlugs.includes(DEFAULT_TEMPLATE) ? DEFAULT_TEMPLATE : availableSlugs[0];
}

/**
 * @param {object} baseCatalog 官方目录(内置或提取),提供模板条目
 * @param {string[]} modelIds 中转站 /v1/models 返回的模型 ID 清单
 * @returns {object} 可直接部署的目录(仅含中转站模型)
 * @throws 清单为空 / 全部非法 / 基座目录无条目
 */
function buildRelayCatalog(baseCatalog, modelIds) {
  if (!Array.isArray(modelIds) || modelIds.length === 0) throw new Error('中转站模型清单为空,无法生成目录');
  const bySlug = new Map(baseCatalog.models.map(m => [m.slug, m]));
  const available = [...bySlug.keys()];
  if (!available.length) throw new Error('基座目录为空,无法派生中转目录');

  const out = { ...baseCatalog, models: [] };
  const seen = new Set();
  for (const id of modelIds) {
    const slug = String(id || '').trim();
    if (!slug || seen.has(slug)) continue;
    if (!/^[a-z0-9][a-z0-9._\/:-]*$/i.test(slug)) continue;   // 非法 ID
    if (EXCLUDE_RE.test(slug)) continue;                        // 非对话类
    seen.add(slug);
    const tpl = bySlug.get(pickTemplate(slug, available));
    const entry = JSON.parse(JSON.stringify(tpl));
    entry.slug = slug;
    entry.display_name = slug; // 显示中转站自己的名字,不带模板残留
    out.models.push(entry);
  }
  if (out.models.length === 0) throw new Error('中转站清单里没有可用的对话模型 ID');
  return out;
}

module.exports = { buildRelayCatalog, pickTemplate };
