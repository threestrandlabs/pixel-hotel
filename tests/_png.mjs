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

// Minimal PNG reader (8-bit RGB/RGBA, non-interlaced — exactly what Playwright's
// page.screenshot() produces) so crops can be cut directly from an existing screenshot
// at exact pixel fidelity, with no browser/CDP round-trip and no recompression.
export function readPng(inPath) {
  const buf = fs.readFileSync(inPath);
  let off = 8; // skip signature
  let w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idatParts = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') {
      idatParts.push(data);
    }
    off += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`readPng: unsupported bit depth ${bitDepth}`);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const raw = zlib.inflateSync(Buffer.concat(idatParts));
  const stride = w * channels;
  const out = Buffer.alloc(w * h * 4);
  let prevRow = Buffer.alloc(stride);
  let rp = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[rp]; rp += 1;
    const row = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[rp + x];
      const a = x >= channels ? row[x - channels] : 0;
      const b = prevRow[x];
      const c = x >= channels ? prevRow[x - channels] : 0;
      let pred;
      if (filter === 0) pred = 0;
      else if (filter === 1) pred = a;
      else if (filter === 2) pred = b;
      else if (filter === 3) pred = Math.floor((a + b) / 2);
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        pred = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      } else pred = 0;
      row[x] = (rawByte + pred) & 0xff;
    }
    rp += stride;
    for (let x = 0; x < w; x++) {
      const so = x * channels;
      const dOff = (y * w + x) * 4;
      if (channels >= 3) {
        out[dOff] = row[so]; out[dOff + 1] = row[so + 1]; out[dOff + 2] = row[so + 2];
        out[dOff + 3] = channels === 4 ? row[so + 3] : 255;
      } else {
        out[dOff] = out[dOff + 1] = out[dOff + 2] = row[so]; out[dOff + 3] = 255;
      }
    }
    prevRow = row;
  }
  return { w, h, data: out };
}

// Writes a raw RGBA byte buffer (e.g. straight from canvas getImageData, so no screenshot/PNG
// recompression blur) nearest-neighbour upscaled by `scale`, for honest 8x style review crops.
export function writeRgbaPng(rgba, w, h, outPath, scale = 8) {
  const W = w * scale;
  const H = h * scale;
  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    const rowStart = y * (1 + W * 4);
    raw[rowStart] = 0; // filter: none
    const sy = Math.floor(y / scale);
    for (let x = 0; x < W; x++) {
      const sx = Math.floor(x / scale);
      const srcOff = (sy * w + sx) * 4;
      const off = rowStart + 1 + x * 4;
      raw[off] = rgba[srcOff]; raw[off + 1] = rgba[srcOff + 1]; raw[off + 2] = rgba[srcOff + 2]; raw[off + 3] = rgba[srcOff + 3];
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
  fs.writeFileSync(outPath, png);
}
