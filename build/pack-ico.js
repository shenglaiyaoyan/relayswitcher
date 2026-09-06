'use strict';
/** 把 build/icon-*.png 打包成 PNG 内嵌式 .ico(Vista+ 标准) */
const fs = require('fs');
const path = require('path');

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const dir = path.join(__dirname);
const pngs = SIZES.map(s => fs.readFileSync(path.join(dir, `icon-${s}.png`)));

// 校验 PNG 是 RGBA(color type 6),否则圆角外的透明会丢失
for (let i = 0; i < SIZES.length; i++) {
  if (!(pngs[i][0] === 0x89 && pngs[i][25] === 6)) {
    throw new Error(`icon-${SIZES[i]}.png 不是 RGBA PNG (colortype=${pngs[i][25]})`);
  }
}

const count = pngs.length;
let offset = 6 + 16 * count;
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(count, 4);

const entries = SIZES.map((s, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s >= 256 ? 0 : s, 0);
  e.writeUInt8(s >= 256 ? 0 : s, 1);
  e.writeUInt8(0, 2); e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pngs[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  return e;
});

const ico = Buffer.concat([header, ...entries, ...pngs]);
fs.writeFileSync(path.join(dir, 'icon.ico'), ico);
console.log('icon.ico written:', ico.length, 'bytes,', count, 'entries');
