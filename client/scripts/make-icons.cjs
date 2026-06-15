// Single source -> both brand assets, kept in sync:
//   assets/icon_256.png  (in-app sidebar logo, Sidebar.tsx)
//   assets/icon.ico      (exe / window icon, package.json + main.cjs)
// Pads/centers the source onto a transparent square canvas >= 256px.
// Usage: node scripts/make-icons.cjs <source.png>
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const src = process.argv[2];
if (!src) { console.error('usage: node scripts/make-icons.cjs <source.png>'); process.exit(1); }
const assetsDir = path.join(__dirname, '..', 'assets');
const outPng = path.join(assetsDir, 'icon_256.png');
const outIco = path.join(assetsDir, 'icon.ico');

const buf = fs.readFileSync(src);
if (buf.readUInt32BE(0) !== 0x89504e47) { console.error('NOT_PNG'); process.exit(1); }

// --- parse chunks ---
let off = 8;
let ihdr = null;
const idat = [];
let plte = null, trns = null;
while (off < buf.length) {
  const len = buf.readUInt32BE(off);
  const type = buf.toString('ascii', off + 4, off + 8);
  const data = buf.subarray(off + 8, off + 8 + len);
  if (type === 'IHDR') ihdr = data;
  else if (type === 'IDAT') idat.push(data);
  else if (type === 'PLTE') plte = data;
  else if (type === 'tRNS') trns = data;
  else if (type === 'IEND') break;
  off += 12 + len;
}
const W = ihdr.readUInt32BE(0), H = ihdr.readUInt32BE(4);
const bitDepth = ihdr.readUInt8(8), colorType = ihdr.readUInt8(9);
const interlace = ihdr.readUInt8(12);
console.log('src', W + 'x' + H, 'bitDepth', bitDepth, 'colorType', colorType, 'interlace', interlace);
if (bitDepth !== 8 || interlace !== 0) { console.error('UNSUPPORTED bitDepth/interlace'); process.exit(2); }

const channelsByType = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const ch = channelsByType[colorType];
if (!ch) { console.error('UNSUPPORTED colorType ' + colorType); process.exit(2); }

const raw = zlib.inflateSync(Buffer.concat(idat));
const bpp = ch;
const stride = W * bpp;
const recon = Buffer.alloc(H * stride);
function paeth(a, b, c) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
let pos = 0;
for (let y = 0; y < H; y++) {
  const ft = raw[pos++];
  for (let x = 0; x < stride; x++) {
    const v = raw[pos++];
    const a = x >= bpp ? recon[y * stride + x - bpp] : 0;
    const b = y > 0 ? recon[(y - 1) * stride + x] : 0;
    const c = x >= bpp && y > 0 ? recon[(y - 1) * stride + x - bpp] : 0;
    let r;
    if (ft === 0) r = v; else if (ft === 1) r = v + a; else if (ft === 2) r = v + b; else if (ft === 3) r = v + ((a + b) >> 1); else if (ft === 4) r = v + paeth(a, b, c); else { console.error('bad filter'); process.exit(2); }
    recon[y * stride + x] = r & 0xff;
  }
}

// --- to RGBA ---
const rgba = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) {
  let R, G, B, A = 255;
  if (colorType === 6) { R = recon[i * 4]; G = recon[i * 4 + 1]; B = recon[i * 4 + 2]; A = recon[i * 4 + 3]; }
  else if (colorType === 2) { R = recon[i * 3]; G = recon[i * 3 + 1]; B = recon[i * 3 + 2]; }
  else if (colorType === 0) { R = G = B = recon[i]; }
  else if (colorType === 4) { R = G = B = recon[i * 2]; A = recon[i * 2 + 1]; }
  else if (colorType === 3) { const idx = recon[i]; R = plte[idx * 3]; G = plte[idx * 3 + 1]; B = plte[idx * 3 + 2]; A = trns && idx < trns.length ? trns[idx] : 255; }
  rgba[i * 4] = R; rgba[i * 4 + 1] = G; rgba[i * 4 + 2] = B; rgba[i * 4 + 3] = A;
}

// --- pad to square >=256 ---
const T = Math.max(256, W, H);
const canvas = Buffer.alloc(T * T * 4, 0); // transparent
const ox = (T - W) >> 1, oy = (T - H) >> 1;
for (let y = 0; y < H; y++) {
  rgba.copy(canvas, ((oy + y) * T + ox) * 4, y * W * 4, y * W * 4 + W * 4);
}

// --- encode PNG (colorType 6, filter 0) ---
const oStride = T * 4;
const rawOut = Buffer.alloc(T * (oStride + 1));
for (let y = 0; y < T; y++) {
  rawOut[y * (oStride + 1)] = 0;
  canvas.copy(rawOut, y * (oStride + 1) + 1, y * oStride, y * oStride + oStride);
}
const compressed = zlib.deflateSync(rawOut, { level: 9 });

// CRC32
const crcTable = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const tb = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
  return Buffer.concat([len, tb, data, crc]);
}
const ihdrOut = Buffer.alloc(13);
ihdrOut.writeUInt32BE(T, 0); ihdrOut.writeUInt32BE(T, 4); ihdrOut.writeUInt8(8, 8); ihdrOut.writeUInt8(6, 9);
const pngOut = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdrOut), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0)),
]);

// --- write sidebar PNG ---
fs.writeFileSync(outPng, pngOut);
console.log('WROTE', outPng, T + 'x' + T, 'bytes', pngOut.length);

// --- wrap PNG into ICO ---
const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
const entry = Buffer.alloc(16);
entry.writeUInt8(T >= 256 ? 0 : T, 0); entry.writeUInt8(T >= 256 ? 0 : T, 1);
entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(pngOut.length, 8); entry.writeUInt32LE(22, 12);
const ico = Buffer.concat([header, entry, pngOut]);
fs.writeFileSync(outIco, ico);
console.log('WROTE', outIco, 'bytes', ico.length);
