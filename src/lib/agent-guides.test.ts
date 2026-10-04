import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Guides } from "@/app/agents/Guides";
import { GUIDES, guideFor } from "./agent-guides";
import { MUSE_LIMIT } from "./strings";

// "claude.md" would be mistaken for an instruction file by coding tools, so the Claude guide is claude-ai.md.
const doc = (id: string) => fs.readFileSync(path.resolve(process.cwd(), `docs/guides/${id === "claude" ? "claude-ai" : id}.md`), "utf8");

describe("per-agent guides", () => {
  it("covers Claude, ChatGPT, Grok Bot, Muse and Instinct, with Instinct as care-sheet only", () => {
    expect(GUIDES.map((g) => g.id)).toEqual(["claude", "chatgpt", "grok", "muse", "instinct"]);
    expect(guideFor("instinct")?.mode).toBe("care_sheet");
    expect(GUIDES.filter((g) => g.mode === "live")).toHaveLength(4);
  });

  it("every guide has steps, what to expect and honest limits", () => {
    for (const g of GUIDES) {
      expect(g.steps.length, g.id).toBeGreaterThanOrEqual(3);
      expect(g.expect.length, g.id).toBeGreaterThanOrEqual(1);
      expect(g.limits.length, g.id).toBeGreaterThanOrEqual(1);
    }
  });

  it("no live guide asks the person to copy a secret, token or key", () => {
    for (const g of GUIDES.filter((x) => x.mode === "live")) {
      expect(g.steps.join(" "), g.id).not.toMatch(/\b(api key|secret|bearer|token)\b/i);
    }
  });

  it("each live guide tells the person to confirm on Your agents and to start a new chat", () => {
    for (const g of GUIDES.filter((x) => x.mode === "live")) {
      const steps = g.steps.join(" ");
      expect(steps, g.id).toMatch(/Your agents/);
      expect(steps, g.id).toMatch(/confirm/i);
      expect(steps, g.id).toMatch(/new chat/i);
    }
  });

  it("the Muse guide states the fresh-connection-then-stops limit as what we saw, and the others do not claim it", () => {
    expect(guideFor("muse")!.limits).toContain(MUSE_LIMIT);
    expect(MUSE_LIMIT).toMatch(/hour or two/);
    for (const g of GUIDES.filter((x) => x.id !== "muse")) expect(g.limits.join(" "), g.id).not.toMatch(/hour or two/);
  });

  it("the written guides in docs/guides contain every step title's first words and the right status", () => {
    for (const g of GUIDES) {
      const text = doc(g.id);
      expect(text, g.id).toMatch(/Honest limits/);
      expect(text, g.id).toContain(g.name);
    }
    expect(doc("muse")).toMatch(/hour or two/);
    expect(doc("muse")).toMatch(/Connect card/);
    expect(doc("instinct")).toMatch(/care sheet only/i);
  });

  it("the guides never say rules are enforced or that the agent will follow them", () => {
    const all = JSON.stringify(GUIDES) + ["claude", "chatgpt", "grok", "muse", "instinct", "README"].map(doc).join("\n");
    expect(all).not.toMatch(/\b(enforced|guaranteed|will follow|always follow)\b/i);
  });

  it("renders on Your agents with the address and every agent", () => {
    const html = renderToStaticMarkup(createElement(Guides, { address: "https://example.test/mcp" }));
    expect(html).toContain("https://example.test/mcp");
    for (const g of GUIDES) expect(html).toContain(g.name);
  });

  it("every live guide ends with the starter-line step (O7, approved by Lia 2026-10-03) and does not paste the line itself", () => {
    for (const g of GUIDES.filter((x) => x.mode === "live")) {
      expect(g.steps[g.steps.length - 1], g.id).toMatch(/starter line|experimental/i);
      expect(g.steps.join(" "), g.id).not.toContain("check my Rare Tomato rules");
    }
  });
});
