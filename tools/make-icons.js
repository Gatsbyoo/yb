/* 零依赖生成 PWA 图标
   机器上没有 sharp / canvas / PIL，用 Node 内置 zlib 直接编码 PNG。
   图形：暖色圆角底 + 2x2 白色格子（读作「一堆小工具」）
   用法：node tools/make-icons.js
*/
'use strict';

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

/* ---------- PNG 编码 ---------- */

const CRC_TABLE = (function () {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------- 几何 ---------- */

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function inRoundRect(x, y, r) { return inRoundRectBox(x, y, 0, 0, 1, 1, r); }

function inRoundRectBox(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = clamp(x, x0 + r, x1 - r);
  const cy = clamp(y, y0 + r, y1 - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r + 1e-12;
}

/* ---------- 图形 ---------- */

const BG_TOP = [212, 110, 76];
const BG_BOT = [176, 74, 46];
const TILE = [255, 253, 248];

/* 2x2 格子：内容占 0.20 ~ 0.80 */
const T1 = [0.200, 0.460];
const T2 = [0.540, 0.800];
const TR = 0.056;

function sample(u, v, opts) {
  if (opts.radius > 0 && !inRoundRect(u, v, opts.radius)) return [0, 0, 0, 0];

  let cr = lerp(BG_TOP[0], BG_BOT[0], v);
  let cg = lerp(BG_TOP[1], BG_BOT[1], v);
  let cb = lerp(BG_TOP[2], BG_BOT[2], v);

  /* 内容区按 contentScale 缩放，给 maskable 留安全区 */
  const k = opts.contentScale;
  const x = 0.5 + (u - 0.5) / k;
  const y = 0.5 + (v - 0.5) / k;

  const inTile =
    inRoundRectBox(x, y, T1[0], T1[0], T1[1], T1[1], TR) ||
    inRoundRectBox(x, y, T2[0], T1[0], T2[1], T1[1], TR) ||
    inRoundRectBox(x, y, T1[0], T2[0], T1[1], T2[1], TR) ||
    inRoundRectBox(x, y, T2[0], T2[0], T2[1], T2[1], TR);

  if (inTile) {
    cr = TILE[0]; cg = TILE[1]; cb = TILE[2];
  }

  return [cr, cg, cb, 1];
}

/* ---------- 渲染 ---------- */

function render(size, opts) {
  const SS = 4;
  const buf = Buffer.alloc(size * size * 4);
  const inv = 1 / (SS * SS);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let ar = 0, ag = 0, ab = 0, aa = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (px + (sx + 0.5) / SS) / size;
          const v = (py + (sy + 0.5) / SS) / size;
          const c = sample(u, v, opts);
          const a = c[3];
          ar += c[0] * a;
          ag += c[1] * a;
          ab += c[2] * a;
          aa += a;
        }
      }
      const i = (py * size + px) * 4;
      if (aa > 0) {
        buf[i] = Math.round(clamp(ar / aa, 0, 255));
        buf[i + 1] = Math.round(clamp(ag / aa, 0, 255));
        buf[i + 2] = Math.round(clamp(ab / aa, 0, 255));
        buf[i + 3] = Math.round(clamp(aa * inv * 255, 0, 255));
      }
    }
  }
  return encodePNG(size, size, buf);
}

/* ---------- 输出 ---------- */

const outDir = path.join(__dirname, '..', 'icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const jobs = [
  { file: 'icon-192.png', size: 192, opts: { radius: 0.22, contentScale: 1 } },
  { file: 'icon-512.png', size: 512, opts: { radius: 0.22, contentScale: 1 } },
  { file: 'icon-maskable-512.png', size: 512, opts: { radius: 0, contentScale: 0.76 } },
  { file: 'apple-touch-icon.png', size: 180, opts: { radius: 0, contentScale: 0.9 } }
];

jobs.forEach((j) => {
  const png = render(j.size, j.opts);
  fs.writeFileSync(path.join(outDir, j.file), png);
  console.log('✓ ' + j.file + '  ' + j.size + 'x' + j.size + '  ' + (png.length / 1024).toFixed(1) + ' KB');
});

console.log('图标生成完成 → ' + outDir);
