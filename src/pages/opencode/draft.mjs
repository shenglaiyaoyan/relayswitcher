export const newModel = (id = '') => ({
  id, name: id, limit: { context: 0, output: 0 },
  reasoning: false, attachment: false, tool_call: true, temperature: false,
  modalities: { input: ['text'], output: ['text'] },
  efforts: [], effort: '', options: {}
});

export const newProvider = () => ({
  id: '', name: '', protocol: 'chat', baseUrl: '', apiKey: '', models: [], defaultModel: ''
});

export const updateModel = (provider, index, patch) => ({
  ...provider,
  models: provider.models.map((model, i) => i === index ? { ...model, ...patch } : model)
});

export const addEffort = (model, raw) => {
  const value = raw.trim();
  if (!value || model.efforts.includes(value)) return model;
  return { ...model, efforts: [...model.efforts, value], effort: value };
};

/** 保存前修正默认模型：Provider ID 改名时换前缀；指向的模型已不存在时清空。 */
export const normalizeDefaultModel = provider => {
  const value = provider.defaultModel || '';
  if (!value) return { ...provider, defaultModel: '' };
  const ids = new Set((provider.models || []).map(m => m.id).filter(Boolean));
  const prefix = provider.id + '/';
  if (value.startsWith(prefix) && ids.has(value.slice(prefix.length))) return provider;
  const slash = value.indexOf('/');
  const modelId = slash >= 0 ? value.slice(slash + 1) : value;
  return { ...provider, defaultModel: ids.has(modelId) && provider.id ? prefix + modelId : '' };
};

/** 模型 ID 改名时，若它是默认模型则同步更新。 */
export const renameModelDefault = (provider, oldId, newId) => {
  if (!oldId || oldId === newId || provider.defaultModel !== `${provider.id}/${oldId}`) return provider;
  return { ...provider, defaultModel: newId ? `${provider.id}/${newId}` : '' };
};

export const providerFetchTarget = ({ baseUrl, apiKey }) => ({
  baseUrl: baseUrl.trim(), apiKey: apiKey.trim()
});
