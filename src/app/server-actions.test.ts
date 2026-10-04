import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// A file marked "use server" may export only async functions (and types). Exporting a constant from one compiles in tests and in the type
// check but BREAKS THE BUILD, so this test looks for it. (It happened once with DELETE_PHRASE.)

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });

describe("server action files export only async functions", () => {
  const files = walk(path.resolve(process.cwd(), "src/app")).filter((f) => /^\s*["']use server["']/.test(fs.readFileSync(f, "utf8")));

  it("found the server action files", () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  it("none exports a constant, a class or a plain function", () => {
    const bad = files.flatMap((f) =>
      fs
        .readFileSync(f, "utf8")
        .split(/\r?\n/)
        .filter((l) => /^export\s+(const|let|var|class|function|default)\b/.test(l))
        .map((l) => `${path.relative(process.cwd(), f)}: ${l.trim().slice(0, 80)}`),
    );
    expect(bad).toEqual([]);
  });
});
