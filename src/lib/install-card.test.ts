import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { InstallCardView } from "@/app/InstallCard";
import { installCardState, platformFromUserAgent, type InstallInputs } from "./install-card";

// FR-K1 (manifest and icons) and FR-K2 (the install card rules). Code complete and tested here; checking it on a real iPhone and a real
// Android phone, including sign-in inside the installed app (FR-K3), is on Lia's list and has NOT been done.

const base: InstallInputs = { eligible: true, dismissed: false, installed: false, platform: "android", canPrompt: true };

describe("the install card rules (FR-K2)", () => {
  it("is never shown on a first visit: only after an agent is connected or a rule is approved", () => {
    expect(installCardState({ ...base, eligible: false })).toBe("hidden");
    expect(installCardState({ ...base, eligible: false, platform: "ios" })).toBe("hidden");
  });

  it("Android and Chrome get our own button that triggers the browser's install prompt", () => {
    expect(installCardState(base)).toBe("button");
  });

  it("iPhone Safari gets the Share, Add to Home Screen instruction, because it allows no programmatic prompt", () => {
    expect(installCardState({ ...base, platform: "ios", canPrompt: false })).toBe("ios_steps");
    const html = renderToStaticMarkup(createElement(InstallCardView, { state: "ios_steps" }));
    expect(html).toContain("Share");
    expect(html).toContain("Add to Home Screen");
    expect(html).not.toContain("<button type=\"button\" style=\"min-height:44px;padding:0.5rem 1rem;font:inherit;cursor:pointer\">Add to home screen");
  });

  it("is dismissible, and a dismissal is remembered (it stays hidden)", () => {
    expect(installCardState({ ...base, dismissed: true })).toBe("hidden");
    expect(renderToStaticMarkup(createElement(InstallCardView, { state: "button", onDismiss: () => undefined }))).toContain("Not now");
  });

  it("is hidden once installed, everywhere", () => {
    expect(installCardState({ ...base, installed: true })).toBe("hidden");
    expect(installCardState({ ...base, installed: true, alwaysAvailable: true })).toBe("hidden");
  });

  it("is always reachable from Settings and data, even before eligibility or after a dismissal, and shows help where there is no one-tap install", () => {
    expect(installCardState({ ...base, eligible: false, alwaysAvailable: true })).toBe("button");
    expect(installCardState({ ...base, dismissed: true, alwaysAvailable: true })).toBe("button");
    expect(installCardState({ ...base, canPrompt: false, platform: "other", alwaysAvailable: true })).toBe("unsupported");
    expect(installCardState({ ...base, canPrompt: false, platform: "other" })).toBe("hidden");
  });

  it("finds the platform from the browser's description", () => {
    expect(platformFromUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit Safari")).toBe("ios");
    expect(platformFromUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari", 5)).toBe("ios"); // an iPad that says it is a Mac
    expect(platformFromUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari", 0)).toBe("other");
    expect(platformFromUserAgent("Mozilla/5.0 (Linux; Android 15) Chrome/130 Mobile")).toBe("android");
  });
});

describe("the web app manifest and icons (FR-K1)", () => {
  const m = manifest();
  it("has a name, a theme colour and a standalone display (a full-screen window)", () => {
    expect(m.name).toBe("Rare Tomato");
    expect(m.display).toBe("standalone");
    expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(m.start_url).toBe("/");
    expect(m.scope).toBe("/");
  });

  it("lists a 192 px icon, a 512 px icon and a maskable 512 px icon, and every file exists with the right size", () => {
    const icons = m.icons ?? [];
    const sizes = icons.map((i) => `${i.sizes}:${i.purpose}`);
    expect(sizes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));
    for (const icon of icons) {
      const file = path.resolve(process.cwd(), "public", icon.src.replace(/^\//, ""));
      const bytes = fs.readFileSync(file);
      expect(bytes.subarray(1, 4).toString()).toBe("PNG");
      const [w, h] = [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
      expect(`${w}x${h}`).toBe(icon.sizes);
    }
  });

  it("has a 180 px Apple touch icon that is a full-bleed square", () => {
    const bytes = fs.readFileSync(path.resolve(process.cwd(), "public/icons/apple-touch-icon.png"));
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([180, 180]);
  });

  it("the layout links the Apple touch icon and marks the app as installable", () => {
    const layout = fs.readFileSync(path.resolve(process.cwd(), "src/app/layout.tsx"), "utf8");
    expect(layout).toContain("apple-touch-icon.png");
    expect(layout).toContain("appleWebApp");
  });

  it("the install-related routes sit inside the sign-in proxy matcher only where they should", () => {
    const proxy = fs.readFileSync(path.resolve(process.cwd(), "src/proxy.ts"), "utf8");
    expect(proxy).not.toContain("/icons");
    expect(proxy).not.toContain("manifest");
  });
});
