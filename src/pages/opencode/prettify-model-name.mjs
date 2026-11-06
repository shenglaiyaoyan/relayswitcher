/** 把模型 ID 转成显示名：claude-opus-5-5 → Claude Opus 5.5, gpt-6-astra → GPT 6 Astra */
export function prettifyModelName(id) {
  if (!id || typeof id !== 'string') return '';
  const clean = id.trim();
  if (!clean) return '';
  // 1. 取最后一个 / 之后
  const afterSlash = clean.includes('/') ? clean.slice(clean.lastIndexOf('/') + 1) : clean;
  // 2. 按 - _ 空格切段，丢掉 8 位日期
  const segments = afterSlash.split(/[-_\s]+/).filter(s => s && !/^\d{8}$/.test(s));
  if (!segments.length) return '';
  // 3. 品牌粘连版本时拆开：qwen3.8 → qwen 3.8
  const split = [];
  for (const s of segments) {
    const m = /^([a-z]{3,})(\d+(?:\.\d+)?)$/i.exec(s);
    if (m) { split.push(m[1], m[2]); } else split.push(s);
  }
  // 4. 相邻 1-2 位整数合并为点分版本
  const merged = [];
  for (let i = 0; i < split.length; i++) {
    const curr = split[i], next = split[i + 1];
    if (/^\d{1,2}$/.test(curr) && /^\d{1,2}$/.test(next)) {
      merged.push(curr + '.' + next);
      i++;
    } else merged.push(curr);
  }
  // 5. 格式化各段
  const BRANDS = { gpt: 'GPT', claude: 'Claude', gemini: 'Gemini', deepseek: 'DeepSeek', glm: 'GLM',
    kimi: 'Kimi', qwen: 'Qwen', grok: 'Grok', minimax: 'MiniMax', mistral: 'Mistral', mimo: 'MiMo',
    llama: 'Llama', gemma: 'Gemma', codex: 'Codex', oss: 'OSS' };
  return merged.map(s => {
    const lower = s.toLowerCase();
    if (BRANDS[lower]) return BRANDS[lower];
    if (/^\d+(\.\d+)?$/.test(s)) return s;
    if (/^[a-z]{1,2}\d/.test(lower)) return s.toUpperCase();
    if (/^\d+[bkm]$/i.test(s)) return s.toUpperCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }).join(' ');
}
