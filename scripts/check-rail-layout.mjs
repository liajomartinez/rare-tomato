// Measures the setup header at four phone widths and fails if the logo, the three rail segments and the step label overlap or collapse.
// Needs the rendered screens first:  UX_OUT=<folder> npx vitest run --config vitest.scripts.config.mts scripts/ux-fixtures.script.ts
// Then:  UX_OUT=<folder> node scripts/check-rail-layout.mjs
// It reads boxes only; it takes no screenshots. It uses the Edge or Chrome that is already installed (set BROWSER_PATH to point at another one).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const OUT = process.env.UX_OUT;
if (!OUT) throw new Error("Set UX_OUT to the folder the fixture pages were written to.");
const CANDIDATES = [
  process.env.BROWSER_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const executablePath = CANDIDATES.find((p) => fs.existsSync(p));
if (!executablePath) throw new Error("No Edge or Chrome found. Set BROWSER_PATH.");

const WIDTHS = [360, 375, 390, 430];
// Pages whose header has finished steps (so the Done segment is a link), an active step, and steps still to come.
const PAGES = ["setup-claude-instruction", "setup-claude-check", "setup-claude-check-ready", "state-c5-2", "setup-muse-check", "setup-claude-done", "setup-claude-form"];

const overlap = (a, b) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;
const failures = [];
const browser = await chromium.launch({ executablePath });
try {
  for (const name of PAGES) {
    for (const width of WIDTHS) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      await page.goto(pathToFileURL(path.join(OUT, `${name}.html`)).href);
      await page.evaluate(() => document.fonts.ready);
      const boxes = await page.evaluate(() => {
        const box = (el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        };
        return {
          header: box(document.querySelector(".onb-hdr")),
          mark: box(document.querySelector(".onb-mark")),
          segs: [...document.querySelectorAll(".onb-seg")].map((el) => box(el.querySelector(".shape"))),
          label: box(document.querySelector(".onb-step")),
        };
      });
      const where = `${name} @${width}`;
      const { header, mark, segs, label } = boxes;
      if (segs.length !== 3) failures.push(`${where}: expected 3 rail segments, found ${segs.length}`);
      if (overlap(mark, label)) failures.push(`${where}: logo overlaps the label`);
      segs.forEach((s, i) => {
        if (overlap(mark, s)) failures.push(`${where}: logo overlaps segment ${i + 1}`);
        if (overlap(s, label)) failures.push(`${where}: segment ${i + 1} overlaps the label`);
        if (s.width < 24) failures.push(`${where}: segment ${i + 1} collapsed to ${s.width.toFixed(1)}px wide`);
        if (s.x + s.width > width + 0.5 || s.x < -0.5) failures.push(`${where}: segment ${i + 1} is outside the screen`);
        if (s.y + s.height > header.y + header.height + 0.5) failures.push(`${where}: segment ${i + 1} is outside the 56px header`);
      });
      for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) if (overlap(segs[i], segs[j])) failures.push(`${where}: segments ${i + 1} and ${j + 1} overlap`);
      const widths = segs.map((s) => s.width);
      if (Math.max(...widths) - Math.min(...widths) > 1) failures.push(`${where}: segments are not equal width (${widths.map((w) => w.toFixed(1)).join(", ")})`);
      if (label.x + label.width > width + 0.5) failures.push(`${where}: label runs off the screen`);
      if (header.height > 56.5) failures.push(`${where}: header is ${header.height}px tall, more than 56px`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`rail layout ok: ${PAGES.length} pages x ${WIDTHS.length} widths`);
