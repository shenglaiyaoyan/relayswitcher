import { prettifyModelName } from './prettify-model-name.mjs';

export const newModel = (id = '') => ({
  id, name: prettifyModelName(id) || id, limit: { context: 0, output: 0 },
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

/** 整理显示名：只改名称为空或等于 ID 的模型；用户自定义名称不动。 */
export const tidyModelNames = models => {
  let count = 0;
  const result = models.map(m => {
    if (!m.id || (m.name && m.name !== m.id && m.name !== prettifyModelName(m.id))) return m;
    const name = prettifyModelName(m.id) || m.id;
    if (name === m.name) return m;
    count++;
    return { ...m, name };
  });
  return { models: result, count };
};

/** 改模型 ID 时自动更新名称：空、等于旧 ID 或等于旧美化名时跟着变；用户改过的不动。 */
export const syncModelNamePatch = (model, patch) => {
  if (patch.id === undefined) return patch;
  const oldId = model.id || '', newId = patch.id || '';
  const oldName = model.name || '', oldPretty = prettifyModelName(oldId);
  const shouldSync = !oldName || oldName === oldId || oldName === oldPretty;
  if (!shouldSync || patch.name !== undefined) return patch;
  const newName = prettifyModelName(newId);
  return { ...patch, name: newName };
};
