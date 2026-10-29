const ALL = ['low', 'medium', 'high', 'xhigh', 'max'];
const tpl = (id, name, patterns, context, output, efforts, effort, caps, input) => ({
  id, name, builtin: true, patterns, limit: { context, output },
  reasoning: true, attachment: caps.attachment ?? true, tool_call: true, temperature: caps.temperature ?? true,
  modalities: { input, output: ['text'] }, efforts, effort
});

// models.dev 2026-10 核对；Gemini 输出按用户口径 128000。全部可在设置页修改。
export const BUILTIN_TEMPLATES = [
  tpl('builtin-claude', 'Claude', ['claude-*'], 1000000, 128000, ALL, 'high', { temperature: false }, ['text', 'image', 'pdf']),
  tpl('builtin-gpt', 'GPT', ['gpt-*'], 872000, 128000, ALL, 'high', { temperature: false }, ['text', 'image', 'pdf']),
  tpl('builtin-gemini', 'Gemini', ['gemini-*'], 1000000, 128000, ['low', 'medium', 'high'], 'high', {}, ['text', 'image', 'video', 'audio', 'pdf']),
  tpl('builtin-deepseek', 'DeepSeek', ['deepseek-*'], 1048576, 393216, ['low', 'high', 'max'], 'high', { attachment: false }, ['text']),
  tpl('builtin-glm', 'GLM', ['glm-*'], 1000000, 131072, ['low', 'high', 'max'], 'high', { attachment: false }, ['text']),
  tpl('builtin-kimi', 'Kimi', ['kimi-*'], 1048576, 1048576, ['low', 'high', 'max'], 'high', { temperature: false }, ['text', 'image', 'video']),
  tpl('builtin-qwen', 'Qwen', ['qwen*'], 1000000, 131072, ['low', 'medium', 'xhigh'], 'medium', {}, ['text', 'image', 'video', 'pdf']),
  tpl('builtin-grok', 'Grok', ['grok-*'], 500000, 500000, ['low', 'medium', 'high', 'xhigh'], 'high', {}, ['text', 'image', 'pdf']),
  tpl('builtin-minimax', 'MiniMax', ['minimax-*'], 1000000, 524288, [], '', {}, ['text', 'image', 'video']),
  tpl('builtin-mistral', 'Mistral', ['mistral-*'], 1048576, 262144, ['none', 'high'], 'high', {}, ['text', 'image', 'pdf']),
  tpl('builtin-mimo', 'MiMo', ['mimo-*'], 1048576, 131072, [], '', {}, ['text', 'image', 'audio', 'video'])
];

export const fmtTokens = n => {
  if (!n) return '—';
  if (n >= 1000000) return +(n / 1000000).toFixed(2) + 'M';
  return n >= 1000 ? Math.round(n / 1000) + 'K' : String(n);
};

const clone = value => JSON.parse(JSON.stringify(value));
const globToRegex = pattern => new RegExp('^' + pattern.trim().toLowerCase()
  .replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');

const matches = (template, id) => {
  const full = id.toLowerCase();
  const tail = full.slice(full.lastIndexOf('/') + 1);
  return (template.patterns || []).filter(p => p && p.trim())
    .some(p => { const re = globToRegex(p); return re.test(full) || re.test(tail); });
};

export const matchTemplate = (templates, id) => {
  if (!id || !id.trim()) return null;
  const list = templates || [];
  return list.find(t => !t.builtin && matches(t, id)) || list.find(t => t.builtin && matches(t, id)) || null;
};

const pickValues = t => clone({
  limit: t.limit || { context: 0, output: 0 },
  reasoning: !!t.reasoning, attachment: !!t.attachment, tool_call: !!t.tool_call, temperature: !!t.temperature,
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
  for (const k of ['reasoning', 'attachment', 'tool_call', 'temperature']) if (!!model[k] !== v[k]) out.push(k);
  if (!sameSet(model.modalities?.input, v.modalities.input)) out.push('modalities.input');
  if (!sameSet(model.modalities?.output, v.modalities.output)) out.push('modalities.output');
  if (!sameSet(model.efforts, v.efforts)) out.push('efforts');
  if ((model.effort || '') !== v.effort) out.push('effort');
  return out;
};

export const resolveTemplates = stored => Array.isArray(stored) ? stored : clone(BUILTIN_TEMPLATES);

export const resetBuiltins = list => [
  ...clone(BUILTIN_TEMPLATES),
  ...(list || []).filter(t => !t.builtin)
];

export const templateFromModel = (model, id) => ({
  id, name: model.name || model.id || '新模板', builtin: false,
  patterns: model.id ? [model.id] : [], ...pickValues(model)
});

export const blankTemplate = id => ({
  id, name: '新模板', builtin: false, patterns: [],
  ...pickValues({ tool_call: true, modalities: { input: ['text'], output: ['text'] } })
});
