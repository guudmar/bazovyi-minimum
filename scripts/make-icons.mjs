// Draws the app icon (a few rectangles) into PNG files without any dependencies.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };

function png(size) {
  const px = Buffer.alloc(size * size * 4);
  const s = size / 64;
  const rect = (x, y, w, h, [r, g, b]) => {
    for (let j = Math.round(y * s); j < Math.round((y + h) * s); j++) for (let i = Math.round(x * s); i < Math.round((x + w) * s); i++) {
      const o = (j * size + i) * 4; px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255;
    }
  };
  rect(0, 0, 64, 64, [0xf2, 0xf4, 0xf6]);
  rect(12, 45, 40, 6, [0x14, 0x14, 0x14]);
  rect(14, 31, 14, 10, [0x14, 0x14, 0x14]);
  rect(32, 31, 18, 10, [0x1d, 0x5f, 0xbf]);
  rect(22, 17, 18, 10, [0x14, 0x14, 0x14]);
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
for (const size of [180, 192, 512]) writeFileSync(new URL(`../public/icon-${size}.png`, import.meta.url), png(size));
console.log('icons written');
