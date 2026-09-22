'use strict';
/**
 * session-migrate.js — 切换清场后迁移旧 provider 的会话引用。
 *
 * 背景(2026-09-22 事故): codex 会话文件把出生时的 provider 名写进元数据,
 * 恢复对话时按名查 config;清场删掉旧区块后,旧对话串报
 * "Model provider `X` not found" 无法继续。
 *
 * 本模块把 sessions/archived_sessions 里 `"model_provider": "X"` 字段值
 * 迁移到当前 provider。**只动字段,对话正文零触碰**(正文里出现的网关
 * 域名字样不属于字段形态,不受影响);实跑前对每个被改文件留字节级备份
 * (.bak-provider-migrate,幂等不重复覆盖),替换是双向的,反向再跑即回滚。
 *
 * 元数据格式有两种: 紧凑 "model_provider":"x" 与带空格 "model_provider": "x"
 * ——desktop 与 CLI 写法不同,正则用 \s* 兼容(事故排查时踩过的盲区)。
 * 大会话文件可达数百 MB:两遍流式(先只读计数,有匹配才写出),不整读进内存。
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildPattern(fromProviders) {
  return new RegExp('("model_provider"\\s*:\\s*)"(?:' + fromProviders.map(escapeRe).join('|') + ')"', 'g');
}

function* walkJsonl(dir) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkJsonl(p);
    else if (e.isFile() && e.name.endsWith('.jsonl')) yield p;
  }
}

/** 只读流式计数,不写任何文件 */
async function countOnly(p, source) {
  const pat = new RegExp(source, 'g');
  let n = 0;
  const rl = readline.createInterface({ input: fs.createReadStream(p, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) {
    let m;
    while ((m = pat.exec(line)) !== null) n++;
    pat.lastIndex = 0;
  }
  return n;
}

/** 流式替换写出(调用方保证已有匹配且已备份);返回替换处数 */
async function rewriteFile(p, source, toProvider) {
  const pat = new RegExp(source, 'g');
  let n = 0;
  const tmp = p + '.migrating';
  const out = fs.createWriteStream(tmp);
  const rl = readline.createInterface({ input: fs.createReadStream(p, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) {
    const replaced = line.replace(pat, (m, g1) => { n++; return g1 + '"' + toProvider + '"'; });
    await new Promise(res => out.write(replaced + '\n', res));
  }
  await new Promise(res => out.end(res));
  fs.renameSync(tmp, p);
  return n;
}

/**
 * @param {object} opts
 * @param {string} opts.home CODEX_HOME
 * @param {string[]} opts.fromProviders 要迁移走的 provider 名(即被清场删除的区块名)
 * @param {string} opts.toProvider 目标 provider 名(当前切换目标)
 * @param {boolean} [opts.dryRun=false] 只统计不动手、不备份
 * @param {(info:{file:string,replacements:number})=>void} [opts.onProgress] 文件级进度回调
 * @returns {Promise<{files:number, replacements:number}>} 被改文件数与替换处数
 */
async function migrateSessionFiles({ home, fromProviders, toProvider, dryRun = false, onProgress }) {
  if (!Array.isArray(fromProviders) || !fromProviders.length || !toProvider) {
    return { files: 0, replacements: 0 };
  }
  const source = buildPattern(fromProviders).source;
  let files = 0, replacements = 0;

  for (const root of [path.join(home, 'sessions'), path.join(home, 'archived_sessions')]) {
    for (const p of walkJsonl(root)) {
      if (p.endsWith('.bak-provider-migrate') || p.endsWith('.migrating')) continue;
      let n = 0;
      try { n = await countOnly(p, source); } catch { continue; }
      if (n === 0) continue;
      if (!dryRun) {
        const bak = p + '.bak-provider-migrate';
        if (!fs.existsSync(bak)) {
          try { fs.copyFileSync(p, bak); } catch { continue; } // 备份失败放弃迁移,不动原件
        }
        n = await rewriteFile(p, source, toProvider);
      }
      files += 1; replacements += n;
      onProgress && onProgress({ file: p, replacements: n });
    }
  }
  return { files, replacements };
}

module.exports = { migrateSessionFiles };
