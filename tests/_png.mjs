// Minimal, dependency-free PNG encoder for dumping sprites.js's logical pixel
// grids { w, h, px } (px[y][x] = '#rrggbb' | null) straight to a PNG file.
// One-off debug/screenshot tooling only — not imported by the app or tests.
import zlib from 'node:zlib';
import fs from 'node:fs';

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function hexToRgb(hex) {
  const c = hex.replace('#', '');
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}

// Writes a sprite grid at an integer pixel scale (nearest-neighbour upscale)
// so small logical-pixel sprites are inspectable at a reasonable size.
export function writeSpritePng(sprite, outPath, scale = 6) {
  const { w, h, px } = sprite;
  const W = w * scale;
  const H = h * scale;
  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    const rowStart = y * (1 + W * 4);
    raw[rowStart] = 0; // filter: none
    const sy = Math.floor(y / scale);
    for (let x = 0; x < W; x++) {
      const sx = Math.floor(x / scale);
      const color = px[sy][sx];
      const off = rowStart + 1 + x * 4;
      if (color) {
        const [r, g, b] = hexToRgb(color);
        raw[off] = r; raw[off + 1] = g; raw[off + 2] = b; raw[off + 3] = 255;
      } else {
        raw[off] = 30; raw[off + 1] = 30; raw[off + 2] = 36; raw[off + 3] = 255;
      }
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
  fs.writeFileSync(outPath, png);
}
