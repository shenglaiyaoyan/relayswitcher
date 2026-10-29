/** 切换流程五步：由主进程 rs:switch-step 事件名推导各步状态。 */
export const STAGES = [
  { key: 'backup', label: '备份当前配置', match: name => name === '备份当前配置' },
  { key: 'auth', label: '写入登录态', match: name => name.startsWith('写入登录态') },
  { key: 'relay', label: '流量指向中转站', match: name => name === '流量指向中转站' },
  { key: 'catalog', label: '部署模型目录', match: name => name === '目录生成' },
  { key: 'verify', label: '校验', match: name => name === '校验完成' }
];

/** 返回五步状态：idle | active | done | warn（目录回落等非致命失败）| error */
export const stageStates = (log, switching) => {
  const states = STAGES.map(stage => {
    const hits = log.filter(entry => entry && stage.match(entry.name || ''));
    if (!hits.length) return 'idle';
    if (hits.some(entry => entry.ok === false)) return stage.key === 'catalog' ? 'warn' : 'error';
    return 'done';
  });
  if (switching && !states.includes('error')) {
    const next = STAGES.findIndex((_, i) => states[i] === 'idle' && i !== 3);
    if (next >= 0) states[next] = 'active';
  }
  return states;
};
