// Makes the site icons and the share image from the real tomato art in public/brand/. Nothing is redrawn: the mark is only
// scaled and centred on the paper color (--rt-paper in src/app/tokens/colors.css; this script may use token values).
// Run: node scripts/make-brand-icons.mjs   (needs the dev dependency "sharp"; it is a dev-only tool)
import fs from "node:fs";
import sharp from "sharp";

const PAPER = { r: 0xf6, g: 0xf3, b: 0xf5, alpha: 1 };
const MARK = "public/brand/logo-mark.png"; // the tomato alone, transparent corners
const LOCKUP = "public/brand/lockup-primary.png"; // tomato plus the RARE TOMATO wordmark

// The tomato centred on a square paper tile. `share` is how much of the tile the mark may fill.
async function tile(size, share) {
  const inner = Math.round(size * share);
  const mark = await sharp(MARK).resize(inner, inner, { fit: "inside" }).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: PAPER } })
    .composite([{ input: mark, gravity: "centre" }])
    .png()
    .toBuffer();
}

// A .ico file that holds PNG images (all current browsers read this form).
function ico(images) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const dirs = images.map(({ size, data }) => {
    const d = Buffer.alloc(16);
    d.writeUInt8(size, 0);
    d.writeUInt8(size, 1);
    d.writeUInt16LE(1, 4);
    d.writeUInt16LE(32, 6);
    d.writeUInt32LE(data.length, 8);
    d.writeUInt32LE(offset, 12);
    offset += data.length;
    return d;
  });
  return Buffer.concat([head, ...dirs, ...images.map((i) => i.data)]);
}

const write = (file, buf) => fs.writeFileSync(file, buf);

const png16 = await tile(16, 0.94);
const png32 = await tile(32, 0.94);
write("public/icons/icon-16.png", png16);
write("public/icons/icon-32.png", png32);
write("src/app/favicon.ico", ico([{ size: 16, data: png16 }, { size: 32, data: png32 }]));
write("public/icons/apple-touch-icon.png", await tile(180, 0.82));
write("public/icons/icon-192.png", await tile(192, 0.86));
write("public/icons/icon-512.png", await tile(512, 0.86));
// Maskable: the mark stays inside the centre 80% circle (about 56% of the side, measured on the mark's long edge).
write("public/icons/icon-maskable-512.png", await tile(512, 0.6));

// Share image, 1200x630: the lockup on paper.
const lockup = await sharp(LOCKUP).resize(1000, 480, { fit: "inside" }).toBuffer();
const share = await sharp({ create: { width: 1200, height: 630, channels: 4, background: PAPER } })
  .composite([{ input: lockup, gravity: "centre" }])
  .png()
  .toBuffer();
write("src/app/opengraph-image.png", share);
write("src/app/twitter-image.png", share);
console.log("icons written");
