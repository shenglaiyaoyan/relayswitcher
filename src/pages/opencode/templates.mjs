const ALL = ['low', 'medium', 'high', 'xhigh', 'max'];

export const TEMPLATE_GROUPS = [
  'Claude', 'GPT', 'Gemini', 'DeepSeek', 'GLM', 'Kimi', 'Qwen', 'Grok', 'MiniMax', 'Mistral', 'MiMo'
];

export const templateGroup = t => (!t || !t.builtin ? '自定义' : (t.group || '其它'));

// 推理/温度三态:'unset' 不写入配置(交给 OpenCode 默认),'yes'/'no' 写入声明
const tpl = (group, id, name, patterns, context, output, efforts, effort, caps, input) => ({
  id, name, group, builtin: true, ...(caps.fallback ? { fallback: true } : {}),
  patterns, limit: { context, output },
  reasoning: caps.reasoning ?? 'yes', tool_call: caps.tool_call ?? true, temperature: caps.temperature ?? 'unset',
  modalities: { input, output: ['text'] }, efforts, effort
});

// models.dev 2026-11 核对 + 用户实测口径（Gemini 4 Hydrogen 264K / 其余 128K，GPT 500K，GLM 128K）。
// 每厂子系列按差异拆分，末尾保留 1 个通用兜底；原 11 个 builtin-* ID 保留兼容。全部可在设置页修改。
export const BUILTIN_TEMPLATES = [
  // Claude（3）
  tpl('Claude', 'builtin-claude', 'Claude 5 / 5.5 / 4.7+', ['claude-opus-5*', 'claude-sonnet-5*', 'claude-haiku-5*', 'claude-fable*', 'claude-5*', 'claude-opus-4.8*', 'claude-opus-4.7*'], 1000000, 128000, ALL, 'high', { temperature: 'no' }, ['text', 'image', 'pdf']),
  tpl('Claude', 'builtin-claude-4-6', 'Claude 4.6', ['claude-opus-4.6*', 'claude-sonnet-4.6*', 'claude-haiku-4.6*', 'claude-4.6*'], 1000000, 128000, ['low', 'medium', 'high', 'max'], 'high', {}, ['text', 'image', 'pdf']),
  tpl('Claude', 'builtin-claude-fallback', 'Claude 4.5 及旧版', ['claude-*'], 200000, 64000, ['low', 'medium', 'high'], 'high', { fallback: true }, ['text', 'image', 'pdf']),

  // GPT（4）
  tpl('GPT', 'builtin-gpt', 'GPT 6.2 / 6.1 Sol / 6 Astra', ['gpt-6.2-*', 'gpt-6.1-sol*', 'gpt-6-astra*'], 500000, 128000, ALL, 'high', { temperature: 'no' }, ['text', 'image', 'pdf']),
  tpl('GPT', 'builtin-gpt-6-six', 'GPT 6.1 Terra / 6 Sol·Luna / 5.6', ['gpt-6.1-terra*', 'gpt-6-sol*', 'gpt-6-luna*', 'gpt-5.6*', 'gpt-daybreak*'], 500000, 128000, ['none', ...ALL], 'high', {}, ['text', 'image', 'pdf']),
  tpl('GPT', 'builtin-gpt-5-4-mini', 'GPT 5.4 Mini / Nano', ['gpt-5.4-mini*', 'gpt-5.4-nano*'], 400000, 128000, ['none', 'low', 'medium', 'high', 'xhigh'], 'medium', {}, ['text', 'image']),
  tpl('GPT', 'builtin-gpt-fallback', 'GPT 5.5 / 通用', ['gpt-*'], 500000, 128000, ['none', 'low', 'medium', 'high', 'xhigh'], 'high', { temperature: 'no', fallback: true }, ['text', 'image', 'pdf']),

  // Gemini（5）
  tpl('Gemini', 'builtin-gemini-4-hydrogen', 'Gemini 4 Hydrogen', ['gemini-4-hydrogen*'], 1000000, 264000, ['low', 'medium', 'high', 'xhigh'], 'xhigh', {}, ['text', 'image', 'video', 'audio', 'pdf']),
  tpl('Gemini', 'builtin-gemini-4-neon', 'Gemini 4 Neon', ['gemini-4-neon*'], 1000000, 128000, ['low', 'medium', 'high', 'xhigh'], 'high', {}, ['text', 'image', 'video', 'audio', 'pdf']),
  tpl('Gemini', 'builtin-gemini-4-argon', 'Gemini 4 Argon / Carbon', ['gemini-4-argon*', 'gemini-4-carbon*'], 1000000, 128000, ['low', 'medium', 'high'], 'high', {}, ['text', 'image', 'video', 'audio', 'pdf']),
  tpl('Gemini', 'builtin-gemini-3-5-flash', 'Gemini 3.5 / 3.6 Flash & Lite', ['gemini-3.5-flash*', 'gemini-3.6-flash*', 'gemini-*flash-lite*'], 1000000, 128000, ['minimal', 'low', 'medium', 'high'], 'high', {}, ['text', 'image', 'video', 'audio', 'pdf']),
  tpl('Gemini', 'builtin-gemini', 'Gemini 3.7 / 3.8 & 通用', ['gemini-*'], 1000000, 128000, ['low', 'medium', 'high'], 'high', { fallback: true }, ['text', 'image', 'video', 'audio', 'pdf']),

  // DeepSeek（3）
  tpl('DeepSeek', 'builtin-deepseek', 'DeepSeek V4.1 / Flash', ['deepseek-v4.1', 'deepseek-v4.1-*', 'deepseek-v4.1:*', 'deepseek-flash*'], 1048576, 393216, ['low', 'high', 'max'], 'high', {}, ['text', 'image']),
  tpl('DeepSeek', 'builtin-deepseek-v4', 'DeepSeek V4（纯文本）', ['deepseek-v4*', 'deepseek-pro*'], 1048576, 393216, ['low', 'high', 'max'], 'high', {}, ['text']),
  tpl('DeepSeek', 'builtin-deepseek-fallback', 'DeepSeek V3 / R1', ['deepseek-*'], 163840, 65536, [], '', { fallback: true }, ['text']),

  // GLM（6）
  tpl('GLM', 'builtin-glm-5-4', 'GLM 5.4', ['glm-5.4*'], 1000000, 128000, ['low', 'high', 'max'], 'high', {}, ['text', 'image', 'pdf']),
  tpl('GLM', 'builtin-glm-5-3-flash', 'GLM 5.3 Flash', ['glm-5.3-flash*'], 1000000, 128000, ['low', 'high', 'max'], 'high', {}, ['text', 'image', 'video', 'pdf']),
  tpl('GLM', 'builtin-glm', 'GLM 5.3', ['glm-5.3', 'glm-5.3-*'], 1000000, 128000, ['low', 'high', 'max'], 'high', {}, ['text']),
  tpl('GLM', 'builtin-glm-5-2', 'GLM 5.2', ['glm-5.2*'], 1000000, 128000, ['high', 'max'], 'high', {}, ['text']),
  tpl('GLM', 'builtin-glm-vision', 'GLM 5V / 4.6V / 4.5V', ['glm-5v*', 'glm-4.6v*', 'glm-4.5v*', 'glm-4v*'], 200000, 128000, [], '', {}, ['text', 'image', 'video']),
  tpl('GLM', 'builtin-glm-fallback', 'GLM 5 / 4.x', ['glm-*'], 200000, 128000, [], '', { fallback: true }, ['text']),

  // Kimi（2）
  tpl('Kimi', 'builtin-kimi', 'Kimi K3 / K3.1', ['kimi-k3*', 'kimi-3*'], 1048576, 1048576, ['low', 'high', 'max'], 'high', { temperature: 'no' }, ['text', 'image', 'video']),
  tpl('Kimi', 'builtin-kimi-fallback', 'Kimi K2.6 / K2.7', ['kimi-*'], 262144, 262144, [], '', { temperature: 'no', fallback: true }, ['text', 'image', 'video']),

  // Qwen（4）
  tpl('Qwen', 'builtin-qwen-4-max', 'Qwen 4 Max', ['qwen4*', 'qwen-4*'], 1000000, 262144, ['low', 'high', 'xhigh'], 'xhigh', {}, ['text', 'image', 'video', 'pdf']),
  tpl('Qwen', 'builtin-qwen-3-8-omni', 'Qwen 3.8 Omni', ['qwen3.8-omni*', 'qwen-3.8-omni*'], 1000000, 131072, ['none', 'low', 'medium', 'xhigh'], 'medium', {}, ['text', 'image', 'audio', 'video']),
  tpl('Qwen', 'builtin-qwen', 'Qwen 3.8 Max / Flash', ['qwen3.8-*', 'qwen-3.8-*'], 1000000, 131072, ['low', 'medium', 'xhigh'], 'medium', {}, ['text', 'image', 'video', 'pdf']),
  tpl('Qwen', 'builtin-qwen-fallback', 'Qwen 3.7 及旧版', ['qwen*'], 1000000, 131072, [], '', { fallback: true }, ['text', 'image', 'video']),

  // Grok（2）
  tpl('Grok', 'builtin-grok', 'Grok 4.5 / 4.6 / 4.7', ['grok-4.7*', 'grok-4.6*', 'grok-4.5*'], 500000, 500000, ['low', 'medium', 'high', 'xhigh'], 'high', {}, ['text', 'image', 'pdf']),
  tpl('Grok', 'builtin-grok-fallback', 'Grok 4.3 / 4.20', ['grok-*'], 1000000, 30000, ['low', 'medium', 'high', 'xhigh'], 'high', { fallback: true }, ['text', 'image', 'pdf']),

  // MiniMax（3）
  tpl('MiniMax', 'builtin-minimax-m3-1', 'MiniMax M3.1 Flash', ['minimax-m3.1*'], 1000000, 524288, ALL, 'high', {}, ['text', 'image', 'video']),
  tpl('MiniMax', 'builtin-minimax', 'MiniMax M3', ['minimax-m3*'], 1000000, 524288, [], '', {}, ['text', 'image', 'video']),
  tpl('MiniMax', 'builtin-minimax-fallback', 'MiniMax M2.x', ['minimax-*'], 204800, 131072, [], '', { fallback: true }, ['text']),

  // Mistral（3）
  tpl('Mistral', 'builtin-mistral-large', 'Mistral Large 4', ['mistral-large*'], 1048576, 262144, ['low', 'medium', 'high'], 'high', {}, ['text', 'image', 'pdf']),
  tpl('Mistral', 'builtin-mistral-code', 'Codestral / Devstral', ['codestral*', 'devstral*'], 262144, 262144, [], '', { reasoning: 'no' }, ['text']),
  tpl('Mistral', 'builtin-mistral', 'Mistral Medium / Small', ['mistral-*', 'ministral-*'], 262144, 262144, ['none', 'high'], 'high', { fallback: true }, ['text', 'image', 'pdf']),

  // MiMo（2）
  tpl('MiMo', 'builtin-mimo-pro', 'MiMo v2.5 / v2 Pro', ['mimo-v2.5-pro*', 'mimo-v2-pro*'], 1048576, 131072, [], '', {}, ['text']),
  tpl('MiMo', 'builtin-mimo', 'MiMo v2.6 / 多模态', ['mimo-*'], 1048576, 131072, [], '', { fallback: true }, ['text', 'image', 'audio', 'video'])
];

