'use strict';
/**
 * rival-guard.js — 竞品工具进程识别(FEAT-20260905-002)。
 * CockpitTools / cc-switch / CLIProxyAPI 这类工具会在运行时回写 Codex 配置,
 * 与 RelaySwitcher 的切换互为覆盖("配置莫名回退"的元凶之一)。
 * 切换前扫描进程发现即警告;纯函数,输入 tasklist CSV 输出。
 */
const RIVAL_PATTERNS = [
  { re: /cockpit/i, name: 'CockpitTools' },
  { re: /cc-?switch/i, name: 'cc-switch' },
  { re: /cli.?proxy/i, name: 'CLIProxyAPI' }
];

function findRivalProcesses(tasklistCsv) {
  const seen = new Map();
  for (const line of String(tasklistCsv || '').split('\n')) {
    const m = line.match(/^"([^"]+)","(\d+)"/);
    if (!m) continue;
    const image = m[1];
    for (const p of RIVAL_PATTERNS) {
      if (p.re.test(image)) {
        if (!seen.has(p.name)) seen.set(p.name, { name: p.name, image, pids: [] });
        seen.get(p.name).pids.push(m[2]);
      }
    }
  }
  return [...seen.values()];
}

module.exports = { findRivalProcesses, RIVAL_PATTERNS };
