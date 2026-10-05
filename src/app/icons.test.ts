import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";
import { metadata, viewport } from "./layout";

const root = path.resolve(__dirname, "..", "..");
const pngSize = (file: string) => {
  const b = fs.readFileSync(file);
  expect(b.subarray(1, 4).toString()).toBe("PNG");
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};
const inPublic = (url: string) => path.join(root, "public", url);

describe("site icons and share image", () => {
  it("has a favicon.ico holding 16 and 32 pixel images", () => {
    const b = fs.readFileSync(path.join(__dirname, "favicon.ico"));
    expect(b.readUInt16LE(2)).toBe(1); // an icon file
    expect(b.readUInt16LE(4)).toBe(2); // two images
    expect([b[6], b[22]]).toEqual([16, 32]);
  });

  it("has the right pixel sizes for each icon", () => {
    expect(pngSize(inPublic("/icons/icon-16.png"))).toEqual([16, 16]);
    expect(pngSize(inPublic("/icons/icon-32.png"))).toEqual([32, 32]);
    expect(pngSize(inPublic("/icons/apple-touch-icon.png"))).toEqual([180, 180]);
    expect(pngSize(inPublic("/icons/icon-192.png"))).toEqual([192, 192]);
    expect(pngSize(inPublic("/icons/icon-512.png"))).toEqual([512, 512]);
    expect(pngSize(inPublic("/icons/icon-maskable-512.png"))).toEqual([512, 512]);
  });

  it("has a 1200x630 share image for Open Graph and Twitter, with alt text", () => {
    for (const name of ["opengraph-image", "twitter-image"]) {
      expect(pngSize(path.join(__dirname, `${name}.png`))).toEqual([1200, 630]);
      expect(fs.readFileSync(path.join(__dirname, `${name}.alt.txt`), "utf8").length).toBeGreaterThan(0);
    }
  });

  it("links the icons in the page metadata and the manifest, and every linked file exists", () => {
    const icons = metadata.icons as { icon: { url: string; sizes: string }[]; apple: { url: string; sizes: string } };
    expect(icons.icon.map((i) => i.sizes)).toEqual(["32x32", "16x16"]);
    expect(icons.apple.sizes).toBe("180x180");
    const urls = [...icons.icon.map((i) => i.url), icons.apple.url, ...(manifest().icons ?? []).map((i) => i.src)];
    for (const url of urls) expect(fs.existsSync(inPublic(url)), url).toBe(true);
    expect((manifest().icons ?? []).map((i) => i.purpose)).toContain("maskable");
    expect(manifest().name).toBe("Rare Tomato");
    expect(metadata.metadataBase).toBeInstanceOf(URL);
    expect(viewport.themeColor).toBeTruthy();
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
  });
});
