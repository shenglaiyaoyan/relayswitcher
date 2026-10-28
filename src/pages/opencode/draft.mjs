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

export const providerFetchTarget = ({ baseUrl, apiKey }) => ({
  baseUrl: baseUrl.trim(), apiKey: apiKey.trim()
});
