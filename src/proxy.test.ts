import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Every website page that reads the signed-in person must be covered by the sign-in proxy, or it crashes.
// (The /rules page once shipped without being listed here; this test stops that happening again.)
// Read as text on purpose: importing the proxy would load the sign-in library.
const source = fs.readFileSync(path.resolve(process.cwd(), "src/proxy.ts"), "utf8");
const matcher = [...(source.match(/matcher:\s*\[([^\]]*)\]/)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);

describe("the sign-in proxy covers every page", () => {
  const appDir = path.resolve(process.cwd(), "src/app");
  const routes = (dir: string, prefix = ""): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      if (!e.isDirectory()) return [];
      const here = path.join(dir, e.name);
      const route = `${prefix}/${e.name}`;
      const own = fs.existsSync(path.join(here, "page.tsx")) || fs.existsSync(path.join(here, "route.ts")) ? [route] : [];
      return [...own, ...routes(here, route)];
    });
  // The agent endpoint and the discovery pages are deliberately NOT behind website sign-in.
  const agentSide = (r: string) => r === "/mcp" || r.startsWith("/.well-known");

  it("found the list", () => {
    expect(matcher.length).toBeGreaterThan(5);
  });

  it("lists every page folder except the agent side", () => {
    const missing = routes(appDir).filter((r) => !agentSide(r) && !matcher.includes(r));
    expect(missing).toEqual([]);
  });

  it("never lists the agent endpoint", () => {
    expect(matcher.some((m) => agentSide(m))).toBe(false);
  });
});
