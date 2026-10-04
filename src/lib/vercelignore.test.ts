import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// .vercelignore decides what the host receives. Patterns follow .gitignore rules, so a directory name WITHOUT a leading slash matches at any depth:
// `evals/` once also excluded src/lib/evals/ and broke the remote build. This test keeps the keep-out list correct and anchored.

const lines = fs
  .readFileSync(path.resolve(process.cwd(), ".vercelignore"), "utf8")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

describe(".vercelignore", () => {
  it("keeps local secrets and project notes out of what is uploaded", () => {
    for (const must of [".env", ".env.*", "/docs/", "/evals/", ".mailmap", "node_modules/", ".next/"]) expect(lines, must).toContain(must);
    expect(lines).toContain("!.env.example");
  });

  it("anchors the top-level folders so it can never swallow a source folder of the same name", () => {
    expect(lines).not.toContain("docs/");
    expect(lines).not.toContain("evals/");
    expect(fs.existsSync(path.resolve(process.cwd(), "src/lib/evals"))).toBe(true); // the folder that was once swallowed still exists and is needed by the build
  });
});