export const fmtTokens = n => {
  if (!n) return '—';
  if (n >= 1000000) return +(n / 1000000).toFixed(2) + 'M';
  return n >= 1000 ? Math.round(n / 1000) + 'K' : String(n);
};

const clone = value => JSON.parse(JSON.stringify(value));

// 版本号里的 . 与 - 互通（如 deepseek-v4.1 命中 deepseek-v4-1-flash，claude-*-4.6* 命中 claude-sonnet-4-6）
const normSep = s => s.trim().toLowerCase().replace(/\./g, '-');
const globToRegex = pattern => new RegExp('^' + normSep(pattern)
  .replace(/[+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');

const matchesCandidate = (template, candidate) => (template.patterns || []).filter(p => p && p.trim())
  .some(p => globToRegex(p).test(candidate));

export const matchTemplate = (templates, id) => {
  if (!id || !id.trim()) return null;
  const list = templates || [];
  const customs = list.filter(t => !t.builtin);
  const builtins = list.filter(t => t.builtin);
  const raw = id.trim();
  const full = normSep(raw);
  const tailRaw = raw.slice(raw.lastIndexOf('/') + 1);
  const tail = normSep(tailRaw);

  // 第一段：完整 ID 或 / 后尾段从头匹配（自定义优先，同类按列表顺序）
  const pass1 = pool => pool.find(t => matchesCandidate(t, full) || matchesCandidate(t, tail)) || null;
  const direct = pass1(customs) || pass1(builtins);
  if (direct) return direct;

  // 第二段：中转自定义前缀兜底（如 person-deepseek-v4-1-flash-261017、zai-glm-5-3-flash）。
  // 从左到右沿分隔符截取后缀，仅匹配非 fallback 的具体模板，避免 my-gpt-x 误中泛化兜底。
  const specificCustoms = customs.filter(t => !t.fallback);
  const specificBuiltins = builtins.filter(t => !t.fallback);
  const sepRe = /[-_:]/g;
  let m;
  while ((m = sepRe.exec(tailRaw)) !== null) {
    const sub = normSep(tailRaw.slice(m.index + 1));
    if (!sub) continue;
    const hit = specificCustoms.find(t => matchesCandidate(t, sub))
      || specificBuiltins.find(t => matchesCandidate(t, sub));
    if (hit) return hit;
  }
  return null;
};

/** 三态取值;旧版本存的布尔值:true → 支持,false/缺省 → 未设置(旧 false 只是默认值,不代表不支持) */
export const capState = v => (v === 'unset' || v === 'yes' || v === 'no' ? v : v === true ? 'yes' : 'unset');

/** 旧模板(布尔 + attachment)迁移为三态;内置模板补齐 group/fallback,温度按内置定义迁移,其余字段保留 */
export const migrateTemplate = t => {
  if (!t || typeof t !== 'object') return t;
  const { attachment: _attachment, ...rest } = t;
  const builtin = t.builtin ? BUILTIN_TEMPLATES.find(b => b.id === t.id) : null;
  return {
    ...rest,
    ...(builtin ? { group: builtin.group, ...(builtin.fallback ? { fallback: true } : {}) } : {}),
    reasoning: capState(t.reasoning),
    temperature: typeof t.temperature === 'boolean' && builtin ? builtin.temperature : capState(t.temperature)
  };
};

// 旧版未拆分时这 8 个内置 ID 用的是整厂通配；升级时若用户没改过 patterns，自动收窄为新子系列规则，免得吞掉同厂其它子系列
const LEGACY_CATCHALL = {
  'builtin-claude': 'claude-*',
  'builtin-gpt': 'gpt-*',
  'builtin-deepseek': 'deepseek-*',
  'builtin-glm': 'glm-*',
  'builtin-kimi': 'kimi-*',
  'builtin-qwen': 'qwen*',
  'builtin-grok': 'grok-*',
  'builtin-minimax': 'minimax-*'
};
const LEGACY_11_IDS = new Set([
  'builtin-claude', 'builtin-gpt', 'builtin-gemini', 'builtin-deepseek', 'builtin-glm',
  'builtin-kimi', 'builtin-qwen', 'builtin-grok', 'builtin-minimax', 'builtin-mistral', 'builtin-mimo'
]);

const pickValues = t => clone({
  limit: t.limit || { context: 0, output: 0 },
  reasoning: capState(t.reasoning), tool_call: !!t.tool_call, temperature: capState(t.temperature),
  modalities: t.modalities || { input: ['text'], output: ['text'] },
  efforts: t.efforts || [], effort: t.effort || ''
});

export const applyTemplate = (model, template, now = Date.now()) => {
  const values = pickValues(template);
  return { ...model, ...clone(values), baseEffort: '',
    template: { id: template.id, name: template.name, appliedAt: now, values } };
};

const sameSet = (a = [], b = []) => a.length === b.length && a.every(x => b.includes(x));

export const templateDiff = model => {
  const v = model?.template?.values;
  if (!v) return [];
  const out = [];
  if ((model.limit?.context || 0) !== (v.limit.context || 0)) out.push('limit.context');
  if ((model.limit?.output || 0) !== (v.limit.output || 0)) out.push('limit.output');
  if (!!model.tool_call !== !!v.tool_call) out.push('tool_call');
  // 旧版 RS 存的快照是布尔值，而它从不把推理/温度写进配置，两者无从对应：旧快照不比较这两项
  for (const k of ['reasoning', 'temperature']) {
    if (typeof v[k] === 'boolean') continue;
    if (capState(model[k]) !== capState(v[k])) out.push(k);
  }
  if (!sameSet(model.modalities?.input, v.modalities.input)) out.push('modalities.input');
  if (!sameSet(model.modalities?.output, v.modalities.output)) out.push('modalities.output');
  if (!sameSet(model.efforts, v.efforts)) out.push('efforts');
  if ((model.effort || '') !== v.effort) out.push('effort');
  return out;
};

export const resolveTemplates = stored => {
  if (!Array.isArray(stored)) return clone(BUILTIN_TEMPLATES);
  const migrated = stored.map(migrateTemplate);
  const customs = migrated.filter(t => !t.builtin);
  const storedBuiltins = new Map(migrated.filter(t => t.builtin).map(t => [t.id, t]));
  const preSplit = [...storedBuiltins.keys()].every(id => LEGACY_11_IDS.has(id));
  const builtins = BUILTIN_TEMPLATES.map(b => {
    const s = storedBuiltins.get(b.id);
    if (!s) return clone(b);
    const oldCatchall = LEGACY_CATCHALL[b.id];
    const unmodifiedCatchall = preSplit && oldCatchall && Array.isArray(s.patterns)
      && s.patterns.length === 1 && s.patterns[0].trim().toLowerCase() === oldCatchall;
    return unmodifiedCatchall ? { ...s, name: b.name, patterns: [...b.patterns] } : s;
  });
  return [...customs, ...builtins];
};

export const resetBuiltins = list => [
  ...(list || []).filter(t => !t.builtin).map(migrateTemplate),
  ...clone(BUILTIN_TEMPLATES)
];

export const templateFromModel = (model, id) => ({
  id, name: model.name || model.id || '新模板', builtin: false,
  patterns: model.id ? [model.id] : [], ...pickValues(model)
});

export const blankTemplate = id => ({
  id, name: '新模板', builtin: false, patterns: [],
  ...pickValues({ tool_call: true, modalities: { input: ['text'], output: ['text'] } })
});
