// Draws the PLACEHOLDER app icons (public/icons/*.png) with no dependencies: a simple red tomato with a green top on a cream square.
// They exist so the installable web app (SPEC FR-K1) works; the real art is open item O17 (a small mark under 32 px) and is Lia's
// designer's to supply. Run: node scripts/make-icons.mjs
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const CREAM = [250, 243, 224];
const RED = [193, 18, 31];
const DARK = [34, 34, 34];
const GREEN = [45, 106, 79];

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function png(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y);
      const i = y * (size * 3 + 1) + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** Colour at a point of the unit square. `scale` shrinks the mark toward the centre (the maskable icon keeps it inside the safe zone). */
function tomato(u, v, scale) {
  const x = (u - 0.5) / scale;
  const y = (v - 0.5) / scale;
  const dx = x;
  const dy = y - 0.04;
  const d = Math.hypot(dx, dy);
  if (d < 0.34 && d > 0.315) return DARK; // outline
  if (d <= 0.315) return RED;
  // the green top: three small leaves
  const leaf = (Math.abs(x) < 0.17 && y > -0.34 && y < -0.2 && Math.abs(x) < (y + 0.34) * 1.2) || (Math.abs(x) < 0.03 && y > -0.4 && y < -0.28);
  return leaf ? GREEN : CREAM;
}

const out = path.resolve(import.meta.dirname, "..", "public", "icons");
fs.mkdirSync(out, { recursive: true });
const SS = 3; // supersampling for smooth edges
function render(size, scale) {
  return png(size, (px, py) => {
    let r = 0, g = 0, b = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const c = tomato((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, scale);
        r += c[0]; g += c[1]; b += c[2];
      }
    }
    const n = SS * SS;
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  });
}
// Full-bleed squares (no pre-rounded corners). The maskable icon keeps the mark inside the centre 60%.
fs.writeFileSync(path.join(out, "apple-touch-icon.png"), render(180, 1.2));
fs.writeFileSync(path.join(out, "icon-192.png"), render(192, 1.2));
fs.writeFileSync(path.join(out, "icon-512.png"), render(512, 1.2));
fs.writeFileSync(path.join(out, "icon-maskable-512.png"), render(512, 1.0));
console.log("Wrote placeholder icons to public/icons");
